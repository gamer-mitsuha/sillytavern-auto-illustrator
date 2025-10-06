/**
 * Queue Processor Module
 * Processes image generation queue asynchronously
 */

import {ImageGenerationQueue, QueuedPrompt} from './streaming_image_queue';
import {generateImage} from './image_generator';

/**
 * Deferred image for batch insertion after streaming
 */
export interface DeferredImage {
  prompt: QueuedPrompt;
  imageUrl: string;
}

/**
 * Processes queued image generation prompts
 */
export class QueueProcessor {
  private queue: ImageGenerationQueue;
  private context: SillyTavernContext;
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
   * @param context - SillyTavern context
   * @param maxConcurrent - Maximum concurrent generations (default: 1)
   */
  constructor(
    queue: ImageGenerationQueue,
    context: SillyTavernContext,
    maxConcurrent = 1
  ) {
    this.queue = queue;
    this.context = context;
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Starts processing the queue with deferred insertions
   * Images are generated during processing but inserted in batch after completion
   * @param messageId - Message being generated
   */
  start(messageId: number): void {
    if (this.isRunning) {
      console.warn(
        '[Auto Illustrator Processor] Already running, stopping previous processor'
      );
      this.stop();
    }

    this.messageId = messageId;
    this.isRunning = true;
    this.activeGenerations = 0;
    this.deferredImages = [];

    console.log(
      `[Auto Illustrator Processor] Starting processor for message ${messageId} (max concurrent: ${this.maxConcurrent})`
    );

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

    console.log('[Auto Illustrator Processor] Stopping processor');
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
        console.log(
          '[Auto Illustrator Processor] No pending prompts, waiting...'
        );
        return;
      }

      console.log(
        `[Auto Illustrator Processor] Processing prompt: ${nextPrompt.id}`
      );

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
          console.error(
            '[Auto Illustrator Processor] Unexpected error:',
            error
          );
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
      console.error(
        '[Auto Illustrator Processor] Error in processNext:',
        error
      );
      this.isProcessing = false;
    }
  }

  /**
   * Generates an image for a queued prompt
   * @param prompt - Queued prompt to process
   */
  private async generateImageForPrompt(prompt: QueuedPrompt): Promise<void> {
    try {
      console.log(
        `[Auto Illustrator Processor] Generating image for: ${prompt.prompt}`
      );

      const imageUrl = await generateImage(prompt.prompt, this.context);

      if (imageUrl) {
        // Success
        this.queue.updateState(prompt.id, 'COMPLETED', {imageUrl});
        console.log(
          `[Auto Illustrator Processor] Generated image: ${imageUrl}`
        );

        // Store for later batch insertion (after streaming completes)
        this.deferredImages.push({prompt, imageUrl});
        console.log(
          `[Auto Illustrator Processor] Deferred image insertion (${this.deferredImages.length} total)`
        );
      } else {
        // Failed
        this.queue.updateState(prompt.id, 'FAILED', {
          error: 'Image generation returned null',
        });
        console.warn(
          `[Auto Illustrator Processor] Failed to generate image for: ${prompt.prompt}`
        );
      }
    } catch (error) {
      // Error
      this.queue.updateState(prompt.id, 'FAILED', {
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(
        '[Auto Illustrator Processor] Error generating image:',
        error
      );
    }
  }

  /**
   * Processes all remaining prompts in the queue
   * Used when streaming ends to ensure all images are generated
   * Processes sequentially to respect maxConcurrent limit and avoid 429 errors
   * @returns Promise that resolves when all prompts are processed
   */
  async processRemaining(): Promise<void> {
    console.log('[Auto Illustrator Processor] Processing remaining prompts...');

    // Wait for any active generations to complete first
    // This prevents concurrent execution beyond maxConcurrent limit
    while (this.activeGenerations > 0) {
      console.log(
        `[Auto Illustrator Processor] Waiting for ${this.activeGenerations} active generations to complete...`
      );
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const pending = this.queue.getPromptsByState('QUEUED');
    console.log(
      `[Auto Illustrator Processor] ${pending.length} prompts remaining`
    );

    if (pending.length === 0) {
      return;
    }

    // Process remaining prompts sequentially to respect maxConcurrent
    // This prevents 429 "Too Many Requests" errors from NovelAI
    for (const prompt of pending) {
      await this.generateImageForPrompt(prompt);
    }

    console.log(
      '[Auto Illustrator Processor] Finished processing remaining prompts'
    );
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
