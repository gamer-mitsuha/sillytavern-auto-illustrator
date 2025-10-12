/**
 * Progress Manager Module
 * Centralized management of image generation progress tracking
 * Unifies progress widget state and regeneration tracking into a single source of truth
 */

import {addMessageProgress, removeMessageProgress} from './progress_widget';
import {createLogger} from './logger';

const logger = createLogger('ProgressManager');

/**
 * Internal state for tracking task progress per message
 */
interface TaskState {
  total: number; // Total number of tasks (pending + completed)
  completed: number; // Number of completed tasks (successful or failed)
  startTime: number; // When tracking started
}

/**
 * Centralized progress manager for image generation tasks
 * Manages cumulative progress tracking and widget lifecycle
 *
 * Key features:
 * - Idempotent task registration (multiple calls just increment total)
 * - Automatic widget management (create/update/remove)
 * - Single source of truth for all generation types (streaming, batch, regeneration)
 */
export class ProgressManager {
  private states: Map<number, TaskState> = new Map();

  /**
   * Registers new task(s) for a message
   * On first call: initializes tracking and creates widget
   * On subsequent calls: increments total and updates widget
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
      addMessageProgress(messageId, existing.completed, existing.total);
      logger.debug(
        `Registered ${incrementBy} task(s) for message ${messageId}: ${existing.completed}/${existing.total}`
      );
      return existing.total;
    } else {
      // Initialize tracking for first registration
      const newState: TaskState = {
        total: incrementBy,
        completed: 0,
        startTime: Date.now(),
      };
      this.states.set(messageId, newState);
      addMessageProgress(messageId, 0, incrementBy);
      logger.debug(
        `Initialized tracking for message ${messageId}: 0/${incrementBy} tasks`
      );
      return incrementBy;
    }
  }

  /**
   * Marks one task as completed (successful)
   * Updates widget but does NOT auto-clear (caller must call clear() explicitly)
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

    state.completed++;
    logger.debug(
      `Completed task for message ${messageId}: ${state.completed}/${state.total}`
    );

    // Update widget
    addMessageProgress(messageId, state.completed, state.total);

    // Note: Do NOT auto-clear here. Caller must call clear() explicitly.
    // This is important for streaming where more tasks may be discovered.
  }

  /**
   * Marks one task as failed
   * Treats failure as completion for progress tracking purposes
   * Updates widget but does NOT auto-clear (caller must call clear() explicitly)
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

    state.completed++;
    logger.debug(
      `Failed task for message ${messageId}: ${state.completed}/${state.total}`
    );

    // Update widget
    addMessageProgress(messageId, state.completed, state.total);

    // Note: Do NOT auto-clear here. Caller must call clear() explicitly.
  }

  /**
   * Updates the total count without changing completed count
   * Used when new prompts are discovered during streaming
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
    addMessageProgress(messageId, state.completed, state.total);
    logger.debug(
      `Updated total for message ${messageId}: ${state.completed}/${state.total}`
    );
  }

  /**
   * Clears all tracking for a message and removes widget
   *
   * @param messageId - Message ID
   */
  clear(messageId: number): void {
    const removed = this.states.delete(messageId);
    if (removed) {
      removeMessageProgress(messageId);
      logger.debug(`Cleared tracking for message ${messageId}`);
    }
  }

  /**
   * Gets current state for a message (for debugging/UI)
   *
   * @param messageId - Message ID
   * @returns Current state or null if not tracked
   */
  getState(messageId: number): {current: number; total: number} | null {
    const state = this.states.get(messageId);
    if (!state) {
      return null;
    }
    return {
      current: state.completed,
      total: state.total,
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
   * Decrements the total count (used when a task is cancelled before starting)
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
      `Decremented total by ${decrementBy} for message ${messageId}: ${state.completed}/${state.total}`
    );

    // If total is now 0 or completed >= total, clean up
    if (state.total === 0 || state.completed >= state.total) {
      this.clear(messageId);
    } else {
      addMessageProgress(messageId, state.completed, state.total);
    }
  }
}

// Export singleton instance
export const progressManager = new ProgressManager();
