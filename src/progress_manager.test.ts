/**
 * Tests for Progress Manager Module
 */

import {describe, it, expect, beforeEach, vi} from 'vitest';
import {ProgressManager} from './progress_manager';
import * as progressWidget from './progress_widget';

// Mock progress_widget module
vi.mock('./progress_widget', () => ({
  addMessageProgress: vi.fn(),
  removeMessageProgress: vi.fn(),
}));

describe('ProgressManager', () => {
  let manager: ProgressManager;

  beforeEach(() => {
    manager = new ProgressManager();
    vi.clearAllMocks();
  });

  describe('registerTask', () => {
    it('should initialize tracking on first registration', () => {
      const total = manager.registerTask(1, 3);

      expect(total).toBe(3);
      expect(progressWidget.addMessageProgress).toHaveBeenCalledWith(1, 0, 3);
      expect(manager.getState(1)).toEqual({current: 0, total: 3});
    });

    it('should use default increment of 1', () => {
      const total = manager.registerTask(1);

      expect(total).toBe(1);
      expect(progressWidget.addMessageProgress).toHaveBeenCalledWith(1, 0, 1);
    });

    it('should increment total on subsequent registrations', () => {
      manager.registerTask(1, 2);
      vi.clearAllMocks();

      const total = manager.registerTask(1, 3);

      expect(total).toBe(5);
      expect(progressWidget.addMessageProgress).toHaveBeenCalledWith(1, 0, 5);
      expect(manager.getState(1)).toEqual({current: 0, total: 5});
    });

    it('should handle multiple messages independently', () => {
      manager.registerTask(1, 2);
      manager.registerTask(2, 3);

      expect(manager.getState(1)).toEqual({current: 0, total: 2});
      expect(manager.getState(2)).toEqual({current: 0, total: 3});
    });
  });

  describe('completeTask', () => {
    it('should increment completed count and update widget', () => {
      manager.registerTask(1, 3);
      vi.clearAllMocks();

      manager.completeTask(1);

      expect(manager.getState(1)).toEqual({current: 1, total: 3});
      expect(progressWidget.addMessageProgress).toHaveBeenCalledWith(1, 1, 3);
    });

    it('should NOT auto-clear when all tasks complete', () => {
      manager.registerTask(1, 2);
      vi.clearAllMocks();

      manager.completeTask(1);
      expect(manager.isTracking(1)).toBe(true);

      manager.completeTask(1);
      // Should still be tracking (no auto-clear)
      expect(manager.isTracking(1)).toBe(true);
      expect(manager.getState(1)).toEqual({current: 2, total: 2});
      expect(progressWidget.removeMessageProgress).not.toHaveBeenCalled();

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
    it('should increment completed count on failure', () => {
      manager.registerTask(1, 3);
      vi.clearAllMocks();

      manager.failTask(1);

      expect(manager.getState(1)).toEqual({current: 1, total: 3});
      expect(progressWidget.addMessageProgress).toHaveBeenCalledWith(1, 1, 3);
    });

    it('should NOT auto-clear when all tasks done (including failures)', () => {
      manager.registerTask(1, 2);
      vi.clearAllMocks();

      manager.completeTask(1);
      manager.failTask(1);

      // Should still be tracking (no auto-clear)
      expect(manager.isTracking(1)).toBe(true);
      expect(manager.getState(1)).toEqual({current: 2, total: 2});
      expect(progressWidget.removeMessageProgress).not.toHaveBeenCalled();

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
    it('should update total without changing completed count', () => {
      manager.registerTask(1, 3);
      manager.completeTask(1);
      vi.clearAllMocks();

      manager.updateTotal(1, 5);

      expect(manager.getState(1)).toEqual({current: 1, total: 5});
      expect(progressWidget.addMessageProgress).toHaveBeenCalledWith(1, 1, 5);
    });

    it('should handle updating non-tracked message gracefully', () => {
      // Should not throw, just log a warning
      expect(() => manager.updateTotal(999, 10)).not.toThrow();
      expect(manager.isTracking(999)).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove tracking and widget', () => {
      manager.registerTask(1, 3);
      vi.clearAllMocks();

      manager.clear(1);

      expect(manager.isTracking(1)).toBe(false);
      expect(progressWidget.removeMessageProgress).toHaveBeenCalledWith(1);
    });

    it('should handle clearing non-tracked message gracefully', () => {
      manager.clear(999);

      expect(progressWidget.removeMessageProgress).not.toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      manager.registerTask(1, 3);
      manager.completeTask(1);

      const state = manager.getState(1);

      expect(state).toEqual({current: 1, total: 3});
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
    it('should decrement total and update widget', () => {
      manager.registerTask(1, 5);
      vi.clearAllMocks();

      manager.decrementTotal(1, 2);

      expect(manager.getState(1)).toEqual({current: 0, total: 3});
      expect(progressWidget.addMessageProgress).toHaveBeenCalledWith(1, 0, 3);
    });

    it('should use default decrement of 1', () => {
      manager.registerTask(1, 3);
      vi.clearAllMocks();

      manager.decrementTotal(1);

      expect(manager.getState(1)).toEqual({current: 0, total: 2});
    });

    it('should clear if total becomes zero', () => {
      manager.registerTask(1, 2);
      vi.clearAllMocks();

      manager.decrementTotal(1, 2);

      expect(manager.isTracking(1)).toBe(false);
      expect(progressWidget.removeMessageProgress).toHaveBeenCalledWith(1);
    });

    it('should clear if completed >= total after decrement', () => {
      manager.registerTask(1, 3);
      manager.completeTask(1);
      manager.completeTask(1);
      vi.clearAllMocks();

      manager.decrementTotal(1, 1); // total: 3 -> 2, completed: 2

      expect(manager.isTracking(1)).toBe(false);
      expect(progressWidget.removeMessageProgress).toHaveBeenCalledWith(1);
    });

    it('should not go below zero', () => {
      manager.registerTask(1, 2);
      vi.clearAllMocks();

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
    it('should handle complex workflow correctly', () => {
      // User clicks 3 images for regeneration
      manager.registerTask(1, 1);
      manager.registerTask(1, 1);
      manager.registerTask(1, 1);
      expect(manager.getState(1)).toEqual({current: 0, total: 3});

      // First image generates
      manager.completeTask(1);
      expect(manager.getState(1)).toEqual({current: 1, total: 3});
      expect(manager.isTracking(1)).toBe(true);

      // Second image fails
      manager.failTask(1);
      expect(manager.getState(1)).toEqual({current: 2, total: 3});
      expect(manager.isTracking(1)).toBe(true);

      // Third image generates
      manager.completeTask(1);
      expect(manager.getState(1)).toEqual({current: 3, total: 3});
      expect(manager.isTracking(1)).toBe(true);

      // Caller explicitly clears when done
      manager.clear(1);
      expect(manager.isTracking(1)).toBe(false);
    });

    it('should handle streaming scenario with dynamic total', () => {
      // Initial prompts detected
      manager.registerTask(1, 2);
      expect(manager.getState(1)).toEqual({current: 0, total: 2});

      // First image completes
      manager.completeTask(1);
      expect(manager.getState(1)).toEqual({current: 1, total: 2});

      // More prompts detected during streaming (while first is done)
      manager.updateTotal(1, 4);
      expect(manager.getState(1)).toEqual({current: 1, total: 4});

      // Remaining images complete
      manager.completeTask(1);
      manager.completeTask(1);
      manager.completeTask(1);
      expect(manager.getState(1)).toEqual({current: 4, total: 4});
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
      expect(manager.getState(1)).toEqual({current: 3, total: 5});
      expect(manager.isTracking(1)).toBe(true);

      // User cancels - decrement remaining (automatically clears if completed >= total)
      manager.decrementTotal(1, 2);
      expect(manager.isTracking(1)).toBe(false);
    });
  });
});
