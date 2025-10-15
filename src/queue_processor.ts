/**
 * Queue Processor Module
 * Processes image generation queue asynchronously
 */

import {ImageGenerationQueue} from './streaming_image_queue';
import {generateImage} from './image_generator';
import type {QueuedPrompt, DeferredImage} from './types';
import {createLogger} from './logger';
import {progressManager} from './progress_manager';

const logger = createLogger('Processor');

/**
 * Processes queued image generation prompts
 */
export class QueueProcessor {
  private queue: ImageGenerationQueue;
  private settings: AutoIllustratorSettings;
  private messageId = -1;
  private isRunning = false;
  private isProcessing = false;
  private maxConcurrent: number;
  private activeGenerations = 0;
  private processPromise: Promise<void> | null = null;
  private deferredImages: DeferredImage[] = [];

  /**
   * Creates a new queue processor
   * @param queue - Image generation queue
   * @param settings - Extension settings
   * @param maxConcurrent - Maximum concurrent generations (default: 1)
   */
  constructor(
    queue: ImageGenerationQueue,
    settings: AutoIllustratorSettings,
    maxConcurrent = 1
  ) {
    this.queue = queue;
    this.settings = settings;
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Starts processing the queue with deferred insertions
   * Images are generated during processing but inserted in batch after completion
   * @param messageId - Message being generated
   */
  start(messageId: number): void {
    if (this.isRunning) {
      logger.warn('Already running, stopping previous processor');
      this.stop();
    }

    this.messageId = messageId;
    this.isRunning = true;
    this.activeGenerations = 0;
    this.deferredImages = [];

    logger.debug(
      `Starting processor for message ${messageId} (max concurrent: ${this.maxConcurrent})`
    );

    // Note: Progress tracking is initialized by session_manager callback
    // when first prompts are detected, not here

    // Start processing
    this.processNext();
  }

  /**
   * Stops processing the queue
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.debug('Stopping processor');
    this.isRunning = false;
    this.messageId = -1;
    // Note: we don't cancel active generations, let them complete
  }

  /**
   * Processes the next item in the queue
   * This function is recursive and will continue until queue is empty or processor is stopped
   */
  private async processNext(): Promise<void> {
    // Don't start new processing if we're stopping or already at max concurrent
    if (
      !this.isRunning ||
      this.activeGenerations >= this.maxConcurrent ||
      this.isProcessing
    ) {
      return;
    }

    this.isProcessing = true;

    try {
      const nextPrompt = this.queue.getNextPending();

      if (!nextPrompt) {
        // No more pending prompts
        this.isProcessing = false;
        logger.debug('No pending prompts, waiting...');
        return;
      }

      logger.debug(`Processing prompt: ${nextPrompt.id}`);

      // Note: Progress tracking is managed by session_manager callback
      // which initializes/updates total when prompts are detected

      // Mark as generating and increment active count
      this.queue.updateState(nextPrompt.id, 'GENERATING');
      this.activeGenerations++;

      // Generate image asynchronously
      // Don't await here - let it run in parallel
      this.generateImageForPrompt(nextPrompt)
        .then(() => {
          this.activeGenerations--;
          // Process next prompt after this one completes
          this.processNext();
        })
        .catch(error => {
          logger.error('Unexpected error:', error);
          this.activeGenerations--;
          this.processNext();
        });

      // If we're below max concurrent, try to start another generation
      if (this.activeGenerations < this.maxConcurrent) {
        this.isProcessing = false;
        setImmediate(() => this.processNext());
      } else {
        this.isProcessing = false;
      }
    } catch (error) {
      logger.error('Error in processNext:', error);
      this.isProcessing = false;
    }
  }

  /**
   * Generates an image for a queued prompt
   * @param prompt - Queued prompt to process
   */
  private async generateImageForPrompt(prompt: QueuedPrompt): Promise<void> {
    try {
      logger.debug(`Generating image for: ${prompt.prompt}`);

      // Get fresh context for each generation (never store context reference!)
      const context = SillyTavern.getContext();
      if (!context) {
        throw new Error('Failed to get SillyTavern context');
      }

      const imageUrl = await generateImage(
        prompt.prompt,
        context,
        this.settings.commonStyleTags,
        this.settings.commonStyleTagsPosition
      );

      if (imageUrl) {
        // Success
        this.queue.updateState(prompt.id, 'COMPLETED', {imageUrl});
        logger.debug(`Generated image: ${imageUrl}`);

        // Store for later batch insertion (after streaming completes)
        const promptPreview =
          prompt.prompt.length > 60
            ? prompt.prompt.substring(0, 57) + '...'
            : prompt.prompt;

        // Use targetPromptId from PromptManager (set by streaming_monitor or manual_generation)
        const promptId = prompt.targetPromptId || '';

        if (!promptId) {
          logger.error(
            `No promptId found for prompt "${prompt.prompt.substring(0, 50)}..." - images will not be linked correctly`
          );
        } else {
          logger.debug(`Using promptId from PromptManager: ${promptId}`);
        }

        this.deferredImages.push({
          prompt,
          imageUrl,
          promptId,
          promptPreview,
          completedAt: Date.now(),
        });
        logger.debug(
          `Deferred image insertion (${this.deferredImages.length} total)`
        );

        // Emit image-completed event for thumbnail preview UI
        progressManager.emitImageCompleted(
          this.messageId,
          imageUrl,
          prompt.prompt,
          promptPreview
        );

        // Update progress tracking
        progressManager.completeTask(this.messageId);
      } else {
        // Failed
        this.queue.updateState(prompt.id, 'FAILED', {
          error: 'Image generation returned null',
        });
        logger.warn(`Failed to generate image for: ${prompt.prompt}`);

        // Update progress tracking (count failed as completed)
        progressManager.failTask(this.messageId);
      }
    } catch (error) {
      // Error
      this.queue.updateState(prompt.id, 'FAILED', {
        error: error instanceof Error ? error.message : String(error),
      });
      logger.error('Error generating image:', error);

      // Update progress tracking (count error as completed)
      progressManager.failTask(this.messageId);
    }
  }

  /**
   * Processes all remaining prompts in the queue
   * Used when streaming ends to ensure all images are generated
   * Processes sequentially to respect maxConcurrent limit and avoid 429 errors
   * @returns Promise that resolves when all prompts are processed
   */
  async processRemaining(): Promise<void> {
    logger.debug('Processing remaining prompts...');

    // Wait for any active generations to complete first
    // This prevents concurrent execution beyond maxConcurrent limit
    if (this.activeGenerations > 0) {
      logger.debug(
        `Waiting for ${this.activeGenerations} active generations to complete...`
      );
      while (this.activeGenerations > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      logger.debug('All active generations completed');
    }

    const pending = this.queue.getPromptsByState('QUEUED');
    logger.debug(`${pending.length} prompts remaining`);

    if (pending.length > 0) {
      // Process remaining prompts sequentially to respect maxConcurrent
      // This prevents 429 "Too Many Requests" errors from NovelAI
      for (const prompt of pending) {
        await this.generateImageForPrompt(prompt);
      }
      logger.debug('Finished processing remaining prompts');
    }
  }

  /**
   * Triggers processing of next items in queue
   * Call this when new items are added to the queue
   */
  trigger(): void {
    if (this.isRunning && !this.isProcessing) {
      this.processNext();
    }
  }

  /**
   * Gets deferred images that are ready for batch insertion
   * @returns Array of deferred images
   */
  getDeferredImages(): DeferredImage[] {
    return this.deferredImages;
  }

  /**
   * Clears the deferred images array after batch insertion
   */
  clearDeferredImages(): void {
    this.deferredImages = [];
  }

  /**
   * Gets the current status of the processor
   * @returns Processor status information
   */
  getStatus(): {
    isRunning: boolean;
    messageId: number;
    activeGenerations: number;
    maxConcurrent: number;
    queueStats: ReturnType<ImageGenerationQueue['getStats']>;
  } {
    return {
      isRunning: this.isRunning,
      messageId: this.messageId,
      activeGenerations: this.activeGenerations,
      maxConcurrent: this.maxConcurrent,
      queueStats: this.queue.getStats(),
    };
  }
}
