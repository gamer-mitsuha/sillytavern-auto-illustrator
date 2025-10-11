/**
 * Tests for DOM Queue Module
 */

import {describe, it, expect, afterEach} from 'vitest';
import {
  scheduleDomOperation,
  pauseMessageQueue,
  resumeMessageQueue,
  isMessageQueuePaused,
  getQueueLength,
  clearMessageQueue,
  deleteAllQueues,
} from './dom_queue';

describe('DOM Queue', () => {
  afterEach(async () => {
    // Clean up all queues after each test
    await deleteAllQueues();
  });

  describe('scheduleDomOperation', () => {
    it('should execute operation and return result', async () => {
      const result = await scheduleDomOperation(0, async () => {
        return 'completed';
      });

      expect(result).toBe('completed');
    });

    it('should serialize operations for same message', async () => {
      const results: number[] = [];

      // Schedule 3 operations for message 0
      const promises = [
        scheduleDomOperation(0, async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          results.push(1);
          return 1;
        }),
        scheduleDomOperation(0, async () => {
          results.push(2);
          return 2;
        }),
        scheduleDomOperation(0, async () => {
          results.push(3);
          return 3;
        }),
      ];

      await Promise.all(promises);

      // Should execute in order (serialized)
      expect(results).toEqual([1, 2, 3]);
    });

    it('should allow parallel operations for different messages', async () => {
      const results: number[] = [];

      // Schedule operations for different messages
      const promises = [
        scheduleDomOperation(0, async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          results.push(1);
          return 1;
        }),
        scheduleDomOperation(1, async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          results.push(2);
          return 2;
        }),
        scheduleDomOperation(2, async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          results.push(3);
          return 3;
        }),
      ];

      await Promise.all(promises);

      // Should execute in parallel (all finish ~same time)
      // Order doesn't matter, just that all complete
      expect(results).toHaveLength(3);
      expect(results).toContain(1);
      expect(results).toContain(2);
      expect(results).toContain(3);
    });

    it('should handle operation errors', async () => {
      const errorMessage = 'Test error';

      await expect(
        scheduleDomOperation(0, async () => {
          throw new Error(errorMessage);
        })
      ).rejects.toThrow(errorMessage);
    });

    it('should continue processing after error', async () => {
      const results: string[] = [];

      // Schedule 3 operations, middle one fails
      const promises = [
        scheduleDomOperation(0, async () => {
          results.push('op1');
          return 'op1';
        }),
        scheduleDomOperation(0, async () => {
          throw new Error('op2 failed');
        }).catch(err => {
          results.push('op2-error');
          throw err;
        }),
        scheduleDomOperation(0, async () => {
          results.push('op3');
          return 'op3';
        }),
      ];

      // Wait for all (some will fail)
      await Promise.allSettled(promises);

      // Should execute all operations despite error
      expect(results).toEqual(['op1', 'op2-error', 'op3']);
    });

    it('should use provided label for debugging', async () => {
      // This test mainly verifies the label parameter is accepted
      // The actual logging is not tested here
      const result = await scheduleDomOperation(
        0,
        async () => {
          return 'test';
        },
        'test operation'
      );

      expect(result).toBe('test');
    });
  });

  describe('pauseMessageQueue and resumeMessageQueue', () => {
    it.skip('should pause and resume queue', async () => {
      const results: string[] = [];

      // Pause message 0 queue
      pauseMessageQueue(0);

      // Schedule operation (should be queued but not execute)
      const promise = scheduleDomOperation(0, async () => {
        results.push('executed');
        return 'completed';
      });

      // Wait a bit to ensure it doesn't execute
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not have executed yet
      expect(results).toEqual([]);

      // Resume the queue
      resumeMessageQueue(0);

      // Should complete now
      await expect(promise).resolves.toBe('completed');
      expect(results).toEqual(['executed']);
    });

    it.skip('should not affect other message queues', async () => {
      const results: number[] = [];

      // Pause message 0
      pauseMessageQueue(0);

      // Schedule operations for message 0 and 1
      const promise0 = scheduleDomOperation(0, async () => {
        results.push(0);
        return 0;
      });

      const promise1 = scheduleDomOperation(1, async () => {
        results.push(1);
        return 1;
      });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Message 1 should have executed, message 0 should not
      expect(results).toContain(1);
      expect(results).not.toContain(0);

      // Resume message 0
      resumeMessageQueue(0);

      // Wait for both
      await Promise.all([promise0, promise1]);

      // Both should have executed
      expect(results).toContain(0);
      expect(results).toContain(1);
    });

    it.skip('should handle multiple pause/resume cycles', async () => {
      const results: string[] = [];

      // Pause
      pauseMessageQueue(0);
      const promise1 = scheduleDomOperation(0, async () => {
        results.push('op1');
        return 'op1';
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(results).toEqual([]);

      // Resume
      resumeMessageQueue(0);
      await promise1;
      expect(results).toEqual(['op1']);

      // Pause again
      pauseMessageQueue(0);
      const promise2 = scheduleDomOperation(0, async () => {
        results.push('op2');
        return 'op2';
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(results).toEqual(['op1']);

      // Resume again
      resumeMessageQueue(0);
      await promise2;
      expect(results).toEqual(['op1', 'op2']);
    });
  });

  describe('isMessageQueuePaused', () => {
    it('should return false (not implemented yet)', () => {
      expect(isMessageQueuePaused(0)).toBe(false);
      expect(isMessageQueuePaused(1)).toBe(false);
    });
  });

  describe('getQueueLength', () => {
    it('should return 0 for empty queue', () => {
      expect(getQueueLength(0)).toBe(0);
    });

    it.skip('should track queued operations', async () => {
      // Pause queue so operations don't execute immediately
      pauseMessageQueue(0);

      // Schedule 3 operations
      const promises = [
        scheduleDomOperation(0, async () => 'op1'),
        scheduleDomOperation(0, async () => 'op2'),
        scheduleDomOperation(0, async () => 'op3'),
      ];

      // Wait a bit for operations to be queued
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should have 3 operations queued
      const queueLength = getQueueLength(0);
      expect(queueLength).toBeGreaterThan(0);

      // Resume and wait for completion
      resumeMessageQueue(0);
      await Promise.all(promises);

      // Should be empty now
      expect(getQueueLength(0)).toBe(0);
    });

    it.skip('should track queue per message', async () => {
      pauseMessageQueue(0);
      pauseMessageQueue(1);

      scheduleDomOperation(0, async () => 'op1');
      scheduleDomOperation(1, async () => 'op2');
      scheduleDomOperation(1, async () => 'op3');

      await new Promise(resolve => setTimeout(resolve, 50));

      // Message 0 should have 1 operation
      const queue0Length = getQueueLength(0);
      expect(queue0Length).toBeGreaterThan(0);

      // Message 1 should have 2 operations
      const queue1Length = getQueueLength(1);
      expect(queue1Length).toBeGreaterThan(queue0Length);
    });
  });

  describe('clearMessageQueue', () => {
    it.skip('should clear queued operations', async () => {
      pauseMessageQueue(0);

      // Schedule operations
      scheduleDomOperation(0, async () => 'op1');
      scheduleDomOperation(0, async () => 'op2');

      await new Promise(resolve => setTimeout(resolve, 50));

      // Clear the queue
      await clearMessageQueue(0);

      // Resume (shouldn't matter, queue is cleared)
      resumeMessageQueue(0);

      // Operations should have been cancelled
      // (Bottleneck's stop() method stops processing)
      await new Promise(resolve => setTimeout(resolve, 50));

      // Queue should be empty or operations cancelled
      expect(getQueueLength(0)).toBe(0);
    });

    it.skip('should not affect other message queues', async () => {
      const results: number[] = [];

      pauseMessageQueue(0);
      pauseMessageQueue(1);

      scheduleDomOperation(0, async () => {
        results.push(0);
        return 0;
      });

      const promise1 = scheduleDomOperation(1, async () => {
        results.push(1);
        return 1;
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Clear message 0 queue
      await clearMessageQueue(0);

      // Resume message 1
      resumeMessageQueue(1);

      // Wait for message 1
      await promise1;

      // Message 1 should have executed
      expect(results).toContain(1);

      // Message 0 should not have executed (queue was cleared)
      expect(results).not.toContain(0);
    });
  });

  describe('deleteAllQueues', () => {
    it.skip('should delete all message queues', async () => {
      const results: number[] = [];

      // Schedule operations for multiple messages
      pauseMessageQueue(0);
      pauseMessageQueue(1);
      pauseMessageQueue(2);

      scheduleDomOperation(0, async () => results.push(0));
      scheduleDomOperation(1, async () => results.push(1));
      scheduleDomOperation(2, async () => results.push(2));

      await new Promise(resolve => setTimeout(resolve, 50));

      // Delete all queues
      await deleteAllQueues();

      // Resume all (shouldn't matter, all queues deleted)
      resumeMessageQueue(0);
      resumeMessageQueue(1);
      resumeMessageQueue(2);

      await new Promise(resolve => setTimeout(resolve, 50));

      // No operations should have executed
      expect(results).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid sequential operations', async () => {
      const results: number[] = [];

      // Schedule many operations rapidly
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          scheduleDomOperation(0, async () => {
            results.push(i);
            return i;
          })
        );
      }

      await Promise.all(promises);

      // All should execute in order
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should handle operations with different execution times', async () => {
      const results: string[] = [];

      const promises = [
        scheduleDomOperation(0, async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          results.push('slow');
          return 'slow';
        }),
        scheduleDomOperation(0, async () => {
          results.push('fast');
          return 'fast';
        }),
      ];

      await Promise.all(promises);

      // Should execute in order despite different durations
      expect(results).toEqual(['slow', 'fast']);
    });

    it('should handle empty operation', async () => {
      const result = await scheduleDomOperation(0, async () => {
        // Empty operation
      });

      expect(result).toBeUndefined();
    });

    it('should handle operation returning complex object', async () => {
      const complexObject = {
        count: 42,
        nested: {value: 'test'},
        array: [1, 2, 3],
      };

      const result = await scheduleDomOperation(0, async () => {
        return complexObject;
      });

      expect(result).toEqual(complexObject);
    });
  });
});
