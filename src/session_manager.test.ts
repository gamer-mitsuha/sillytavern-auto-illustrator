/**
 * Tests for SessionManager
 * Tests unified session lifecycle for streaming and regeneration
 */

import {describe, it, expect, beforeEach, vi} from 'vitest';
import {SessionManager} from './session_manager';
import {ImageGenerationQueue} from './streaming_image_queue';
import {QueueProcessor} from './queue_processor';
import {StreamingMonitor} from './streaming_monitor';

// Mock global SillyTavern
global.SillyTavern = {
  getContext: vi.fn(),
} as any;

// Mock dependencies
vi.mock('./streaming_image_queue');
vi.mock('./queue_processor');
vi.mock('./streaming_monitor');
vi.mock('./progress_manager', () => ({
  progressManager: {
    updateTotal: vi.fn(),
    registerTask: vi.fn(),
    clear: vi.fn(),
    waitAllComplete: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('./dom_queue', () => ({
  scheduleDomOperation: vi.fn((messageId, fn) => fn()),
}));
vi.mock('./metadata', () => ({
  getMetadata: vi.fn(() => ({})),
}));
vi.mock('./prompt_manager', () => ({
  getPromptNode: vi.fn(() => ({
    id: 'test-prompt-id',
    text: 'test prompt text',
  })),
}));

describe('SessionManager', () => {
  let manager: SessionManager;
  let mockContext: SillyTavernContext;
  let mockSettings: AutoIllustratorSettings;

  beforeEach(() => {
    manager = new SessionManager();

    mockContext = {
      chat: [{mes: 'test message', is_user: false}],
      eventSource: {
        emit: vi.fn(),
      },
      eventTypes: {
        MESSAGE_EDITED: 'MESSAGE_EDITED',
        MESSAGE_UPDATED: 'MESSAGE_UPDATED',
      },
      updateMessageBlock: vi.fn(),
      saveChat: vi.fn(),
    } as unknown as SillyTavernContext;

    mockSettings = {
      monitorPollingInterval: 300,
    } as AutoIllustratorSettings;

    // Setup SillyTavern mock to return mockContext
    global.SillyTavern.getContext = vi.fn().mockReturnValue(mockContext);
  });

  describe('Streaming Sessions', () => {
    it('should create a streaming session', async () => {
      const session = await manager.startStreamingSession(
        0,
        mockContext,
        mockSettings
      );

      expect(session).toBeDefined();
      expect(session.type).toBe('streaming');
      expect(session.messageId).toBe(0);
      expect(session.monitor).toBeDefined();
      expect(session.queue).toBeDefined();
      expect(session.processor).toBeDefined();
    });

    it('should reuse existing streaming session for same message', async () => {
      const session1 = await manager.startStreamingSession(
        0,
        mockContext,
        mockSettings
      );

      const session2 = await manager.startStreamingSession(
        0,
        mockContext,
        mockSettings
      );

      // Should return the same session (reuse logic for STREAM_TOKEN_RECEIVED firing multiple times)
      expect(session2.sessionId).toBe(session1.sessionId);
      expect(manager.getSession(0)).toBe(session2);
    });

    it('should return null for non-existent session', () => {
      const session = manager.getSession(999);
      expect(session).toBeNull();
    });

    it('should check if session is active', async () => {
      expect(manager.isActive(0)).toBe(false);

      await manager.startStreamingSession(0, mockContext, mockSettings);

      expect(manager.isActive(0)).toBe(true);
      expect(manager.isActive()).toBe(true);
    });
  });

  describe('Session Cancellation', () => {
    it('should cancel a session and clean up resources', async () => {
      await manager.startStreamingSession(0, mockContext, mockSettings);

      manager.cancelSession(0);

      expect(manager.getSession(0)).toBeNull();
      expect(manager.isActive(0)).toBe(false);
    });

    it('should do nothing when cancelling non-existent session', () => {
      expect(() => manager.cancelSession(999)).not.toThrow();
    });
  });

  describe('Session Status', () => {
    it('should return empty status when no sessions active', () => {
      const status = manager.getStatus();

      expect(status.totalSessions).toBe(0);
      expect(status.streamingSessions).toBe(0);
      expect(status.regenerationSessions).toBe(0);
      expect(status.sessions).toEqual([]);
    });

    it('should return correct status for active streaming session', async () => {
      await manager.startStreamingSession(0, mockContext, mockSettings);

      const status = manager.getStatus();

      expect(status.totalSessions).toBe(1);
      expect(status.streamingSessions).toBe(1);
      expect(status.regenerationSessions).toBe(0);
      expect(status.sessions).toHaveLength(1);
      expect(status.sessions[0].type).toBe('streaming');
    });
  });

  describe('Session Type', () => {
    it('should return correct session type', async () => {
      await manager.startStreamingSession(0, mockContext, mockSettings);

      expect(manager.getSessionType(0)).toBe('streaming');
    });

    it('should return null for non-existent session', () => {
      expect(manager.getSessionType(999)).toBeNull();
    });
  });
});
