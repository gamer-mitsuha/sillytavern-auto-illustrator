/**
 * Progress Manager Module
 * Centralized management of image generation progress tracking
 * Unifies progress widget state and regeneration tracking into a single source of truth
 *
 * Architecture: Pure domain layer using event-driven design
 * - No DOM dependencies
 * - No UI/widget coupling
 * - Emits events for all state changes
 * - Consumers (e.g., ProgressWidget) subscribe to events
 */

import {createLogger} from './logger';

const logger = createLogger('ProgressManager');

/**
 * Internal state for tracking task progress per message
 */
interface TaskState {
  total: number; // Total number of tasks (pending + completed)
  completed: number; // Number of completed tasks (successful or failed)
  succeeded: number; // Number of successfully completed tasks
  failed: number; // Number of failed tasks
  startTime: number; // When tracking started
}

/**
 * Event detail for progress:started event
 */
export interface ProgressStartedEventDetail {
  messageId: number;
  total: number;
}

/**
 * Event detail for progress:updated event
 */
export interface ProgressUpdatedEventDetail {
  messageId: number;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
}

/**
 * Event detail for progress:all-tasks-complete event
 * Emitted when all currently registered tasks are complete (completed === total)
 * NOTE: More tasks may still be added! This does NOT mean the operation is finished.
 */
export interface ProgressAllTasksCompleteEventDetail {
  messageId: number;
  total: number;
  succeeded: number;
  failed: number;
  duration: number; // milliseconds
}

/**
 * Event detail for progress:cleared event
 * Emitted when tracking is cleared (operation finished, no more tasks coming)
 * This is when the widget should hide.
 */
export interface ProgressClearedEventDetail {
  messageId: number;
}

/**
 * Event detail for progress:image-completed event
 * Emitted when an image generation completes during streaming
 * Allows UI to show preview of completed images before insertion
 */
export interface ProgressImageCompletedEventDetail {
  messageId: number;
  imageUrl: string;
  promptText: string;
  promptPreview: string;
  completedAt: number;
}

/**
 * Centralized progress manager for image generation tasks
 * Pure domain layer with no UI dependencies
 *
 * Key features:
 * - Idempotent task registration (multiple calls just increment total)
 * - Event-driven architecture (emits events for all state changes)
 * - Single source of truth for all generation types (streaming, batch, regeneration)
 * - Success/failure tracking for detailed progress reporting
 *
 * Events emitted:
 * - progress:started - When tracking begins (first task registered)
 * - progress:updated - When task state changes or total changes
 * - progress:all-tasks-complete - When all CURRENT tasks complete (more may be added)
 * - progress:cleared - When tracking is cleared (operation finished, widget can hide)
 * - progress:image-completed - When an image completes during streaming (for preview UI)
 */
export class ProgressManager extends EventTarget {
  private states: Map<number, TaskState> = new Map();

  constructor() {
    super();
  }

  /**
   * Registers new task(s) for a message
   * On first call: initializes tracking and emits progress:started
   * On subsequent calls: increments total and emits progress:updated
   *
   * @param messageId - Message ID to track
   * @param incrementBy - Number of tasks to add (default: 1)
   * @returns New cumulative total task count
   */
  registerTask(messageId: number, incrementBy = 1): number {
    const existing = this.states.get(messageId);

    if (existing) {
      // Increment total for subsequent registrations
      existing.total += incrementBy;
      this.emitUpdated(messageId, existing);
      logger.debug(
        `Registered ${incrementBy} task(s) for message ${messageId}: ${existing.completed}/${existing.total} (${existing.succeeded} ok, ${existing.failed} failed)`
      );
      return existing.total;
    } else {
      // Initialize tracking for first registration
      const newState: TaskState = {
        total: incrementBy,
        completed: 0,
        succeeded: 0,
        failed: 0,
        startTime: Date.now(),
      };
      this.states.set(messageId, newState);
      this.emitStarted(messageId, incrementBy);
      logger.debug(
        `Initialized tracking for message ${messageId}: 0/${incrementBy} tasks`
      );
      return incrementBy;
    }
  }

