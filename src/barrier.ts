/**
 * Barrier Module
 * Provides a synchronization primitive for coordinating multiple async conditions
 */

import {createLogger} from './logger';

const logger = createLogger('Barrier');

/**
 * A simple barrier that waits for multiple named conditions
 * Useful for coordinating async operations (e.g., waiting for both
 * image generation completion AND message finalization)
 *
 * @example
 * ```typescript
 * const barrier = new Barrier(['genDone', 'messageReceived']);
 *
 * // In one async context
 * barrier.arrive('genDone');
 *
 * // In another async context
 * barrier.arrive('messageReceived');
 *
 * // Wait for both
 * await barrier.whenReady;
 * // Both conditions met, proceed...
 * ```
 */
export class Barrier {
  private needed: Set<string>;
  private resolved = false;
  public readonly whenReady: Promise<void>;
  private _resolve!: () => void;
  private _reject!: (error: Error) => void;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  /**
   * Creates a new barrier
   * @param parts - Array of condition names that must arrive
   * @param timeoutMs - Optional timeout in milliseconds (no timeout if omitted)
   */
  constructor(parts: string[], timeoutMs?: number) {
    if (parts.length === 0) {
      throw new Error('Barrier must have at least one condition');
    }

    this.needed = new Set(parts);
    this.whenReady = new Promise<void>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });

    logger.debug(
      `Barrier created, waiting for: ${Array.from(parts).join(', ')}`
    );

    if (timeoutMs && timeoutMs > 0) {
      this.timeoutHandle = setTimeout(() => {
        if (!this.resolved) {
          const remaining = Array.from(this.needed);
          const error = new Error(
            `Barrier timeout after ${timeoutMs}ms. Still waiting for: ${remaining.join(', ')}`
          );
          logger.error('Barrier timeout:', error);
          this.resolved = true;
          this._reject(error);
        }
      }, timeoutMs);
    }
  }

  /**
   * Signal that a condition has been met
   * @param part - Condition name
   */
  arrive(part: string): void {
    if (this.resolved) {
      logger.warn(`Barrier already resolved, ignoring arrival of: ${part}`);
      return;
    }

    if (!this.needed.has(part)) {
      logger.warn(
        `Unknown condition: ${part}, expected one of: ${Array.from(this.needed).join(', ')}`
      );
      return;
    }

    logger.debug(`Barrier condition met: ${part}`);
    this.needed.delete(part);

    if (this.needed.size === 0) {
      logger.info('All barrier conditions met, resolving');
      this.resolved = true;
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }
      this._resolve();
    } else {
      logger.debug(
        `Still waiting for: ${Array.from(this.needed).join(', ')} (${this.needed.size} remaining)`
      );
    }
  }

  /**
   * Check if all conditions have been met
   * @returns True if barrier is resolved
   */
  isResolved(): boolean {
    return this.resolved;
  }

  /**
   * Get remaining conditions that haven't arrived yet
   * @returns Array of condition names still pending
   */
  getRemainingConditions(): string[] {
    return Array.from(this.needed);
  }

  /**
   * Get the number of conditions still pending
   * @returns Number of conditions not yet arrived
   */
  getRemainingCount(): number {
    return this.needed.size;
  }
}
