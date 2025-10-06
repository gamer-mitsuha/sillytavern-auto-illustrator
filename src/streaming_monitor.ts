/**
 * Streaming Monitor Module
 * Monitors streaming text for new image prompts
 */

import {extractImagePrompts} from './image_extractor';
import {ImageGenerationQueue} from './streaming_image_queue';
import type {ImagePromptMatch} from './types';

/**
 * Monitors streaming message text for new image prompts
 */
export class StreamingMonitor {
  private messageId = -1;
  private lastSeenText = '';
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private queue: ImageGenerationQueue;
  private context: SillyTavernContext;
  private intervalMs: number;
  private isRunning = false;
  private onNewPromptsCallback?: () => void;

  /**
   * Creates a new streaming monitor
   * @param queue - Image generation queue
   * @param context - SillyTavern context
   * @param intervalMs - Polling interval in milliseconds
   * @param onNewPrompts - Optional callback when new prompts are added
   */
  constructor(
    queue: ImageGenerationQueue,
    context: SillyTavernContext,
    intervalMs = 300,
    onNewPrompts?: () => void
  ) {
    this.queue = queue;
    this.context = context;
    this.intervalMs = intervalMs;
    this.onNewPromptsCallback = onNewPrompts;
  }

  /**
   * Starts monitoring a message for new prompts
   * @param messageId - Index of the message in chat array
   */
  start(messageId: number): void {
    if (this.isRunning) {
      console.warn(
        '[Auto Illustrator Monitor] Already running, stopping previous monitor'
      );
      this.stop();
    }

    this.messageId = messageId;
    this.lastSeenText = '';
    this.isRunning = true;

    console.log(
      `[Auto Illustrator Monitor] Starting monitor for message ${messageId} (interval: ${this.intervalMs}ms)`
    );

    // Start polling
    this.pollInterval = setInterval(() => {
      this.checkForNewPrompts();
    }, this.intervalMs);

    // Do an immediate check
    this.checkForNewPrompts();
  }

  /**
   * Stops monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[Auto Illustrator Monitor] Stopping monitor');
    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.messageId = -1;
    this.lastSeenText = '';
  }

  /**
   * Checks for new prompts in the current message text
   * Called by the polling interval
   */
  private checkForNewPrompts(): void {
    if (!this.isRunning || this.messageId < 0) {
      return;
    }

    // Get current message text
    const message = this.context.chat?.[this.messageId];
    if (!message) {
      console.warn(
        '[Auto Illustrator Monitor] Message not found:',
        this.messageId
      );
      return;
    }

    const currentText = message.mes || '';

    // Early exit if text hasn't changed
    if (currentText === this.lastSeenText) {
      return;
    }

    console.log(
      `[Auto Illustrator Monitor] Text changed (${this.lastSeenText.length} -> ${currentText.length} chars)`
    );

    // Extract new prompts
    const newPrompts = this.extractNewPrompts(currentText);

    if (newPrompts.length > 0) {
      console.log(
        `[Auto Illustrator Monitor] Found ${newPrompts.length} new prompts`
      );

      for (const match of newPrompts) {
        this.queue.addPrompt(match.prompt, match.startIndex, match.endIndex);
      }

      // Notify processor that new prompts are available
      if (this.onNewPromptsCallback) {
        this.onNewPromptsCallback();
      }
    }

    this.lastSeenText = currentText;
  }

  /**
   * Extracts prompts that haven't been seen before
   * @param currentText - Current message text
   * @returns Array of new prompt matches
   */
  private extractNewPrompts(currentText: string): ImagePromptMatch[] {
    const allPrompts = extractImagePrompts(currentText);
    const newPrompts: ImagePromptMatch[] = [];

    for (const match of allPrompts) {
      // Check if this prompt text is already in the queue (ignore position)
      // This prevents duplicates when text positions shift after image insertion
      if (!this.queue.hasPromptByText(match.prompt)) {
        newPrompts.push(match);
      }
    }

    return newPrompts;
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
