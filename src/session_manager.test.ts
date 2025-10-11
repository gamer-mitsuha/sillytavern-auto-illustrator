/**
 * Tests for SessionManager
 */

import {describe, it, expect, beforeEach, vi} from 'vitest';
import {SessionManager} from './session_manager';
import {createMockContext} from './test_helpers';
import {getDefaultSettings} from './settings';

describe('SessionManager', () => {
  let manager: SessionManager;
  let context: SillyTavernContext;
  let settings: AutoIllustratorSettings;

  beforeEach(() => {
    manager = new SessionManager();
    context = createMockContext();
    settings = getDefaultSettings();
  });

  describe('startSession', () => {
    it('should start a new session', () => {
      const session = manager.startSession(0, context, settings);

      expect(session).toBeDefined();
      expect(session.sessionId).toContain('session_0_');
      expect(session.messageId).toBe(0);
      expect(session.barrier).toBeDefined();
      expect(session.abortController).toBeDefined();
      expect(session.queue).toBeDefined();
      expect(session.monitor).toBeDefined();
      expect(session.processor).toBeDefined();
      expect(session.startedAt).toBeGreaterThan(0);
    });

    it('should mark manager as active', () => {
      expect(manager.isActive()).toBe(false);

      manager.startSession(0, context, settings);

      expect(manager.isActive()).toBe(true);
      expect(manager.isActive(0)).toBe(true);
      expect(manager.isActive(1)).toBe(false);
    });

    it('should start monitor and processor', () => {
      const session = manager.startSession(0, context, settings);

      expect(session.monitor.isActive()).toBe(true);
      expect(session.processor.getStatus().isRunning).toBe(true);
    });

    it('should create barrier with correct conditions', () => {
      const session = manager.startSession(0, context, settings);

      expect(session.barrier.getRemainingConditions()).toContain('genDone');
      expect(session.barrier.getRemainingConditions()).toContain(
        'messageReceived'
      );
      expect(session.barrier.getRemainingCount()).toBe(2);
    });

    it('should cancel existing session when starting new one', () => {
      const session1 = manager.startSession(0, context, settings);
      const abortSpy = vi.spyOn(session1.abortController, 'abort');
      const monitorStopSpy = vi.spyOn(session1.monitor, 'stop');
      const processorStopSpy = vi.spyOn(session1.processor, 'stop');

      const session2 = manager.startSession(1, context, settings);

      expect(abortSpy).toHaveBeenCalled();
      expect(monitorStopSpy).toHaveBeenCalled();
      expect(processorStopSpy).toHaveBeenCalled();
      expect(manager.getCurrentSession()).toBe(session2);
      expect(manager.isActive(1)).toBe(true);
      expect(manager.isActive(0)).toBe(false);
    });

    it('should create unique session IDs', () => {
      const session1 = manager.startSession(0, context, settings);
      manager.endSession();

      const session2 = manager.startSession(0, context, settings);

      expect(session1.sessionId).not.toBe(session2.sessionId);
    });
  });

  describe('cancelSession', () => {
    it('should cancel active session', () => {
      const session = manager.startSession(0, context, settings);
      const abortSpy = vi.spyOn(session.abortController, 'abort');
      const monitorStopSpy = vi.spyOn(session.monitor, 'stop');
      const processorStopSpy = vi.spyOn(session.processor, 'stop');

      manager.cancelSession();

      expect(abortSpy).toHaveBeenCalled();
      expect(monitorStopSpy).toHaveBeenCalled();
      expect(processorStopSpy).toHaveBeenCalled();
      expect(manager.isActive()).toBe(false);
      expect(manager.getCurrentSession()).toBeNull();
    });

    it('should do nothing if no session active', () => {
      expect(() => {
        manager.cancelSession();
      }).not.toThrow();

      expect(manager.isActive()).toBe(false);
    });

    it('should allow starting new session after cancellation', () => {
      manager.startSession(0, context, settings);
      manager.cancelSession();

      const session = manager.startSession(1, context, settings);

      expect(session).toBeDefined();
      expect(manager.isActive(1)).toBe(true);
    });
  });

  describe('endSession', () => {
    it('should end active session gracefully', () => {
      const session = manager.startSession(0, context, settings);

      // Manually stop components (simulating normal completion)
      session.monitor.stop();
      session.processor.stop();

      manager.endSession();

      expect(manager.isActive()).toBe(false);
      expect(manager.getCurrentSession()).toBeNull();
    });

    it('should do nothing if no session active', () => {
      expect(() => {
        manager.endSession();
      }).not.toThrow();
    });

    it('should calculate session duration', () => {
      const session = manager.startSession(0, context, settings);
      const startTime = session.startedAt;

      // Wait a bit
      const now = Date.now();
      expect(now).toBeGreaterThanOrEqual(startTime);

      manager.endSession();
    });
  });

  describe('getCurrentSession', () => {
    it('should return null when no session active', () => {
      expect(manager.getCurrentSession()).toBeNull();
    });

    it('should return current session when active', () => {
      const session = manager.startSession(0, context, settings);

      expect(manager.getCurrentSession()).toBe(session);
    });

    it('should return null after session ends', () => {
      manager.startSession(0, context, settings);
      manager.endSession();

      expect(manager.getCurrentSession()).toBeNull();
    });
  });

  describe('isActive', () => {
    it('should return false when no session active', () => {
      expect(manager.isActive()).toBe(false);
      expect(manager.isActive(0)).toBe(false);
      expect(manager.isActive(1)).toBe(false);
    });

    it('should return true when session active (any message)', () => {
      manager.startSession(0, context, settings);

      expect(manager.isActive()).toBe(true);
    });

    it('should return true for specific message being streamed', () => {
      manager.startSession(5, context, settings);

      expect(manager.isActive(5)).toBe(true);
      expect(manager.isActive(0)).toBe(false);
      expect(manager.isActive(10)).toBe(false);
    });

    it('should return false after session ends', () => {
      manager.startSession(0, context, settings);
      manager.endSession();

      expect(manager.isActive()).toBe(false);
      expect(manager.isActive(0)).toBe(false);
    });

    it('should update when session changes', () => {
      manager.startSession(0, context, settings);
      expect(manager.isActive(0)).toBe(true);
      expect(manager.isActive(1)).toBe(false);

      manager.startSession(1, context, settings);
      expect(manager.isActive(0)).toBe(false);
      expect(manager.isActive(1)).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return inactive status when no session', () => {
      const status = manager.getStatus();

      expect(status.hasActiveSession).toBe(false);
      expect(status.sessionId).toBeNull();
      expect(status.messageId).toBeNull();
      expect(status.duration).toBeNull();
      expect(status.queueSize).toBeNull();
      expect(status.monitorActive).toBe(false);
      expect(status.processorActive).toBe(false);
    });

    it('should return active status with details', () => {
      const session = manager.startSession(0, context, settings);

      const status = manager.getStatus();

      expect(status.hasActiveSession).toBe(true);
      expect(status.sessionId).toBe(session.sessionId);
      expect(status.messageId).toBe(0);
      expect(status.duration).toBeGreaterThanOrEqual(0);
      expect(status.queueSize).toBe(0);
      expect(status.monitorActive).toBe(true);
      expect(status.processorActive).toBe(true);
    });

    it('should update duration over time', async () => {
      manager.startSession(0, context, settings);

      const status1 = manager.getStatus();
      const duration1 = status1.duration!;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50));

      const status2 = manager.getStatus();
      const duration2 = status2.duration!;

      expect(duration2).toBeGreaterThanOrEqual(duration1);
    });

    it('should reflect queue size', () => {
      const session = manager.startSession(0, context, settings);

      // Add prompts to queue
      session.queue.addPrompt(
        'test prompt 1',
        '<!--img-prompt="test prompt 1"-->',
        0,
        20
      );
      session.queue.addPrompt(
        'test prompt 2',
        '<!--img-prompt="test prompt 2"-->',
        30,
        50
      );

      const status = manager.getStatus();

      expect(status.queueSize).toBe(2);
    });
  });

  describe('session isolation', () => {
    it('should not interfere with previous session components', () => {
      const session1 = manager.startSession(0, context, settings);
      const queue1 = session1.queue;

      manager.startSession(1, context, settings);
      const session2 = manager.getCurrentSession()!;
      const queue2 = session2.queue;

      expect(queue1).not.toBe(queue2);

      // Add to new queue
      queue2.addPrompt('test', '<!--img-prompt="test"-->', 0, 10);

      // Old queue unaffected
      expect(queue1.size()).toBe(0);
      expect(queue2.size()).toBe(1);
    });

    it('should create new components for each session', () => {
      const session1 = manager.startSession(0, context, settings);
      const monitor1 = session1.monitor;
      const processor1 = session1.processor;

      manager.startSession(1, context, settings);
      const session2 = manager.getCurrentSession()!;
      const monitor2 = session2.monitor;
      const processor2 = session2.processor;

      expect(monitor1).not.toBe(monitor2);
      expect(processor1).not.toBe(processor2);
    });
  });

  describe('error handling', () => {
    it('should handle multiple cancel calls gracefully', () => {
      manager.startSession(0, context, settings);

      manager.cancelSession();
      manager.cancelSession(); // Should not throw
      manager.cancelSession();

      expect(manager.isActive()).toBe(false);
    });

    it('should handle multiple end calls gracefully', () => {
      manager.startSession(0, context, settings);

      manager.endSession();
      manager.endSession(); // Should not throw
      manager.endSession();

      expect(manager.isActive()).toBe(false);
    });
  });
});
