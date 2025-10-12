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
 * Event detail for progress:ended event
 */
export interface ProgressEndedEventDetail {
  messageId: number;
  total: number;
  succeeded: number;
  failed: number;
  duration: number; // milliseconds
}

/**
 * Event detail for progress:cancelled event
 */
export interface ProgressCancelledEventDetail {
  messageId: number;
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
 * - progress:started - When tracking begins for a message
 * - progress:updated - When task completed/failed or total changed
 * - progress:ended - When all tasks complete
 * - progress:cancelled - When tracking is cancelled
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

    state.completed++;
    state.succeeded++;
    logger.debug(
      `Completed task for message ${messageId}: ${state.completed}/${state.total} (${state.succeeded} ok, ${state.failed} failed)`
    );

    this.emitUpdated(messageId, state);

    // Check if all complete and emit ended event
    if (state.completed >= state.total) {
      this.emitEnded(messageId, state);
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

    state.completed++;
    state.failed++;
    logger.debug(
      `Failed task for message ${messageId}: ${state.completed}/${state.total} (${state.succeeded} ok, ${state.failed} failed)`
    );

    this.emitUpdated(messageId, state);

    // Check if all complete and emit ended event
    if (state.completed >= state.total) {
      this.emitEnded(messageId, state);
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
   * Emits progress:cancelled event
   *
   * @param messageId - Message ID
   */
  clear(messageId: number): void {
    const removed = this.states.delete(messageId);
    if (removed) {
      this.emitCancelled(messageId);
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
   * Emits progress:ended event
   * @private
   */
  private emitEnded(messageId: number, state: TaskState): void {
    const duration = Date.now() - state.startTime;
    const detail: ProgressEndedEventDetail = {
      messageId,
      total: state.total,
      succeeded: state.succeeded,
      failed: state.failed,
      duration,
    };
    this.dispatchEvent(
      new CustomEvent('progress:ended', {detail, bubbles: false})
    );
    logger.trace(
      `Emitted progress:ended for message ${messageId} (duration: ${duration}ms)`
    );
  }

  /**
   * Emits progress:cancelled event
   * @private
   */
  private emitCancelled(messageId: number): void {
    const detail: ProgressCancelledEventDetail = {messageId};
    this.dispatchEvent(
      new CustomEvent('progress:cancelled', {detail, bubbles: false})
    );
    logger.trace(`Emitted progress:cancelled for message ${messageId}`);
  }
}

// Export singleton instance
export const progressManager = new ProgressManager();
