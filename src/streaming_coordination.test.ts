/**
 * Integration Tests for Streaming Coordination
 * Tests the barrier pattern coordination between image generation and message finalization
 */

import {describe, it, expect, beforeEach} from 'vitest';
import {Barrier} from './barrier';
import {SessionManager} from './session_manager';
import {createMockContext} from './test_helpers';
import {getDefaultSettings} from './settings';

describe('Streaming Coordination Integration', () => {
  let context: SillyTavernContext;
  let settings: AutoIllustratorSettings;

  beforeEach(() => {
    context = createMockContext();
    settings = getDefaultSettings();
  });

  describe('barrier coordination scenarios', () => {
    it('should handle genDone arriving BEFORE messageReceived', async () => {
      const barrier = new Barrier(['genDone', 'messageReceived'], 5000);

      // Simulate image generation completing first
      const imageGeneration = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        barrier.arrive('genDone');
        return ['image1.png', 'image2.png'];
      };

      // Simulate MESSAGE_RECEIVED arriving later
      const messageReceived = async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
        barrier.arrive('messageReceived');
      };

      // Start both operations
      const [images] = await Promise.all([
        imageGeneration(),
        messageReceived(),
        barrier.whenReady,
      ]);

      expect(barrier.isResolved()).toBe(true);
      expect(images).toHaveLength(2);
    });

    it('should handle messageReceived arriving BEFORE genDone', async () => {
      const barrier = new Barrier(['genDone', 'messageReceived'], 5000);

      // Simulate MESSAGE_RECEIVED arriving first
      const messageReceived = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        barrier.arrive('messageReceived');
      };

      // Simulate image generation completing later
      const imageGeneration = async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
        barrier.arrive('genDone');
        return ['image1.png', 'image2.png'];
      };

      // Start both operations
      const [images] = await Promise.all([
        imageGeneration(),
        messageReceived(),
        barrier.whenReady,
      ]);

      expect(barrier.isResolved()).toBe(true);
      expect(images).toHaveLength(2);
    });

    it('should handle barrier timeout when messageReceived never arrives', async () => {
      const barrier = new Barrier(['genDone', 'messageReceived'], 200);

      // Simulate image generation completing
      const imageGeneration = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        barrier.arrive('genDone');
        return ['image1.png'];
      };

      // messageReceived never arrives (simulating stuck streaming)
      const images = await imageGeneration();

      // Barrier should timeout
      await expect(barrier.whenReady).rejects.toThrow(/timeout/i);
      await expect(barrier.whenReady).rejects.toThrow('messageReceived');

      // Images were generated but insertion should be skipped
      expect(images).toHaveLength(1);
    });

    it('should handle both conditions arriving nearly simultaneously', async () => {
      const barrier = new Barrier(['genDone', 'messageReceived'], 5000);

      // Both arrive at almost the same time
      const arrivals = Promise.all([
        (async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          barrier.arrive('genDone');
        })(),
        (async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          barrier.arrive('messageReceived');
        })(),
      ]);

      await arrivals;
      await expect(barrier.whenReady).resolves.toBeUndefined();
      expect(barrier.isResolved()).toBe(true);
    });
  });

  describe('session manager integration', () => {
    it('should coordinate session lifecycle with barrier', async () => {
      const manager = new SessionManager();
      const session = manager.startSession(0, context, settings);

      expect(session.barrier.getRemainingConditions()).toContain('genDone');
      expect(session.barrier.getRemainingConditions()).toContain(
        'messageReceived'
      );

      // Simulate generation completion
      session.barrier.arrive('genDone');
      expect(session.barrier.getRemainingCount()).toBe(1);

      // Simulate message finalization
      session.barrier.arrive('messageReceived');
      expect(session.barrier.getRemainingCount()).toBe(0);

      await expect(session.barrier.whenReady).resolves.toBeUndefined();

      // Clean up
      session.monitor.stop();
      session.processor.stop();
      manager.endSession(0);

      expect(manager.getCurrentSession()).toBeNull();
    });

    it('should handle timeout in session context', async () => {
      const manager = new SessionManager();
      const session = manager.startSession(0, context, settings);

      // Create a short-timeout barrier for testing
      const testBarrier = new Barrier(['genDone', 'messageReceived'], 100);

      // Signal only one condition
      testBarrier.arrive('genDone');

      // Barrier should timeout
      await expect(testBarrier.whenReady).rejects.toThrow(/timeout/i);

      // Session should still be cleanable after timeout
      session.monitor.stop();
      session.processor.stop();
      manager.endSession(0);

      expect(manager.getCurrentSession()).toBeNull();
    });

    it('should handle session cancellation during barrier wait', async () => {
      const manager = new SessionManager();
      const session = manager.startSession(0, context, settings);

      // Signal only one condition
      session.barrier.arrive('genDone');

      // Cancel session before messageReceived arrives
      manager.cancelSession(0);

      expect(manager.getCurrentSession()).toBeNull();
      expect(manager.isActive()).toBe(false);
    });
  });

  describe('real-world streaming scenarios', () => {
    it('should handle fast streaming with quick MESSAGE_RECEIVED', async () => {
      const barrier = new Barrier(['genDone', 'messageReceived'], 5000);

      // Simulate very fast streaming (message received in 100ms)
      const fastStreaming = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        barrier.arrive('messageReceived');
      };

      // Simulate normal generation (200ms)
      const generation = async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        barrier.arrive('genDone');
      };

      await Promise.all([fastStreaming(), generation(), barrier.whenReady]);

      expect(barrier.isResolved()).toBe(true);
    });

    it('should handle slow streaming with late MESSAGE_RECEIVED', async () => {
      const barrier = new Barrier(['genDone', 'messageReceived'], 5000);

      // Simulate slow streaming (message received in 500ms)
      const slowStreaming = async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        barrier.arrive('messageReceived');
      };

      // Simulate fast generation (100ms)
      const generation = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        barrier.arrive('genDone');
      };

      await Promise.all([slowStreaming(), generation(), barrier.whenReady]);

      expect(barrier.isResolved()).toBe(true);
    });

    it('should handle multiple sequential streaming sessions', async () => {
      const manager = new SessionManager();

      // First session
      const session1 = manager.startSession(0, context, settings);
      session1.barrier.arrive('genDone');
      session1.barrier.arrive('messageReceived');
      await session1.barrier.whenReady;
      session1.monitor.stop();
      session1.processor.stop();
      manager.endSession(0);

      expect(manager.getSession(0)).toBeNull();
      expect(manager.getCurrentSession()).toBeNull();

      // Second session
      const session2 = manager.startSession(1, context, settings);
      session2.barrier.arrive('genDone');
      session2.barrier.arrive('messageReceived');
      await session2.barrier.whenReady;
      session2.monitor.stop();
      session2.processor.stop();
      manager.endSession(1);

      expect(manager.getSession(1)).toBeNull();
      expect(manager.getCurrentSession()).toBeNull();
    });
  });

  describe('error recovery scenarios', () => {
    it('should recover from barrier timeout and allow new session', async () => {
      const manager = new SessionManager();
      const session1 = manager.startSession(0, context, settings);

      // Create short-timeout barrier for testing
      const testBarrier = new Barrier(['genDone', 'messageReceived'], 50);
      testBarrier.arrive('genDone');

      // Wait for timeout
      await expect(testBarrier.whenReady).rejects.toThrow(/timeout/i);

      // Clean up failed session
      session1.monitor.stop();
      session1.processor.stop();
      manager.endSession(0);

      // Should be able to start new session
      const session2 = manager.startSession(1, context, settings);
      expect(session2).toBeDefined();
      expect(manager.isActive(1)).toBe(true);

      // Clean up
      session2.monitor.stop();
      session2.processor.stop();
      manager.endSession(1);
    });

    it('should handle rapid session changes', () => {
      const manager = new SessionManager();

      // Rapidly create new sessions (simulating fast message switches)
      manager.startSession(0, context, settings);
      expect(manager.isActive(0)).toBe(true);

      manager.startSession(1, context, settings);
      // With multi-session support, both should be active
      expect(manager.isActive(0)).toBe(true);
      expect(manager.isActive(1)).toBe(true);

      const session3 = manager.startSession(2, context, settings);
      // All three sessions should be active with multi-session support
      expect(manager.isActive(0)).toBe(true);
      expect(manager.isActive(1)).toBe(true);
      expect(manager.isActive(2)).toBe(true);

      // Clean up all sessions
      manager.cancelSession(0);
      manager.cancelSession(1);
      session3.monitor.stop();
      session3.processor.stop();
      manager.endSession(2);
    });
  });

  describe('performance and concurrency', () => {
    it('should handle high-frequency barrier arrivals', async () => {
      const barrier = new Barrier(['genDone', 'messageReceived'], 1000);

      // Rapidly signal conditions
      const arrivals = [];
      for (let i = 0; i < 100; i++) {
        arrivals.push(
          (async () => {
            await new Promise(resolve => setTimeout(resolve, i % 2));
            if (i === 0) barrier.arrive('genDone');
            if (i === 1) barrier.arrive('messageReceived');
          })()
        );
      }

      await Promise.all(arrivals);
      await expect(barrier.whenReady).resolves.toBeUndefined();
      expect(barrier.isResolved()).toBe(true);
    });

    it('should not deadlock with concurrent barrier waits', async () => {
      const barrier = new Barrier(['genDone', 'messageReceived'], 5000);

      // Multiple concurrent waiters
      const waiters = [];
      for (let i = 0; i < 10; i++) {
        waiters.push(barrier.whenReady);
      }

      // Signal conditions
      barrier.arrive('genDone');
      barrier.arrive('messageReceived');

      // All waiters should resolve
      await expect(Promise.all(waiters)).resolves.toBeDefined();
    });
  });
});