  /**
   * Marks one task as completed (successful)
   * Emits progress:updated event, does NOT auto-clear
   * This allows streaming sessions to continue tracking even when current tasks complete
   *
   * @param messageId - Message ID
   */
  completeTask(messageId: number): void {
    const state = this.states.get(messageId);
    if (!state) {
      logger.warn(
        `Cannot complete task for message ${messageId}: not being tracked`
      );
      return;
    }

    // Boundary validation: prevent over-completion
    if (state.completed >= state.total) {
      logger.warn(
        `Attempted to complete beyond total for message ${messageId}: ` +
          `${state.completed}/${state.total}. This indicates a bug in the calling code ` +
          '(double completion or missing registerTask).'
      );
      return; // Don't increment further
    }

    state.completed++;
    state.succeeded++;
    logger.debug(
      `Completed task for message ${messageId}: ${state.completed}/${state.total} (${state.succeeded} ok, ${state.failed} failed)`
    );

    this.emitUpdated(messageId, state);

    // Check if all complete and emit all-tasks-complete event
    if (state.completed >= state.total) {
      this.emitAllTasksComplete(messageId, state);
    }
  }

  /**
   * Marks one task as failed
   * Treats failure as completion for progress tracking purposes
   * Emits progress:updated event, does NOT auto-clear
   *
   * @param messageId - Message ID
   */
  failTask(messageId: number): void {
    const state = this.states.get(messageId);
    if (!state) {
      logger.warn(
        `Cannot fail task for message ${messageId}: not being tracked`
      );
      return;
    }

    // Boundary validation: prevent over-completion
    if (state.completed >= state.total) {
      logger.warn(
        `Attempted to fail beyond total for message ${messageId}: ` +
          `${state.completed}/${state.total}. This indicates a bug in the calling code ` +
          '(double completion or missing registerTask).'
      );
      return; // Don't increment further
    }

    state.completed++;
    state.failed++;
    logger.debug(
      `Failed task for message ${messageId}: ${state.completed}/${state.total} (${state.succeeded} ok, ${state.failed} failed)`
    );

    this.emitUpdated(messageId, state);

    // Check if all complete and emit all-tasks-complete event
    if (state.completed >= state.total) {
      this.emitAllTasksComplete(messageId, state);
    }
  }

  /**
   * Updates the total count without changing completed count
   * Used when new prompts are discovered during streaming
   * Emits progress:updated event
   *
   * @param messageId - Message ID
   * @param newTotal - New total task count
   */
  updateTotal(messageId: number, newTotal: number): void {
    const state = this.states.get(messageId);
    if (!state) {
      logger.warn(
        `Cannot update total for message ${messageId}: not being tracked`
      );
      return;
    }

    state.total = newTotal;
    this.emitUpdated(messageId, state);
    logger.debug(
      `Updated total for message ${messageId}: ${state.completed}/${state.total} (${state.succeeded} ok, ${state.failed} failed)`
    );
  }

  /**
   * Clears all tracking for a message
   * Emits progress:cleared event (widget will hide)
   *
   * WHEN TO CALL (Operation Boundaries):
   * 1. Streaming operations: Call after LLM streaming completes/fails/cancels
   *    - NOT after each individual task completes during streaming
   *    - More tasks may be added dynamically during streaming
   * 2. Batch operations: Call after the entire batch completes
   *    - After all images in a batch have been generated
   * 3. Manual operations: Call only if isComplete() returns true
   *    - Multiple regeneration tasks may be queued
   *    - Check completion before clearing
   *
   * WHY: Tasks may be registered dynamically (streaming mode) or queued
   * (manual regeneration). Clearing should respect operation boundaries,
   * not task boundaries.
   *
   * @param messageId - Message ID to clear tracking for
   */
  clear(messageId: number): void {
    const removed = this.states.delete(messageId);
    if (removed) {
      this.emitCleared(messageId);
      logger.debug(`Cleared tracking for message ${messageId}`);
    }
  }

