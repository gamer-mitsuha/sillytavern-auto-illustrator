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
  type ProgressImageCompletedEventDetail,
} from './progress_manager';

describe('ProgressManager', () => {
  let manager: ProgressManager;
  let startedEvents: ProgressStartedEventDetail[];
  let updatedEvents: ProgressUpdatedEventDetail[];
  let allTasksCompleteEvents: ProgressAllTasksCompleteEventDetail[];
  let clearedEvents: ProgressClearedEventDetail[];
  let imageCompletedEvents: ProgressImageCompletedEventDetail[];

  beforeEach(() => {
    manager = new ProgressManager();
    startedEvents = [];
    updatedEvents = [];
    allTasksCompleteEvents = [];
    clearedEvents = [];
    imageCompletedEvents = [];

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
    manager.addEventListener('progress:image-completed', event => {
      imageCompletedEvents.push(
        (event as CustomEvent<ProgressImageCompletedEventDetail>).detail
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

    // Fix for issue #76: Defer progress:started when incrementBy=0
    it('should initialize tracking but NOT emit progress:started when incrementBy=0', () => {
      const total = manager.registerTask(1, 0);

      expect(total).toBe(0);
      expect(startedEvents).toHaveLength(0); // No started event
      expect(updatedEvents).toHaveLength(0); // No updated event either
      expect(manager.isTracking(1)).toBe(true); // Still tracking
      expect(manager.getState(1)).toEqual({
        current: 0,
        total: 0,
        succeeded: 0,
        failed: 0,
      });
    });

    // Fix for issue #76: Emit progress:started when transitioning from 0 to >0
    it('should emit progress:started when first adding tasks after registerTask(0)', () => {
      manager.registerTask(1, 0); // Initialize with 0
      expect(startedEvents).toHaveLength(0);
      startedEvents = [];
      updatedEvents = [];

      manager.registerTask(1, 3); // Add actual tasks

      expect(startedEvents).toHaveLength(1); // NOW emit started
      expect(startedEvents[0]).toEqual({messageId: 1, total: 3});
      expect(updatedEvents).toHaveLength(0); // Should NOT emit updated
      expect(manager.getState(1)).toEqual({
        current: 0,
        total: 3,
        succeeded: 0,
        failed: 0,
      });
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

    // Fix for issue #76: Emit progress:started when transitioning from 0 to >0
    it('should emit progress:started when updating total from 0 to >0', () => {
      manager.registerTask(1, 0); // Initialize with 0
      expect(startedEvents).toHaveLength(0);
      startedEvents = [];
      updatedEvents = [];

      manager.updateTotal(1, 3); // Update to 3

      expect(startedEvents).toHaveLength(1); // Emit started, not updated
      expect(startedEvents[0]).toEqual({messageId: 1, total: 3});
      expect(updatedEvents).toHaveLength(0); // Should NOT emit updated
      expect(manager.getState(1)).toEqual({
        current: 0,
        total: 3,
        succeeded: 0,
        failed: 0,
      });
    });

    it('should emit progress:updated (not started) when updating from >0 to higher value', () => {
      manager.registerTask(1, 2);
      startedEvents = [];
      updatedEvents = [];

      manager.updateTotal(1, 5); // Update from 2 to 5

      expect(startedEvents).toHaveLength(0); // Should NOT emit started
      expect(updatedEvents).toHaveLength(1); // Should emit updated
      expect(updatedEvents[0]).toEqual({
        messageId: 1,
        total: 5,
        completed: 0,
        succeeded: 0,
        failed: 0,
      });
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

    // Fix for issue #76: Test deferred progress:started in streaming scenario
    it('should handle streaming scenario with deferred progress:started (registerTask(0) -> updateTotal)', () => {
      // Streaming starts - initialize with 0 tasks
      manager.registerTask(1, 0);
      expect(startedEvents).toHaveLength(0); // No started event yet
      expect(manager.isTracking(1)).toBe(true);

      startedEvents = [];
      updatedEvents = [];

      // First prompts detected during streaming
      manager.updateTotal(1, 2);
      expect(startedEvents).toHaveLength(1); // NOW emit started
      expect(startedEvents[0]).toEqual({messageId: 1, total: 2});
      expect(updatedEvents).toHaveLength(0);

      startedEvents = [];
      updatedEvents = [];

      // Image completes
      manager.completeTask(1);
      expect(startedEvents).toHaveLength(0);
      expect(updatedEvents).toHaveLength(1);

      // More prompts detected
      manager.updateTotal(1, 4);
      expect(startedEvents).toHaveLength(0); // Should NOT emit started again
      expect(updatedEvents).toHaveLength(2); // Should emit updated

      // Remaining complete
      manager.completeTask(1);
      manager.completeTask(1);
      manager.completeTask(1);

      expect(manager.getState(1)).toEqual({
        current: 4,
        total: 4,
        succeeded: 4,
        failed: 0,
      });

      // Session ends
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

  describe('emitImageCompleted', () => {
    it('should emit progress:image-completed event with correct data', () => {
      manager.registerTask(1, 3);

      manager.emitImageCompleted(
        1,
        'https://example.com/image.png',
        '1girl, long hair, blue eyes',
        '1girl, long hair, blue...'
      );

      expect(imageCompletedEvents).toHaveLength(1);
      expect(imageCompletedEvents[0]).toMatchObject({
        messageId: 1,
        imageUrl: 'https://example.com/image.png',
        promptText: '1girl, long hair, blue eyes',
        promptPreview: '1girl, long hair, blue...',
      });
      expect(imageCompletedEvents[0].completedAt).toBeTypeOf('number');
      expect(imageCompletedEvents[0].completedAt).toBeLessThanOrEqual(
        Date.now()
      );
    });

    it('should emit events for multiple completed images', () => {
      manager.registerTask(1, 3);

      manager.emitImageCompleted(1, 'url1', 'prompt1', 'prompt1');
      manager.emitImageCompleted(1, 'url2', 'prompt2', 'prompt2');
      manager.emitImageCompleted(1, 'url3', 'prompt3', 'prompt3');

      expect(imageCompletedEvents).toHaveLength(3);
      expect(imageCompletedEvents[0].imageUrl).toBe('url1');
      expect(imageCompletedEvents[1].imageUrl).toBe('url2');
      expect(imageCompletedEvents[2].imageUrl).toBe('url3');
    });

    it('should work without tracking being initialized', () => {
      // Emit event without calling registerTask first
      manager.emitImageCompleted(1, 'url', 'prompt', 'preview');

      expect(imageCompletedEvents).toHaveLength(1);
      expect(imageCompletedEvents[0].messageId).toBe(1);
    });

    it('should handle truncated prompt previews', () => {
      const longPrompt =
        '1girl, very long hair, detailed face, blue eyes, school uniform, outdoor scene with many details';
      const preview = longPrompt.substring(0, 57) + '...';

      manager.emitImageCompleted(1, 'url', longPrompt, preview);

      expect(imageCompletedEvents).toHaveLength(1);
      expect(imageCompletedEvents[0].promptText).toBe(longPrompt);
      expect(imageCompletedEvents[0].promptPreview).toBe(preview);
      expect(imageCompletedEvents[0].promptPreview.length).toBeLessThanOrEqual(
        60
      );
    });
  });

  // Tests for ProgressManager.waitAllComplete()
  // Tests the new explicit await condition functionality
  describe('waitAllComplete()', () => {
    beforeEach(() => {
      manager = new ProgressManager();
    });

    it('should resolve immediately if not tracking', async () => {
      await expect(manager.waitAllComplete(1)).resolves.toBeUndefined();
    });

    it('should resolve immediately if already complete', async () => {
      manager.registerTask(1, 2);
      manager.completeTask(1);
      manager.completeTask(1);

      await expect(manager.waitAllComplete(1)).resolves.toBeUndefined();
    });

    it('should wait for tasks to complete', async () => {
      manager.registerTask(1, 2);

      let resolved = false;
      const promise = manager.waitAllComplete(1).then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);

      manager.completeTask(1);
      expect(resolved).toBe(false);

      manager.completeTask(1);

      await promise;
      expect(resolved).toBe(true);
    });

    it('should reject on timeout', async () => {
      manager.registerTask(1, 2);

      await expect(
        manager.waitAllComplete(1, {timeoutMs: 100})
      ).rejects.toThrow('Timeout');
    });

    it('should reject on abort signal', async () => {
      manager.registerTask(1, 2);

      const controller = new AbortController();
      const promise = manager.waitAllComplete(1, {signal: controller.signal});

      controller.abort();

      await expect(promise).rejects.toThrow('Aborted');
    });

    it('should reject immediately if signal already aborted', async () => {
      manager.registerTask(1, 2);

      const controller = new AbortController();
      controller.abort();

      await expect(
        manager.waitAllComplete(1, {signal: controller.signal})
      ).rejects.toThrow('Already aborted');
    });

    it('should handle failed tasks as completion', async () => {
      manager.registerTask(1, 2);

      const promise = manager.waitAllComplete(1);

      manager.completeTask(1);
      manager.failTask(1);

      await expect(promise).resolves.toBeUndefined();
    });

    it('should handle dynamic total updates', async () => {
      manager.registerTask(1, 1);

      const promise = manager.waitAllComplete(1);

      manager.updateTotal(1, 3);

      manager.completeTask(1);
      manager.completeTask(1);
      manager.completeTask(1);

      await expect(promise).resolves.toBeUndefined();
    });
  });
});
