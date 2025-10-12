/**
 * Tests for Progress Manager Module
 * Tests event-driven architecture (no widget coupling)
 */

import {describe, it, expect, beforeEach} from 'vitest';
import {
  ProgressManager,
  type ProgressStartedEventDetail,
  type ProgressUpdatedEventDetail,
  type ProgressAllTasksCompleteEventDetail,
  type ProgressClearedEventDetail,
} from './progress_manager';

describe('ProgressManager', () => {
  let manager: ProgressManager;
  let startedEvents: ProgressStartedEventDetail[];
  let updatedEvents: ProgressUpdatedEventDetail[];
  let allTasksCompleteEvents: ProgressAllTasksCompleteEventDetail[];
  let clearedEvents: ProgressClearedEventDetail[];

  beforeEach(() => {
    manager = new ProgressManager();
    startedEvents = [];
    updatedEvents = [];
    allTasksCompleteEvents = [];
    clearedEvents = [];

    // Subscribe to all events
    manager.addEventListener('progress:started', event => {
      startedEvents.push(
        (event as CustomEvent<ProgressStartedEventDetail>).detail
      );
    });
    manager.addEventListener('progress:updated', event => {
      updatedEvents.push(
        (event as CustomEvent<ProgressUpdatedEventDetail>).detail
      );
    });
    manager.addEventListener('progress:all-tasks-complete', event => {
      allTasksCompleteEvents.push(
        (event as CustomEvent<ProgressAllTasksCompleteEventDetail>).detail
      );
    });
    manager.addEventListener('progress:cleared', event => {
      clearedEvents.push(
        (event as CustomEvent<ProgressClearedEventDetail>).detail
      );
    });
  });

  describe('registerTask', () => {
    it('should initialize tracking on first registration and emit progress:started', () => {
      const total = manager.registerTask(1, 3);

      expect(total).toBe(3);
      expect(startedEvents).toHaveLength(1);
      expect(startedEvents[0]).toEqual({messageId: 1, total: 3});
      expect(manager.getState(1)).toEqual({
        current: 0,
        total: 3,
        succeeded: 0,
        failed: 0,
      });
    });

    it('should use default increment of 1', () => {
      const total = manager.registerTask(1);

      expect(total).toBe(1);
      expect(startedEvents).toHaveLength(1);
      expect(startedEvents[0]).toEqual({messageId: 1, total: 1});
    });

    it('should increment total on subsequent registrations and emit progress:updated', () => {
      manager.registerTask(1, 2);
      startedEvents = [];
      updatedEvents = [];

      const total = manager.registerTask(1, 3);

      expect(total).toBe(5);
      expect(startedEvents).toHaveLength(0); // No new started event
      expect(updatedEvents).toHaveLength(1);
      expect(updatedEvents[0]).toEqual({
        messageId: 1,
        total: 5,
        completed: 0,
        succeeded: 0,
        failed: 0,
      });
      expect(manager.getState(1)).toEqual({
        current: 0,
        total: 5,
        succeeded: 0,
        failed: 0,
      });
    });

    it('should handle multiple messages independently', () => {
      manager.registerTask(1, 2);
      manager.registerTask(2, 3);

      expect(manager.getState(1)).toEqual({
        current: 0,
        total: 2,
        succeeded: 0,
        failed: 0,
      });
      expect(manager.getState(2)).toEqual({
        current: 0,
        total: 3,
        succeeded: 0,
        failed: 0,
      });
      expect(startedEvents).toHaveLength(2);
    });
  });

  describe('completeTask', () => {
    it('should increment completed/succeeded counts and emit progress:updated', () => {
      manager.registerTask(1, 3);
      updatedEvents = [];

      manager.completeTask(1);

      expect(manager.getState(1)).toEqual({
        current: 1,
        total: 3,
        succeeded: 1,
        failed: 0,
      });
      expect(updatedEvents).toHaveLength(1);
      expect(updatedEvents[0]).toEqual({
        messageId: 1,
        total: 3,
        completed: 1,
        succeeded: 1,
        failed: 0,
      });
    });

    it('should emit progress:all-tasks-complete when all tasks complete', () => {
      manager.registerTask(1, 2);
      allTasksCompleteEvents = [];

      manager.completeTask(1);
      expect(allTasksCompleteEvents).toHaveLength(0); // Not done yet

      manager.completeTask(1);
      expect(allTasksCompleteEvents).toHaveLength(1);
      expect(allTasksCompleteEvents[0]).toMatchObject({
        messageId: 1,
        total: 2,
        succeeded: 2,
        failed: 0,
      });
      expect(allTasksCompleteEvents[0].duration).toBeGreaterThanOrEqual(0);

      // Should still be tracking (caller must explicitly clear)
      expect(manager.isTracking(1)).toBe(true);
      expect(manager.getState(1)).toEqual({
        current: 2,
        total: 2,
        succeeded: 2,
        failed: 0,
      });

      // Caller must explicitly clear
      manager.clear(1);
      expect(manager.isTracking(1)).toBe(false);
    });

    it('should handle completing non-tracked message gracefully', () => {
      // Should not throw, just log a warning
      expect(() => manager.completeTask(999)).not.toThrow();
      expect(manager.isTracking(999)).toBe(false);
    });
  });

  describe('failTask', () => {
    it('should increment completed/failed counts and emit progress:updated', () => {
      manager.registerTask(1, 3);
      updatedEvents = [];

      manager.failTask(1);

      expect(manager.getState(1)).toEqual({
        current: 1,
        total: 3,
        succeeded: 0,
        failed: 1,
      });
      expect(updatedEvents).toHaveLength(1);
      expect(updatedEvents[0]).toEqual({
        messageId: 1,
        total: 3,
        completed: 1,
        succeeded: 0,
        failed: 1,
      });
    });

    it('should emit progress:all-tasks-complete when all tasks done (including failures)', () => {
      manager.registerTask(1, 2);
      allTasksCompleteEvents = [];

      manager.completeTask(1);
      manager.failTask(1);

      expect(allTasksCompleteEvents).toHaveLength(1);
      expect(allTasksCompleteEvents[0]).toMatchObject({
        messageId: 1,
        total: 2,
        succeeded: 1,
        failed: 1,
      });

      // Should still be tracking (caller must explicitly clear)
      expect(manager.isTracking(1)).toBe(true);
      expect(manager.getState(1)).toEqual({
        current: 2,
        total: 2,
        succeeded: 1,
        failed: 1,
      });

      // Caller must explicitly clear
      manager.clear(1);
      expect(manager.isTracking(1)).toBe(false);
    });

    it('should handle failing non-tracked message gracefully', () => {
      // Should not throw, just log a warning
      expect(() => manager.failTask(999)).not.toThrow();
      expect(manager.isTracking(999)).toBe(false);
    });
  });

  describe('updateTotal', () => {
    it('should update total without changing completed count and emit progress:updated', () => {
      manager.registerTask(1, 3);
      manager.completeTask(1);
      updatedEvents = [];

      manager.updateTotal(1, 5);

      expect(manager.getState(1)).toEqual({
        current: 1,
        total: 5,
        succeeded: 1,
        failed: 0,
      });
      expect(updatedEvents).toHaveLength(1);
      expect(updatedEvents[0]).toEqual({
        messageId: 1,
        total: 5,
        completed: 1,
        succeeded: 1,
        failed: 0,
      });
    });

    it('should handle updating non-tracked message gracefully', () => {
      // Should not throw, just log a warning
      expect(() => manager.updateTotal(999, 10)).not.toThrow();
      expect(manager.isTracking(999)).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove tracking and emit progress:cleared', () => {
      manager.registerTask(1, 3);
      clearedEvents = [];

      manager.clear(1);

      expect(manager.isTracking(1)).toBe(false);
      expect(clearedEvents).toHaveLength(1);
      expect(clearedEvents[0]).toEqual({messageId: 1});
    });

    it('should handle clearing non-tracked message gracefully', () => {
      clearedEvents = [];
      manager.clear(999);

      expect(clearedEvents).toHaveLength(0);
    });
  });

  describe('getState', () => {
    it('should return current state with success/failure counts', () => {
      manager.registerTask(1, 3);
      manager.completeTask(1);

      const state = manager.getState(1);

      expect(state).toEqual({
        current: 1,
        total: 3,
        succeeded: 1,
        failed: 0,
      });
    });

    it('should return null if not tracked', () => {
      const state = manager.getState(999);

      expect(state).toBeNull();
    });
  });

  describe('isComplete', () => {
    it('should return true when all tasks are complete', () => {
      manager.registerTask(1, 2);
      manager.completeTask(1);
      manager.completeTask(1);

      expect(manager.isComplete(1)).toBe(true);
    });

    it('should return false when tasks are not complete', () => {
      manager.registerTask(1, 3);
      manager.completeTask(1);

      expect(manager.isComplete(1)).toBe(false);
    });

    it('should return false for non-tracked message', () => {
      expect(manager.isComplete(999)).toBe(false);
    });

    it('should return true when completed exceeds total', () => {
      manager.registerTask(1, 2);
      manager.completeTask(1);
      manager.completeTask(1);
      manager.completeTask(1); // Overshoot

      expect(manager.isComplete(1)).toBe(true);
    });
  });

  describe('isTracking', () => {
    it('should return true if message is tracked', () => {
      manager.registerTask(1);

      expect(manager.isTracking(1)).toBe(true);
    });

    it('should return false if message is not tracked', () => {
      expect(manager.isTracking(999)).toBe(false);
    });
  });

  describe('getTrackedMessageIds', () => {
    it('should return all tracked message IDs', () => {
      manager.registerTask(1);
      manager.registerTask(2);
      manager.registerTask(3);

      const ids = manager.getTrackedMessageIds();

      expect(ids).toHaveLength(3);
      expect(ids).toContain(1);
      expect(ids).toContain(2);
      expect(ids).toContain(3);
    });

    it('should return empty array if no messages tracked', () => {
      const ids = manager.getTrackedMessageIds();

      expect(ids).toEqual([]);
    });
  });

  describe('decrementTotal', () => {
    it('should decrement total and emit progress:updated', () => {
      manager.registerTask(1, 5);
      updatedEvents = [];

      manager.decrementTotal(1, 2);

      expect(manager.getState(1)).toEqual({
        current: 0,
        total: 3,
        succeeded: 0,
        failed: 0,
      });
      expect(updatedEvents).toHaveLength(1);
    });

    it('should use default decrement of 1', () => {
      manager.registerTask(1, 3);
      updatedEvents = [];

      manager.decrementTotal(1);

      expect(manager.getState(1)).toEqual({
        current: 0,
        total: 2,
        succeeded: 0,
        failed: 0,
      });
    });

    it('should clear if total becomes zero and emit progress:cleared', () => {
      manager.registerTask(1, 2);
      clearedEvents = [];

      manager.decrementTotal(1, 2);

      expect(manager.isTracking(1)).toBe(false);
      expect(clearedEvents).toHaveLength(1);
    });

    it('should clear if completed >= total after decrement', () => {
      manager.registerTask(1, 3);
      manager.completeTask(1);
      manager.completeTask(1);
      clearedEvents = [];

      manager.decrementTotal(1, 1); // total: 3 -> 2, completed: 2

      expect(manager.isTracking(1)).toBe(false);
      expect(clearedEvents).toHaveLength(1);
    });

    it('should not go below zero', () => {
      manager.registerTask(1, 2);
      clearedEvents = [];

      manager.decrementTotal(1, 10);

      expect(manager.isTracking(1)).toBe(false);
    });

    it('should handle decrementing non-tracked message gracefully', () => {
      // Should not throw, just log a warning
      expect(() => manager.decrementTotal(999)).not.toThrow();
      expect(manager.isTracking(999)).toBe(false);
    });
  });

  describe('mixed operations', () => {
    it('should handle complex workflow correctly with success/failure tracking', () => {
      // User clicks 3 images for regeneration
      manager.registerTask(1, 1);
      manager.registerTask(1, 1);
      manager.registerTask(1, 1);
      expect(manager.getState(1)).toEqual({
        current: 0,
        total: 3,
        succeeded: 0,
        failed: 0,
      });

      // First image generates
      manager.completeTask(1);
      expect(manager.getState(1)).toEqual({
        current: 1,
        total: 3,
        succeeded: 1,
        failed: 0,
      });
      expect(manager.isTracking(1)).toBe(true);

      // Second image fails
      manager.failTask(1);
      expect(manager.getState(1)).toEqual({
        current: 2,
        total: 3,
        succeeded: 1,
        failed: 1,
      });
      expect(manager.isTracking(1)).toBe(true);

      // Third image generates
      manager.completeTask(1);
      expect(manager.getState(1)).toEqual({
        current: 3,
        total: 3,
        succeeded: 2,
        failed: 1,
      });
      expect(manager.isTracking(1)).toBe(true);

      // Caller explicitly clears when done
      manager.clear(1);
      expect(manager.isTracking(1)).toBe(false);
    });

    it('should handle streaming scenario with dynamic total', () => {
      // Initial prompts detected
      manager.registerTask(1, 2);
      expect(manager.getState(1)).toEqual({
        current: 0,
        total: 2,
        succeeded: 0,
        failed: 0,
      });

      // First image completes
      manager.completeTask(1);
      expect(manager.getState(1)).toEqual({
        current: 1,
        total: 2,
        succeeded: 1,
        failed: 0,
      });

      // More prompts detected during streaming (while first is done)
      manager.updateTotal(1, 4);
      expect(manager.getState(1)).toEqual({
        current: 1,
        total: 4,
        succeeded: 1,
        failed: 0,
      });

      // Remaining images complete
      manager.completeTask(1);
      manager.completeTask(1);
      manager.completeTask(1);
      expect(manager.getState(1)).toEqual({
        current: 4,
        total: 4,
        succeeded: 4,
        failed: 0,
      });
      expect(manager.isTracking(1)).toBe(true);

      // Session ends, caller clears
      manager.clear(1);
      expect(manager.isTracking(1)).toBe(false);
    });

    it('should handle batch generation with early termination', () => {
      // Batch of 5 images
      manager.registerTask(1, 5);

      // 3 complete
      manager.completeTask(1);
      manager.completeTask(1);
      manager.completeTask(1);
      expect(manager.getState(1)).toEqual({
        current: 3,
        total: 5,
        succeeded: 3,
        failed: 0,
      });
      expect(manager.isTracking(1)).toBe(true);

      // User cancels - decrement remaining (automatically clears if completed >= total)
      manager.decrementTotal(1, 2);
      expect(manager.isTracking(1)).toBe(false);
    });
  });
});