  /**
   * Gets current state for a message (for debugging/UI)
   *
   * @param messageId - Message ID
   * @returns Current state or null if not tracked
   */
  getState(messageId: number): {
    current: number;
    total: number;
    succeeded: number;
    failed: number;
  } | null {
    const state = this.states.get(messageId);
    if (!state) {
      return null;
    }
    return {
      current: state.completed,
      total: state.total,
      succeeded: state.succeeded,
      failed: state.failed,
    };
  }

  /**
   * Checks if all tasks for a message are complete
   *
   * @param messageId - Message ID
   * @returns True if completed >= total
   */
  isComplete(messageId: number): boolean {
    const state = this.states.get(messageId);
    if (!state) {
      return false;
    }
    return state.completed >= state.total;
  }

  /**
   * Checks if a message is currently being tracked
   *
   * @param messageId - Message ID
   * @returns True if tracking is active
   */
  isTracking(messageId: number): boolean {
    return this.states.has(messageId);
  }

  /**
   * Gets all tracked message IDs
   *
   * @returns Array of message IDs currently being tracked
   */
  getTrackedMessageIds(): number[] {
    return Array.from(this.states.keys());
  }

  /**
   * Waits for all tasks to complete for a specific message
   * Returns a promise that resolves when completed >= total
   * Used for explicit await conditions in unified generation pipeline
   *
   * @param messageId - Message ID to wait for
   * @param options - Optional timeout and abort signal
   * @returns Promise that resolves when all tasks complete
   * @throws Error if timeout expires or operation is aborted
   */
  async waitAllComplete(
    messageId: number,
    options?: {timeoutMs?: number; signal?: AbortSignal}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const state = this.states.get(messageId);

      // If not tracking or already complete, resolve immediately
      if (!state) {
        logger.debug(
          `waitAllComplete: message ${messageId} not tracked, resolving immediately`
        );
        resolve();
        return;
      }

      if (state.completed >= state.total) {
        logger.debug(
          `waitAllComplete: message ${messageId} already complete (${state.completed}/${state.total}), resolving immediately`
        );
        resolve();
        return;
      }

      // Set up listeners and cleanup
      let timer: ReturnType<typeof setTimeout> | null = null;

      const checkComplete = (event: Event) => {
        const detail = (event as CustomEvent<ProgressUpdatedEventDetail>)
          .detail;
        if (detail.messageId === messageId) {
          const currentState = this.states.get(messageId);
          if (!currentState || currentState.completed >= currentState.total) {
            cleanup();
            logger.debug(
              `waitAllComplete: message ${messageId} completed (${currentState?.completed}/${currentState?.total})`
            );
            resolve();
          }
        }
      };

      const onTimeout = () => {
        cleanup();
        const currentState = this.states.get(messageId);
        const progress = currentState
          ? `${currentState.completed}/${currentState.total}`
          : 'unknown';
        reject(
          new Error(
            `Timeout waiting for message ${messageId} tasks to complete (progress: ${progress})`
          )
        );
      };

      const onAbort = () => {
        cleanup();
        reject(new Error(`Aborted waiting for message ${messageId}`));
      };

      const cleanup = () => {
        this.removeEventListener('progress:updated', checkComplete);
        this.removeEventListener('progress:all-tasks-complete', checkComplete);
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (options?.signal) {
          options.signal.removeEventListener('abort', onAbort);
        }
      };

      // Listen for progress updates
      this.addEventListener('progress:updated', checkComplete);
      this.addEventListener('progress:all-tasks-complete', checkComplete);

      // Set up timeout if specified
      if (options?.timeoutMs) {
        timer = setTimeout(onTimeout, options.timeoutMs);
      }

      // Set up abort signal if provided
      if (options?.signal) {
        if (options.signal.aborted) {
          cleanup();
          reject(new Error('Already aborted'));
          return;
        }
        options.signal.addEventListener('abort', onAbort);
      }

      logger.debug(
        `waitAllComplete: waiting for message ${messageId} (${state.completed}/${state.total})`
      );
    });
  }

  /**
   * Decrements the total count (used when a task is cancelled before starting)
   * Emits progress:updated event
   *
   * @param messageId - Message ID
   * @param decrementBy - Number of tasks to remove (default: 1)
   */
  decrementTotal(messageId: number, decrementBy = 1): void {
    const state = this.states.get(messageId);
    if (!state) {
      logger.warn(
        `Cannot decrement total for message ${messageId}: not being tracked`
      );
      return;
    }

    state.total = Math.max(0, state.total - decrementBy);
    logger.debug(
      `Decremented total by ${decrementBy} for message ${messageId}: ${state.completed}/${state.total} (${state.succeeded} ok, ${state.failed} failed)`
    );

    // If total is now 0 or completed >= total, clean up
    if (state.total === 0 || state.completed >= state.total) {
      this.clear(messageId);
    } else {
      this.emitUpdated(messageId, state);
    }
  }

  /**
   * Emits progress:started event
   * @private
   */
  private emitStarted(messageId: number, total: number): void {
    const detail: ProgressStartedEventDetail = {messageId, total};
    this.dispatchEvent(
      new CustomEvent('progress:started', {detail, bubbles: false})
    );
    logger.trace(`Emitted progress:started for message ${messageId}`);
  }

  /**
   * Emits progress:updated event
   * @private
   */
  private emitUpdated(messageId: number, state: TaskState): void {
    const detail: ProgressUpdatedEventDetail = {
      messageId,
      total: state.total,
      completed: state.completed,
      succeeded: state.succeeded,
      failed: state.failed,
    };
    this.dispatchEvent(
      new CustomEvent('progress:updated', {detail, bubbles: false})
    );
    logger.trace(
      `Emitted progress:updated for message ${messageId}: ${state.completed}/${state.total}`
    );
  }

  /**
   * Emits progress:all-tasks-complete event
   * @private
   */
  private emitAllTasksComplete(messageId: number, state: TaskState): void {
    const duration = Date.now() - state.startTime;
    const detail: ProgressAllTasksCompleteEventDetail = {
      messageId,
      total: state.total,
      succeeded: state.succeeded,
      failed: state.failed,
      duration,
    };
    this.dispatchEvent(
      new CustomEvent('progress:all-tasks-complete', {detail, bubbles: false})
    );
    logger.trace(
      `Emitted progress:all-tasks-complete for message ${messageId} (duration: ${duration}ms)`
    );
  }

  /**
   * Emits progress:cleared event
   * @private
   */
  private emitCleared(messageId: number): void {
    const detail: ProgressClearedEventDetail = {messageId};
    this.dispatchEvent(
      new CustomEvent('progress:cleared', {detail, bubbles: false})
    );
    logger.trace(`Emitted progress:cleared for message ${messageId}`);
  }

  /**
   * Emits progress:image-completed event
   * Called externally when an image generation completes during streaming
   *
   * @param messageId - Message ID
   * @param imageUrl - URL of completed image
   * @param promptText - Full prompt text
   * @param promptPreview - Truncated prompt for display
   */
  emitImageCompleted(
    messageId: number,
    imageUrl: string,
    promptText: string,
    promptPreview: string
  ): void {
    const detail: ProgressImageCompletedEventDetail = {
      messageId,
      imageUrl,
      promptText,
      promptPreview,
      completedAt: Date.now(),
    };
    this.dispatchEvent(
      new CustomEvent('progress:image-completed', {detail, bubbles: false})
    );
    logger.trace(
      `Emitted progress:image-completed for message ${messageId}: ${promptPreview}`
    );
  }
}

// Export singleton instance
export const progressManager = new ProgressManager();

/**
 * Helper function: Marks a task as failed and clears progress if all tasks complete
 * Use this in manual generation operations where each task is independent.
 * For streaming operations, use failTask() + manual clear after streaming ends.
 *
 * @param messageId - Message ID
 */
export function failTaskAndClearIfComplete(messageId: number): void {
  progressManager.failTask(messageId);
  if (progressManager.isComplete(messageId)) {
    progressManager.clear(messageId);
  }
}
