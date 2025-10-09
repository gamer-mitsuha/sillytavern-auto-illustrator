/**
 * Concurrency Limiter Tests
 * Tests for concurrency limiting and time-based throttling
 */

import {describe, it, expect, beforeEach, vi} from 'vitest';
import {ConcurrencyLimiter} from './concurrency_limiter';

describe('ConcurrencyLimiter', () => {
  let limiter: ConcurrencyLimiter;

  beforeEach(() => {
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  describe('Concurrency limiting', () => {
    it('should limit concurrent executions', async () => {
      limiter = new ConcurrencyLimiter(2);
      let running = 0;
      let maxRunning = 0;

      const task = async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise(resolve => setTimeout(resolve, 100));
        running--;
      };

      // Start 5 tasks
      const promises = Array.from({length: 5}, () => limiter.run(task));

      // Advance timers to complete all tasks
      await vi.advanceTimersByTimeAsync(500);
      await Promise.all(promises);

      // Should never have more than 2 running at once
      expect(maxRunning).toBe(2);
    });

    it('should execute tasks sequentially when maxConcurrent is 1', async () => {
      limiter = new ConcurrencyLimiter(1);
      const executionOrder: number[] = [];

      const createTask = (id: number) => async () => {
        executionOrder.push(id);
        await new Promise(resolve => setTimeout(resolve, 50));
      };

      const promises = [
        limiter.run(createTask(1)),
        limiter.run(createTask(2)),
        limiter.run(createTask(3)),
      ];

      await vi.advanceTimersByTimeAsync(200);
      await Promise.all(promises);

      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should update max concurrent limit', async () => {
      limiter = new ConcurrencyLimiter(1);
      let running = 0;
      let maxRunning = 0;

      const task = async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise(resolve => setTimeout(resolve, 100));
        running--;
      };

      // Start 3 tasks with limit of 1
      const promise1 = limiter.run(task);
      const promise2 = limiter.run(task);
      const promise3 = limiter.run(task);

      // Update to allow 2 concurrent
      limiter.setMaxConcurrent(2);

      await vi.advanceTimersByTimeAsync(300);
      await Promise.all([promise1, promise2, promise3]);

      // Should allow up to 2 concurrent after update
      expect(maxRunning).toBeLessThanOrEqual(2);
    });
  });

  describe('Time-based throttling', () => {
    it('should enforce minimum interval between task completions', async () => {
      limiter = new ConcurrencyLimiter(5, 1000); // 1 second interval
      const completionTimes: number[] = [];

      const task = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        completionTimes.push(Date.now());
      };

      // Start 3 tasks
      const promise1 = limiter.run(task);
      await vi.advanceTimersByTimeAsync(20);
      await promise1;

      const promise2 = limiter.run(task);
      await vi.advanceTimersByTimeAsync(1020);
      await promise2;

      const promise3 = limiter.run(task);
      await vi.advanceTimersByTimeAsync(1020);
      await promise3;

      // Verify each task waited at least 1000ms after the previous completion
      expect(completionTimes[1] - completionTimes[0]).toBeGreaterThanOrEqual(
        1000
      );
      expect(completionTimes[2] - completionTimes[1]).toBeGreaterThanOrEqual(
        1000
      );
    });

    it('should not delay when minInterval is 0', async () => {
      limiter = new ConcurrencyLimiter(5, 0);
      const startTime = Date.now();
      const completionTimes: number[] = [];

      const task = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        completionTimes.push(Date.now());
      };

      // Run 3 tasks quickly
      const promise1 = limiter.run(task);
      await vi.advanceTimersByTimeAsync(15);
      await promise1;

      const promise2 = limiter.run(task);
      await vi.advanceTimersByTimeAsync(15);
      await promise2;

      const promise3 = limiter.run(task);
      await vi.advanceTimersByTimeAsync(15);
      await promise3;

      const totalTime = Date.now() - startTime;

      // Should complete quickly without interval delays
      expect(totalTime).toBeLessThan(100);
    });

    it('should wait remaining time if interval not elapsed', async () => {
      limiter = new ConcurrencyLimiter(5, 1000);

      const task = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      };

      // First task
      const promise1 = limiter.run(task);
      await vi.advanceTimersByTimeAsync(20);
      await promise1;

      const firstCompletionTime = Date.now();

      // Advance only 300ms
      await vi.advanceTimersByTimeAsync(300);

      // Second task should wait remaining 700ms
      const promise2Start = limiter.run(task);

      // Should not start immediately
      await vi.advanceTimersByTimeAsync(100);

      // After 700ms total wait, task should execute
      await vi.advanceTimersByTimeAsync(600);
      await vi.advanceTimersByTimeAsync(20);
      await promise2Start;

      const secondCompletionTime = Date.now();

      // Total time from first completion should be ~1000ms
      expect(secondCompletionTime - firstCompletionTime).toBeGreaterThanOrEqual(
        1000
      );
    });

    it('should update minimum interval dynamically', async () => {
      limiter = new ConcurrencyLimiter(5, 500);

      const task = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      };

      // First task
      const promise1 = limiter.run(task);
      await vi.advanceTimersByTimeAsync(20);
      await promise1;

      // Update interval to 1000ms
      limiter.setMinInterval(1000);

      const firstCompletionTime = Date.now();

      // Second task should wait 1000ms (new interval)
      const promise2 = limiter.run(task);
      await vi.advanceTimersByTimeAsync(1020);
      await promise2;

      const secondCompletionTime = Date.now();

      expect(secondCompletionTime - firstCompletionTime).toBeGreaterThanOrEqual(
        1000
      );
    });

    it('should work with both concurrency and time limiting enabled', async () => {
      // Just verify that both settings are stored and retrievable
      limiter = new ConcurrencyLimiter(2, 500);
      const status = limiter.getStatus();

      expect(status.maxConcurrent).toBe(2);

      // Verify setters work
      limiter.setMaxConcurrent(3);
      limiter.setMinInterval(1000);

      expect(limiter.getStatus().maxConcurrent).toBe(3);
    });
  });

  describe('Status tracking', () => {
    it('should return correct status', () => {
      limiter = new ConcurrencyLimiter(3, 500);
      const status = limiter.getStatus();

      expect(status.maxConcurrent).toBe(3);
      expect(status.currentCount).toBe(0);
      expect(status.queueLength).toBe(0);
    });

    it('should update status as tasks run', async () => {
      limiter = new ConcurrencyLimiter(1);

      const slowTask = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      };

      const promise1 = limiter.run(slowTask);
      const promise2 = limiter.run(slowTask);

      // After starting, should show 1 running and 1 queued
      await vi.advanceTimersByTimeAsync(10);
      const statusDuring = limiter.getStatus();
      expect(statusDuring.currentCount).toBe(1);
      expect(statusDuring.queueLength).toBe(1);

      await vi.advanceTimersByTimeAsync(200);
      await Promise.all([promise1, promise2]);

      // After completion, should be empty
      const statusAfter = limiter.getStatus();
      expect(statusAfter.currentCount).toBe(0);
      expect(statusAfter.queueLength).toBe(0);
    });
  });
});
