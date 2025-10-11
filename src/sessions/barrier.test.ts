/**
 * Barrier Tests
 * Tests for the Barrier synchronization primitive
 */

import {describe, it, expect} from 'vitest';
import {Barrier} from './barrier';

describe('Barrier', () => {
  describe('constructor', () => {
    it('should create a barrier with valid parts', () => {
      const barrier = new Barrier(['part1', 'part2']);
      expect(barrier).toBeDefined();
      expect(barrier.whenReady).toBeInstanceOf(Promise);
    });

    it('should throw error if parts array is empty', () => {
      expect(() => new Barrier([])).toThrow(
        'Barrier requires at least one part'
      );
    });

    it('should throw error if parts is null or undefined', () => {
      expect(() => new Barrier(null as unknown as string[])).toThrow(
        'Barrier requires at least one part'
      );
      expect(() => new Barrier(undefined as unknown as string[])).toThrow(
        'Barrier requires at least one part'
      );
    });

    it('should throw error if parts contain duplicates', () => {
      expect(() => new Barrier(['part1', 'part1'])).toThrow(
        'Barrier parts must be unique'
      );
      expect(() => new Barrier(['a', 'b', 'a'])).toThrow(
        'Barrier parts must be unique'
      );
    });

    it('should accept a single part', () => {
      const barrier = new Barrier(['singlePart']);
      expect(barrier).toBeDefined();
    });

    it('should accept multiple parts', () => {
      const barrier = new Barrier(['part1', 'part2', 'part3', 'part4']);
      expect(barrier).toBeDefined();
    });
  });

  describe('arrive', () => {
    it('should accept expected parts', () => {
      const barrier = new Barrier(['part1', 'part2']);
      expect(() => barrier.arrive('part1')).not.toThrow();
    });

    it('should throw error for unexpected parts', () => {
      const barrier = new Barrier(['part1', 'part2']);
      expect(() => barrier.arrive('part3')).toThrow('Unexpected part: part3');
    });

    it('should throw error if same part arrives twice', () => {
      const barrier = new Barrier(['part1', 'part2']);
      barrier.arrive('part1');
      expect(() => barrier.arrive('part1')).toThrow(
        'Part already arrived: part1'
      );
    });

    it('should allow all parts to arrive in order', () => {
      const barrier = new Barrier(['part1', 'part2', 'part3']);
      expect(() => {
        barrier.arrive('part1');
        barrier.arrive('part2');
        barrier.arrive('part3');
      }).not.toThrow();
    });

    it('should allow parts to arrive in any order', () => {
      const barrier = new Barrier(['part1', 'part2', 'part3']);
      expect(() => {
        barrier.arrive('part3');
        barrier.arrive('part1');
        barrier.arrive('part2');
      }).not.toThrow();
    });
  });

  describe('whenReady', () => {
    it('should resolve when all parts arrive', async () => {
      const barrier = new Barrier(['part1', 'part2']);

      let resolved = false;
      barrier.whenReady.then(() => {
        resolved = true;
      });

      // Should not be resolved yet
      await Promise.resolve();
      expect(resolved).toBe(false);

      barrier.arrive('part1');
      await Promise.resolve();
      expect(resolved).toBe(false);

      barrier.arrive('part2');
      await Promise.resolve();
      expect(resolved).toBe(true);
    });

    it('should resolve immediately if single part arrives', async () => {
      const barrier = new Barrier(['onlyPart']);

      let resolved = false;
      barrier.whenReady.then(() => {
        resolved = true;
      });

      barrier.arrive('onlyPart');
      await Promise.resolve();
      expect(resolved).toBe(true);
    });

    it('should resolve when parts arrive in reverse order', async () => {
      const barrier = new Barrier(['first', 'second', 'third']);

      let resolved = false;
      barrier.whenReady.then(() => {
        resolved = true;
      });

      barrier.arrive('third');
      barrier.arrive('second');
      await Promise.resolve();
      expect(resolved).toBe(false);

      barrier.arrive('first');
      await Promise.resolve();
      expect(resolved).toBe(true);
    });

    it('should allow waiting on whenReady multiple times', async () => {
      const barrier = new Barrier(['part1', 'part2']);

      const waiter1 = barrier.whenReady.then(() => 'waiter1');
      const waiter2 = barrier.whenReady.then(() => 'waiter2');

      barrier.arrive('part1');
      barrier.arrive('part2');

      const results = await Promise.all([waiter1, waiter2]);
      expect(results).toEqual(['waiter1', 'waiter2']);
    });

    it('should resolve correctly for use case: genDone and messageReceived', async () => {
      const barrier = new Barrier(['genDone', 'messageReceived']);

      let completed = false;
      barrier.whenReady.then(() => {
        completed = true;
      });

      // Simulate messageReceived arriving first
      barrier.arrive('messageReceived');
      await Promise.resolve();
      expect(completed).toBe(false);

      // Then genDone arrives
      barrier.arrive('genDone');
      await Promise.resolve();
      expect(completed).toBe(true);
    });
  });

  describe('isReady', () => {
    it('should return false initially', () => {
      const barrier = new Barrier(['part1', 'part2']);
      expect(barrier.isReady()).toBe(false);
    });

    it('should return false when some parts have arrived', () => {
      const barrier = new Barrier(['part1', 'part2', 'part3']);
      barrier.arrive('part1');
      expect(barrier.isReady()).toBe(false);

      barrier.arrive('part2');
      expect(barrier.isReady()).toBe(false);
    });

    it('should return true when all parts have arrived', () => {
      const barrier = new Barrier(['part1', 'part2']);
      barrier.arrive('part1');
      barrier.arrive('part2');
      expect(barrier.isReady()).toBe(true);
    });

    it('should return true for single part after arrival', () => {
      const barrier = new Barrier(['onlyPart']);
      expect(barrier.isReady()).toBe(false);
      barrier.arrive('onlyPart');
      expect(barrier.isReady()).toBe(true);
    });
  });

  describe('getMissingParts', () => {
    it('should return all parts initially', () => {
      const barrier = new Barrier(['part1', 'part2', 'part3']);
      const missing = barrier.getMissingParts();
      expect(missing).toEqual(new Set(['part1', 'part2', 'part3']));
    });

    it('should return remaining parts after some arrive', () => {
      const barrier = new Barrier(['part1', 'part2', 'part3']);
      barrier.arrive('part1');
      const missing = barrier.getMissingParts();
      expect(missing).toEqual(new Set(['part2', 'part3']));
    });

    it('should return empty set when all parts have arrived', () => {
      const barrier = new Barrier(['part1', 'part2']);
      barrier.arrive('part1');
      barrier.arrive('part2');
      const missing = barrier.getMissingParts();
      expect(missing).toEqual(new Set());
    });

    it('should track missing parts correctly regardless of arrival order', () => {
      const barrier = new Barrier(['first', 'second', 'third', 'fourth']);
      barrier.arrive('third');
      barrier.arrive('first');
      const missing = barrier.getMissingParts();
      expect(missing).toEqual(new Set(['second', 'fourth']));
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical event coordination scenario', async () => {
      const barrier = new Barrier(['genDone', 'messageReceived']);

      const events: string[] = [];

      // Simulate async events arriving
      setTimeout(() => {
        events.push('genDone arrived');
        barrier.arrive('genDone');
      }, 10);

      setTimeout(() => {
        events.push('messageReceived arrived');
        barrier.arrive('messageReceived');
      }, 20);

      await barrier.whenReady;
      events.push('barrier ready');

      expect(events).toEqual([
        'genDone arrived',
        'messageReceived arrived',
        'barrier ready',
      ]);
    });

    it('should handle multiple barriers independently', async () => {
      const barrier1 = new Barrier(['a', 'b']);
      const barrier2 = new Barrier(['x', 'y']);

      let barrier1Ready = false;
      let barrier2Ready = false;

      barrier1.whenReady.then(() => {
        barrier1Ready = true;
      });
      barrier2.whenReady.then(() => {
        barrier2Ready = true;
      });

      barrier1.arrive('a');
      barrier2.arrive('x');
      await Promise.resolve();
      expect(barrier1Ready).toBe(false);
      expect(barrier2Ready).toBe(false);

      barrier1.arrive('b');
      await Promise.resolve();
      expect(barrier1Ready).toBe(true);
      expect(barrier2Ready).toBe(false);

      barrier2.arrive('y');
      await Promise.resolve();
      expect(barrier1Ready).toBe(true);
      expect(barrier2Ready).toBe(true);
    });

    it('should support many parts', async () => {
      const parts = Array.from({length: 10}, (_, i) => `part${i}`);
      const barrier = new Barrier(parts);

      // Arrive in random order
      const shuffled = [...parts].sort(() => Math.random() - 0.5);
      for (const part of shuffled) {
        barrier.arrive(part);
      }

      await expect(barrier.whenReady).resolves.toBeUndefined();
      expect(barrier.isReady()).toBe(true);
    });
  });
});
