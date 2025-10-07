/**
 * Concurrency Limiter Module
 * Limits the number of concurrent image generation requests
 */

import {createLogger} from './logger';

const logger = createLogger('Limiter');

/**
 * A simple semaphore to limit concurrent operations
 */
export class ConcurrencyLimiter {
  private maxConcurrent: number;
  private currentCount = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Acquires a slot, waiting if necessary
   */
  private async acquire(): Promise<void> {
    if (this.currentCount < this.maxConcurrent) {
      this.currentCount++;
      logger.debug(
        `Acquired slot (${this.currentCount}/${this.maxConcurrent})`
      );
      return Promise.resolve();
    }

    // Wait in queue
    logger.debug(
      `Waiting for slot (${this.currentCount}/${this.maxConcurrent}, ${this.queue.length} queued)`
    );
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  /**
   * Releases a slot and processes next queued item
   */
  private release(): void {
    this.currentCount--;
    logger.debug(
      `Released slot (${this.currentCount}/${this.maxConcurrent}, ${this.queue.length} queued)`
    );

    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.currentCount++;
      if (next) {
        logger.debug(
          `Processing queued request (${this.currentCount}/${this.maxConcurrent})`
        );
        next();
      }
    }
  }

  /**
   * Executes an async function with concurrency limiting
   * @param fn - Async function to execute
   * @returns Promise resolving to function result
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Updates the maximum concurrent limit
   * @param maxConcurrent - New max concurrent limit
   */
  setMaxConcurrent(maxConcurrent: number): void {
    logger.info(
      `Updating max concurrent: ${this.maxConcurrent} → ${maxConcurrent}`
    );
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Gets current status
   */
  getStatus(): {
    maxConcurrent: number;
    currentCount: number;
    queueLength: number;
  } {
    return {
      maxConcurrent: this.maxConcurrent,
      currentCount: this.currentCount,
      queueLength: this.queue.length,
    };
  }
}
