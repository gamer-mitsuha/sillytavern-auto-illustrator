/**
 * Tests for Barrier synchronization primitive
 */

import {describe, it, expect} from 'vitest';
import {Barrier} from './barrier';

describe('Barrier', () => {
  describe('constructor', () => {
    it('should create a barrier with conditions', () => {
      const barrier = new Barrier(['a', 'b']);

      expect(barrier.isResolved()).toBe(false);
      expect(barrier.getRemainingConditions()).toEqual(['a', 'b']);
      expect(barrier.getRemainingCount()).toBe(2);
    });

    it('should throw if no conditions provided', () => {
      expect(() => new Barrier([])).toThrow('at least one condition');
    });

    it('should accept single condition', () => {
      const barrier = new Barrier(['single']);

      expect(barrier.getRemainingConditions()).toEqual(['single']);
      expect(barrier.getRemainingCount()).toBe(1);
    });

    it('should deduplicate conditions', () => {
      const barrier = new Barrier(['a', 'b', 'a', 'b']);

      expect(barrier.getRemainingConditions()).toHaveLength(2);
      expect(barrier.getRemainingConditions()).toContain('a');
      expect(barrier.getRemainingConditions()).toContain('b');
    });
  });

  describe('arrive', () => {
    it('should resolve when all conditions arrive', async () => {
      const barrier = new Barrier(['a', 'b', 'c']);

      expect(barrier.isResolved()).toBe(false);

      barrier.arrive('a');
      expect(barrier.isResolved()).toBe(false);
      expect(barrier.getRemainingCount()).toBe(2);

      barrier.arrive('b');
      expect(barrier.isResolved()).toBe(false);
      expect(barrier.getRemainingCount()).toBe(1);

      barrier.arrive('c');
      expect(barrier.isResolved()).toBe(true);
      expect(barrier.getRemainingCount()).toBe(0);

      await expect(barrier.whenReady).resolves.toBeUndefined();
    });

    it('should resolve immediately for single condition', async () => {
      const barrier = new Barrier(['only']);

      barrier.arrive('only');

      expect(barrier.isResolved()).toBe(true);
      await expect(barrier.whenReady).resolves.toBeUndefined();
    });

    it('should ignore duplicate arrivals', async () => {
      const barrier = new Barrier(['a', 'b']);

      barrier.arrive('a');
      barrier.arrive('a'); // Duplicate
      barrier.arrive('a'); // Duplicate

      expect(barrier.isResolved()).toBe(false);
      expect(barrier.getRemainingCount()).toBe(1);

      barrier.arrive('b');

      expect(barrier.isResolved()).toBe(true);
      await expect(barrier.whenReady).resolves.toBeUndefined();
    });

    it('should ignore arrivals after resolution', () => {
      const barrier = new Barrier(['a']);

      barrier.arrive('a');
      expect(barrier.isResolved()).toBe(true);

      // These should be ignored
      barrier.arrive('a');
      barrier.arrive('unknown');

      expect(barrier.isResolved()).toBe(true);
    });

    it('should ignore unknown condition', () => {
      const barrier = new Barrier(['a', 'b']);

      barrier.arrive('unknown'); // Should be ignored

      expect(barrier.getRemainingConditions()).toEqual(['a', 'b']);
      expect(barrier.getRemainingCount()).toBe(2);
      expect(barrier.isResolved()).toBe(false);
    });

    it('should handle conditions arriving in any order', async () => {
      const barrier = new Barrier(['first', 'second', 'third']);

      barrier.arrive('third');
      barrier.arrive('first');
      barrier.arrive('second');

      expect(barrier.isResolved()).toBe(true);
      await expect(barrier.whenReady).resolves.toBeUndefined();
    });
  });

  describe('timeout', () => {
    it('should timeout if conditions do not arrive', async () => {
      const barrier = new Barrier(['a', 'b'], 100);

      barrier.arrive('a');
      // Don't arrive 'b'

      await expect(barrier.whenReady).rejects.toThrow(/timeout/i);
      await expect(barrier.whenReady).rejects.toThrow('b');
    });

    it('should not timeout if all conditions arrive in time', async () => {
      const barrier = new Barrier(['a', 'b'], 1000);

      barrier.arrive('a');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50));

      barrier.arrive('b');

      await expect(barrier.whenReady).resolves.toBeUndefined();
    });

    it('should clear timeout on successful resolution', async () => {
      const barrier = new Barrier(['a'], 1000);

      barrier.arrive('a');

      // Wait to ensure timeout doesn't fire
      await new Promise(resolve => setTimeout(resolve, 1100));

      await expect(barrier.whenReady).resolves.toBeUndefined();
    });

    it('should work without timeout', async () => {
      const barrier = new Barrier(['a', 'b']); // No timeout

      // Wait indefinitely is fine
      await new Promise(resolve => setTimeout(resolve, 100));

      barrier.arrive('a');
      barrier.arrive('b');

      await expect(barrier.whenReady).resolves.toBeUndefined();
    });

    it('should handle zero or negative timeout gracefully', async () => {
      // Zero timeout should be ignored (treated as no timeout)
      const barrier1 = new Barrier(['a'], 0);
      expect(barrier1).toBeDefined();
      expect(barrier1.isResolved()).toBe(false);

      barrier1.arrive('a');
      expect(barrier1.isResolved()).toBe(true);
      await expect(barrier1.whenReady).resolves.toBeUndefined();

      // Negative timeout should be ignored (treated as no timeout)
      const barrier2 = new Barrier(['a'], -100);
      expect(barrier2).toBeDefined();
      expect(barrier2.isResolved()).toBe(false);

      barrier2.arrive('a');
      expect(barrier2.isResolved()).toBe(true);
      await expect(barrier2.whenReady).resolves.toBeUndefined();
    });
  });

  describe('promise behavior', () => {
    it('should allow multiple awaits on same promise', async () => {
      const barrier = new Barrier(['a']);

      const promise1 = barrier.whenReady;
      const promise2 = barrier.whenReady;

      expect(promise1).toBe(promise2); // Same promise instance

      barrier.arrive('a');

      await expect(promise1).resolves.toBeUndefined();
      await expect(promise2).resolves.toBeUndefined();
    });

    it('should resolve promise for concurrent waiters', async () => {
      const barrier = new Barrier(['a', 'b']);

      const results: string[] = [];

      // Multiple concurrent waiters
      const waiter1 = barrier.whenReady.then(() => results.push('waiter1'));
      const waiter2 = barrier.whenReady.then(() => results.push('waiter2'));
      const waiter3 = barrier.whenReady.then(() => results.push('waiter3'));

      barrier.arrive('a');
      barrier.arrive('b');

      await Promise.all([waiter1, waiter2, waiter3]);

      expect(results).toHaveLength(3);
      expect(results).toContain('waiter1');
      expect(results).toContain('waiter2');
      expect(results).toContain('waiter3');
    });
  });

  describe('edge cases', () => {
    it('should handle very large number of conditions', async () => {
      const conditions = Array.from({length: 1000}, (_, i) => `cond${i}`);
      const barrier = new Barrier(conditions);

      expect(barrier.getRemainingCount()).toBe(1000);

      // Arrive all conditions
      for (const cond of conditions) {
        barrier.arrive(cond);
      }

      expect(barrier.isResolved()).toBe(true);
      await expect(barrier.whenReady).resolves.toBeUndefined();
    });

    it('should handle rapid arrivals', async () => {
      const barrier = new Barrier(['a', 'b', 'c', 'd', 'e']);

      // Arrive all at once
      barrier.arrive('a');
      barrier.arrive('b');
      barrier.arrive('c');
      barrier.arrive('d');
      barrier.arrive('e');

      expect(barrier.isResolved()).toBe(true);
      await expect(barrier.whenReady).resolves.toBeUndefined();
    });

    it('should handle conditions with special characters', async () => {
      const barrier = new Barrier([
        'gen-done',
        'message_received',
        'event:completed',
        'state/ready',
      ]);

      barrier.arrive('gen-done');
      barrier.arrive('message_received');
      barrier.arrive('event:completed');
      barrier.arrive('state/ready');

      expect(barrier.isResolved()).toBe(true);
      await expect(barrier.whenReady).resolves.toBeUndefined();
    });
  });

  describe('integration scenarios', () => {
    it('should coordinate async operations like streaming + message received', async () => {
      const barrier = new Barrier(['genDone', 'messageReceived'], 5000);

      // Simulate async image generation
      const generateImages = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        barrier.arrive('genDone');
        return ['image1.png', 'image2.png'];
      };

      // Simulate MESSAGE_RECEIVED event
      const messageReceived = async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
        barrier.arrive('messageReceived');
      };

      // Start both operations
      const [images] = await Promise.all([
        generateImages(),
        messageReceived(),
        barrier.whenReady,
      ]);

      expect(barrier.isResolved()).toBe(true);
      expect(images).toHaveLength(2);
    });

    it('should handle cancellation scenario', async () => {
      const barrier = new Barrier(['condition1', 'condition2'], 200);

      // Simulate cancellation - conditions never arrive
      // Barrier should timeout

      await expect(barrier.whenReady).rejects.toThrow(/timeout/i);
    });
  });
});
