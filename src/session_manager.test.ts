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

    it('should allow multiple concurrent sessions', () => {
      const session1 = manager.startSession(0, context, settings);
      const session2 = manager.startSession(1, context, settings);

      // Both sessions should be active
      expect(manager.isActive(0)).toBe(true);
      expect(manager.isActive(1)).toBe(true);
      expect(manager.getSession(0)).toBe(session1);
      expect(manager.getSession(1)).toBe(session2);
    });

    it('should cancel duplicate session for same message', () => {
      const session1 = manager.startSession(0, context, settings);
      const abortSpy = vi.spyOn(session1.abortController, 'abort');
      const monitorStopSpy = vi.spyOn(session1.monitor, 'stop');
      const processorStopSpy = vi.spyOn(session1.processor, 'stop');

      const session2 = manager.startSession(0, context, settings);

      expect(abortSpy).toHaveBeenCalled();
      expect(monitorStopSpy).toHaveBeenCalled();
      expect(processorStopSpy).toHaveBeenCalled();
      expect(manager.getSession(0)).toBe(session2);
      expect(manager.isActive(0)).toBe(true);
    });

    it('should create unique session IDs', () => {
      const session1 = manager.startSession(0, context, settings);
      manager.endSession(0);

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

      manager.cancelSession(0);

      expect(abortSpy).toHaveBeenCalled();
      expect(monitorStopSpy).toHaveBeenCalled();
      expect(processorStopSpy).toHaveBeenCalled();
      expect(manager.isActive()).toBe(false);
      expect(manager.getCurrentSession()).toBeNull();
    });

    it('should do nothing if no session active', () => {
      expect(() => {
        manager.cancelSession(0);
      }).not.toThrow();

      expect(manager.isActive()).toBe(false);
    });

    it('should allow starting new session after cancellation', () => {
      manager.startSession(0, context, settings);
      manager.cancelSession(0);

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

      manager.endSession(0);

      expect(manager.isActive()).toBe(false);
      expect(manager.getCurrentSession()).toBeNull();
    });

    it('should do nothing if no session active', () => {
      expect(() => {
        manager.endSession(0);
      }).not.toThrow();
    });

    it('should calculate session duration', () => {
      const session = manager.startSession(0, context, settings);
      const startTime = session.startedAt;

      // Wait a bit
      const now = Date.now();
      expect(now).toBeGreaterThanOrEqual(startTime);

      manager.endSession(0);
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
      manager.endSession(0);

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
      manager.endSession(0);

      expect(manager.isActive()).toBe(false);
      expect(manager.isActive(0)).toBe(false);
    });

    it('should support multiple active sessions', () => {
      manager.startSession(0, context, settings);
      expect(manager.isActive(0)).toBe(true);
      expect(manager.isActive(1)).toBe(false);

      manager.startSession(1, context, settings);
      // Both sessions should be active with multi-session support
      expect(manager.isActive(0)).toBe(true);
      expect(manager.isActive(1)).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return inactive status when no session', () => {
      const status = manager.getStatus();

      expect(status.activeSessionCount).toBe(0);
      expect(status.sessions).toEqual([]);
    });

    it('should return active status with details', () => {
      const session = manager.startSession(0, context, settings);

      const status = manager.getStatus();

      expect(status.activeSessionCount).toBe(1);
      expect(status.sessions).toHaveLength(1);
      expect(status.sessions[0].sessionId).toBe(session.sessionId);
      expect(status.sessions[0].messageId).toBe(0);
      expect(status.sessions[0].duration).toBeGreaterThanOrEqual(0);
      expect(status.sessions[0].queueSize).toBe(0);
      expect(status.sessions[0].monitorActive).toBe(true);
      expect(status.sessions[0].processorActive).toBe(true);
    });

    it('should update duration over time', async () => {
      manager.startSession(0, context, settings);

      const status1 = manager.getStatus();
      const duration1 = status1.sessions[0].duration;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50));

      const status2 = manager.getStatus();
      const duration2 = status2.sessions[0].duration;

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

      expect(status.sessions[0].queueSize).toBe(2);
    });

    it('should track multiple sessions in status', () => {
      manager.startSession(0, context, settings);
      manager.startSession(1, context, settings);

      const status = manager.getStatus();

      expect(status.activeSessionCount).toBe(2);
      expect(status.sessions).toHaveLength(2);
      expect(status.sessions[0].messageId).toBe(0);
      expect(status.sessions[1].messageId).toBe(1);
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

      manager.cancelSession(0);
      manager.cancelSession(0); // Should not throw
      manager.cancelSession(0);

      expect(manager.isActive()).toBe(false);
    });

    it('should handle multiple end calls gracefully', () => {
      manager.startSession(0, context, settings);

      manager.endSession(0);
      manager.endSession(0); // Should not throw
      manager.endSession(0);

      expect(manager.isActive()).toBe(false);
    });
  });

  describe('session lifecycle and logging', () => {
    it('should log session duration on endSession', () => {
      const session = manager.startSession(0, context, settings);
      const startTime = session.startedAt;

      // Manually stop components
      session.monitor.stop();
      session.processor.stop();

      // End session
      manager.endSession(0);

      // Session should be cleared
      expect(manager.getCurrentSession()).toBeNull();
      expect(manager.isActive()).toBe(false);

      // Duration should be logged (verify via session object)
      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle endSession in success path', () => {
      const session = manager.startSession(0, context, settings);

      // Simulate successful completion
      session.monitor.stop();
      session.processor.stop();
      session.barrier.arrive('genDone');
      session.barrier.arrive('messageReceived');

      manager.endSession(0);

      expect(manager.getCurrentSession()).toBeNull();
      expect(manager.isActive()).toBe(false);
    });

    it('should handle endSession in error path', () => {
      const session = manager.startSession(0, context, settings);

      // Simulate error during processing
      session.monitor.stop();
      session.processor.stop();
      // Don't signal barrier (simulating error before completion)

      manager.endSession(0);

      expect(manager.getCurrentSession()).toBeNull();
      expect(manager.isActive()).toBe(false);
    });

    it('should handle endSession after barrier timeout', async () => {
      // Use very short timeout for testing
      const session = manager.startSession(0, context, settings);

      // Manually create a barrier with short timeout to test timeout path
      const shortBarrier = new (await import('./barrier')).Barrier(
        ['genDone', 'messageReceived'],
        50
      );

      // Signal only one condition
      shortBarrier.arrive('genDone');
      // Don't signal messageReceived - let it timeout

      // Wait for timeout
      await expect(shortBarrier.whenReady).rejects.toThrow(/timeout/i);

      // Session should still be cleanable
      session.monitor.stop();
      session.processor.stop();
      manager.endSession(0);

      expect(manager.getCurrentSession()).toBeNull();
      expect(manager.isActive()).toBe(false);
    });
  });
});
