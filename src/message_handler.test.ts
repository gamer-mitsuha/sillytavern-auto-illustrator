/**
 * Tests for Message Handler V2 Module
 */

import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {
  handleStreamTokenStarted,
  handleMessageReceived,
} from './message_handler';

// Mock dependencies
vi.mock('./logger', () => ({
  createLogger: () => ({
    trace: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('./session_manager', () => ({
  sessionManager: {
    startStreamingSession: vi.fn(),
    finalizeStreamingAndInsert: vi.fn(),
    getSession: vi.fn(),
    cancelSession: vi.fn(),
  },
}));

describe('Message Handler V2', () => {
  let mockContext: any;
  let mockSettings: any;
  let mockSessionManager: any;

  beforeEach(async () => {
    // Get the mocked sessionManager
    const {sessionManager} = await import('./session_manager');
    mockSessionManager = sessionManager;
    mockContext = {
      chat: [
        {mes: 'Message 0', is_user: true},
        {mes: 'Message 1', is_user: false, name: 'Assistant'},
        {mes: 'Message 2', is_user: false, name: 'Assistant'},
      ],
    };

    mockSettings = {
      streamingEnabled: true,
      promptDetectionPatterns: ['<!--img-prompt="([^"]+)"-->'],
      promptGenerationMode: 'regex', // Default to regex mode
      maxPromptsPerMessage: 5,
    };

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleStreamTokenStarted', () => {
    it('should start a streaming session', async () => {
      mockSessionManager.startStreamingSession.mockResolvedValue({
        sessionId: 'session1',
        messageId: 1,
        type: 'streaming',
      });

      await handleStreamTokenStarted(1, mockContext, mockSettings);

      expect(mockSessionManager.startStreamingSession).toHaveBeenCalledWith(
        1,
        mockContext,
        mockSettings
      );
    });

    it('should handle errors during session start', async () => {
      mockSessionManager.startStreamingSession.mockRejectedValue(
        new Error('Test error')
      );

      // Should not throw, just log error
      await expect(
        handleStreamTokenStarted(1, mockContext, mockSettings)
      ).resolves.not.toThrow();

      expect(mockSessionManager.startStreamingSession).toHaveBeenCalled();
    });
  });

  describe('handleMessageReceived', () => {
    it('should finalize streaming session when active', async () => {
      mockSessionManager.getSession.mockReturnValue({
        sessionId: 'session1',
        messageId: 1,
        type: 'streaming',
      });
      mockSessionManager.finalizeStreamingAndInsert.mockResolvedValue(3);

      await handleMessageReceived(1, mockContext, mockSettings);

      expect(mockSessionManager.getSession).toHaveBeenCalledWith(1);
      expect(
        mockSessionManager.finalizeStreamingAndInsert
      ).toHaveBeenCalledWith(1, mockContext);
    });

    it('should skip if message not found', async () => {
      await handleMessageReceived(999, mockContext, mockSettings);

      expect(mockSessionManager.getSession).not.toHaveBeenCalled();
      expect(
        mockSessionManager.finalizeStreamingAndInsert
      ).not.toHaveBeenCalled();
    });

    it('should skip if message is from user', async () => {
      await handleMessageReceived(0, mockContext, mockSettings);

      expect(mockSessionManager.getSession).not.toHaveBeenCalled();
      expect(
        mockSessionManager.finalizeStreamingAndInsert
      ).not.toHaveBeenCalled();
    });

    it('should skip if no active session exists', async () => {
      mockSessionManager.getSession.mockReturnValue(null);

      await handleMessageReceived(1, mockContext, mockSettings);

      expect(mockSessionManager.getSession).toHaveBeenCalledWith(1);
      expect(
        mockSessionManager.finalizeStreamingAndInsert
      ).not.toHaveBeenCalled();
    });

    it('should skip if session type is not streaming', async () => {
      mockSessionManager.getSession.mockReturnValue({
        sessionId: 'session1',
        messageId: 1,
        type: 'regeneration', // Not streaming
      });

      await handleMessageReceived(1, mockContext, mockSettings);

      expect(mockSessionManager.getSession).toHaveBeenCalledWith(1);
      expect(
        mockSessionManager.finalizeStreamingAndInsert
      ).not.toHaveBeenCalled();
    });

    it('should handle errors during finalization', async () => {
      mockSessionManager.getSession.mockReturnValue({
        sessionId: 'session1',
        messageId: 1,
        type: 'streaming',
      });
      mockSessionManager.finalizeStreamingAndInsert.mockRejectedValue(
        new Error('Test error')
      );

      // Should not throw, just log error
      await expect(
        handleMessageReceived(1, mockContext, mockSettings)
      ).resolves.not.toThrow();

      expect(mockSessionManager.finalizeStreamingAndInsert).toHaveBeenCalled();
    });

    it('should handle system messages', async () => {
      mockContext.chat[1].is_system = true;

      mockSessionManager.getSession.mockReturnValue({
        sessionId: 'session1',
        messageId: 1,
        type: 'streaming',
      });
      mockSessionManager.finalizeStreamingAndInsert.mockResolvedValue(2);

      await handleMessageReceived(1, mockContext, mockSettings);

      // Should process even for system messages (only skip user messages)
      expect(mockSessionManager.finalizeStreamingAndInsert).toHaveBeenCalled();
    });
  });
});
