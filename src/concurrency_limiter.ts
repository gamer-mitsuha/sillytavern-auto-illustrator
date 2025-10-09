/**
 * Concurrency Limiter Module
 * Limits the number of concurrent image generation requests
 */

import {createLogger} from './logger';

const logger = createLogger('Limiter');

/**
 * A simple semaphore to limit concurrent operations and enforce minimum time intervals
 */
export class ConcurrencyLimiter {
  private maxConcurrent: number;
  private minInterval: number;
  private currentCount = 0;
  private queue: Array<() => void> = [];
  private lastCompletionTime: number | null = null;

  constructor(maxConcurrent: number, minInterval = 0) {
    this.maxConcurrent = maxConcurrent;
    this.minInterval = minInterval;
    logger.info(
      `ConcurrencyLimiter created: maxConcurrent=${maxConcurrent}, minInterval=${minInterval}ms`
    );
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
   * Waits for minimum interval since last completion
   */
  private async waitForMinInterval(): Promise<void> {
    if (this.minInterval === 0 || this.lastCompletionTime === null) {
      logger.debug(
        `No interval wait needed (minInterval: ${this.minInterval}ms, lastCompletion: ${this.lastCompletionTime})`
      );
      return;
    }

    const elapsed = Date.now() - this.lastCompletionTime;
    const remaining = this.minInterval - elapsed;

    if (remaining > 0) {
      logger.info(
        `Waiting ${remaining}ms before next generation (minInterval: ${this.minInterval}ms, elapsed: ${elapsed}ms)`
      );
      await new Promise(resolve => setTimeout(resolve, remaining));
      logger.info('Wait completed, proceeding with generation');
    } else {
      logger.debug(
        `No wait needed, sufficient time elapsed (${elapsed}ms >= ${this.minInterval}ms)`
      );
    }
  }

  /**
   * Executes an async function with concurrency limiting and time interval enforcement
   * @param fn - Async function to execute
   * @returns Promise resolving to function result
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForMinInterval();
    await this.acquire();
    try {
      const result = await fn();
      this.lastCompletionTime = Date.now();
      return result;
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
   * Updates the minimum generation interval
   * @param minInterval - New minimum interval (milliseconds)
   */
  setMinInterval(minInterval: number): void {
    logger.info(
      `Updating min interval: ${this.minInterval}ms → ${minInterval}ms`
    );
    this.minInterval = minInterval;
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
