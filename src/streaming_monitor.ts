/**
 * Streaming Monitor Module (v2)
 * Monitors streaming text for new image prompts
 *
 * Updates:
 * - Removed Barrier dependency (uses callback instead)
 * - Uses regex for prompt extraction
 * - Uses prompt_manager for metadata tracking
 * - Updates progress manager with totals
 */

import {extractImagePromptsMultiPattern} from './regex';
import {ImageGenerationQueue} from './streaming_image_queue';
import type {ImagePromptMatch} from './types';
import {createLogger} from './logger';
import {progressManager} from './progress_manager';
import {registerPrompt} from './prompt_manager';
import {getMetadata} from './metadata';

const logger = createLogger('Monitor');

/**
 * Monitors streaming message text for new image prompts
 */
export class StreamingMonitor {
  private messageId = -1;
  private lastSeenText = '';
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private queue: ImageGenerationQueue;
  private settings: AutoIllustratorSettings;
  private intervalMs: number;
  private isRunning = false;
  private onNewPromptsCallback?: () => void;
  private onTextUpdateCallback?: (text: string) => void;
  private hasSeenFirstToken = false;

  /**
   * Creates a new streaming monitor
   * @param queue - Image generation queue
   * @param settings - Extension settings
   * @param intervalMs - Polling interval in milliseconds
   * @param onNewPrompts - Optional callback when new prompts are added
   * @param onTextUpdate - Optional callback when streaming text updates
   */
  constructor(
    queue: ImageGenerationQueue,
    settings: AutoIllustratorSettings,
    intervalMs = 300,
    onNewPrompts?: () => void,
    onTextUpdate?: (text: string) => void
  ) {
    this.queue = queue;
    this.settings = settings;
    this.intervalMs = intervalMs;
    this.onNewPromptsCallback = onNewPrompts;
    this.onTextUpdateCallback = onTextUpdate;
  }

  /**
   * Starts monitoring a message for new prompts
   * @param messageId - Index of the message in chat array
   */
  async start(messageId: number): Promise<void> {
    if (this.isRunning) {
      logger.warn('Already running, stopping previous monitor');
      this.stop();
    }

    this.messageId = messageId;
    this.lastSeenText = '';
    this.isRunning = true;
    this.hasSeenFirstToken = false;

    logger.debug(
      `Starting monitor for message ${messageId} (interval: ${this.intervalMs}ms)`
    );

    // Register message for progress tracking immediately (total=0 initially)
    // This ensures the message is always tracked, eliminating any race conditions
    progressManager.registerTask(messageId, 0);

    // Start polling
    this.pollInterval = setInterval(() => {
      this.checkForNewPrompts();
    }, this.intervalMs);

    // Do an immediate check (await to ensure prompts are registered before any image generation)
    await this.checkForNewPrompts();
  }

  /**
   * Stops monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.debug('Stopping monitor');
    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.messageId = -1;
    this.lastSeenText = '';
  }

  /**
   * Performs a final scan for any remaining prompts
   * Should be called before stopping the monitor to catch any last-moment prompts
   */
  async finalScan(): Promise<void> {
    logger.debug('Performing final scan for remaining prompts');
    await this.checkForNewPrompts();
  }

  /**
   * Checks for new prompts in the current message text
   * Called by the polling interval
   */
  private async checkForNewPrompts(): Promise<void> {
    if (!this.isRunning || this.messageId < 0) {
      return;
    }

    // Get current message text (get fresh context each time!)
    const context = SillyTavern.getContext();
    if (!context) {
      logger.warn('Failed to get context');
      return;
    }

    const message = context.chat?.[this.messageId];
    if (!message) {
      // Message may not exist yet during early streaming - this is normal
      logger.trace(
        `Message ${this.messageId} not found yet (will retry on next poll)`
      );
      return;
    }

    const currentText = message.mes || '';

    // Early exit if text hasn't changed
    if (currentText === this.lastSeenText) {
      return;
    }

    // Only log on first token to reduce noise
    if (!this.hasSeenFirstToken) {
      logger.debug(
        `First token received for message ${this.messageId} (${currentText.length} chars)`
      );
      this.hasSeenFirstToken = true;
    } else {
      logger.trace(
        `Text changed (${this.lastSeenText.length} -> ${currentText.length} chars)`
      );
    }

    // Notify text update callback for streaming preview widget
    if (this.onTextUpdateCallback) {
      this.onTextUpdateCallback(currentText);
    }

    // Extract new prompts and register them in PromptManager
    const metadata = getMetadata();
    const newPromptsWithIds = await this.extractAndRegisterNewPrompts(
      currentText,
      metadata
    );

    if (newPromptsWithIds.length > 0) {
      logger.debug(`Found ${newPromptsWithIds.length} new prompts`);

      // Add each new prompt to queue with its registered ID
      for (const {match, promptId} of newPromptsWithIds) {
        this.queue.addPrompt(
          match.prompt,
          match.fullMatch,
          match.startIndex,
          match.endIndex,
          undefined, // No regeneration metadata for new prompts
          promptId // Pass the registered prompt ID from PromptManager
        );
      }

      // Update progress manager with new total
      const newTotal = this.queue.size();

      if (!progressManager.isTracking(this.messageId)) {
        // Initialize tracking if this is the first prompt detection
        progressManager.registerTask(this.messageId, newTotal);
        logger.debug(`Initialized progress tracking: ${newTotal} prompts`);
      } else {
        // Update existing tracking with new total
        progressManager.updateTotal(this.messageId, newTotal);
        logger.debug(`Updated progress total: ${newTotal} prompts`);
      }

      // Notify processor that new prompts are available
      if (this.onNewPromptsCallback) {
        this.onNewPromptsCallback();
      }
    }

    this.lastSeenText = currentText;
  }

  /**
   * Extracts prompts that haven't been seen before and registers them in PromptManager
   * Uses regex for pattern matching
   * @param currentText - Current message text
   * @param metadata - Chat metadata for PromptManager
   * @returns Array of objects with match and registered promptId
   */
  private async extractAndRegisterNewPrompts(
    currentText: string,
    metadata: import('./types').AutoIllustratorChatMetadata
  ): Promise<Array<{match: ImagePromptMatch; promptId: string}>> {
    const patterns = this.settings.promptDetectionPatterns || [];
    const allPrompts = extractImagePromptsMultiPattern(currentText, patterns);
    const newPromptsWithIds: Array<{
      match: ImagePromptMatch;
      promptId: string;
    }> = [];

    for (let i = 0; i < allPrompts.length; i++) {
      const match = allPrompts[i];

      // Check if this prompt text is already in the queue (ignore position)
      // This prevents duplicates when text positions shift after image insertion
      if (!this.queue.hasPromptByText(match.prompt)) {
        // Register this prompt in PromptManager with correct index
        const promptNode = await registerPrompt(
          match.prompt,
          this.messageId,
          i, // Use index in allPrompts array
          'ai-message',
          metadata
        );

        newPromptsWithIds.push({
          match,
          promptId: promptNode.id,
        });
      }
    }

    return newPromptsWithIds;
  }

  /**
   * Gets the current state of the monitor
   * @returns Monitor status information
   */
  getStatus(): {
    isRunning: boolean;
    messageId: number;
    lastTextLength: number;
    intervalMs: number;
  } {
    return {
      isRunning: this.isRunning,
      messageId: this.messageId,
      lastTextLength: this.lastSeenText.length,
      intervalMs: this.intervalMs,
    };
  }

  /**
   * Checks if the monitor is currently running
   * @returns True if monitoring is active
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
