/**
 * Unit tests for message_renderer.ts
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderMessageUpdate} from './message_renderer';
import * as metadata from '../metadata';

// Mock the metadata module
vi.mock('../metadata', () => ({
  saveMetadata: vi.fn(),
}));

// Mock the logger
vi.mock('../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  }),
}));

describe('message_renderer', () => {
  let mockContext: any;
  let mockEventSource: any;
  let mockMessage: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Reset saveMetadata mock to resolve successfully
    vi.mocked(metadata.saveMetadata).mockResolvedValue(undefined);

    // Create mock message
    mockMessage = {
      mes: 'Test message content',
      name: 'TestUser',
    };

    // Create mock event source
    mockEventSource = {
      emit: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock context
    mockContext = {
      chat: [mockMessage],
      eventSource: mockEventSource,
      eventTypes: {
        MESSAGE_EDITED: 'MESSAGE_EDITED',
        MESSAGE_UPDATED: 'MESSAGE_UPDATED',
      },
      updateMessageBlock: vi.fn(),
    };

    // Mock SillyTavern.getContext()
    (global as any).SillyTavern = {
      getContext: vi.fn().mockReturnValue(mockContext),
    };
  });

  afterEach(() => {
    // Clean up global mock
    delete (global as any).SillyTavern;
  });

  describe('renderMessageUpdate', () => {
    it('should emit MESSAGE_EDITED event', async () => {
      await renderMessageUpdate(0);

      expect(mockEventSource.emit).toHaveBeenCalledWith('MESSAGE_EDITED', 0);
    });

    it('should call updateMessageBlock with correct parameters', async () => {
      await renderMessageUpdate(0);

      expect(mockContext.updateMessageBlock).toHaveBeenCalledWith(
        0,
        mockMessage
      );
    });

    it('should emit MESSAGE_UPDATED event', async () => {
      await renderMessageUpdate(0);

      expect(mockEventSource.emit).toHaveBeenCalledWith('MESSAGE_UPDATED', 0);
    });

    it('should call saveMetadata by default', async () => {
      await renderMessageUpdate(0);

      expect(metadata.saveMetadata).toHaveBeenCalledTimes(1);
    });

    it('should emit events in correct order', async () => {
      const callOrder: string[] = [];

      mockEventSource.emit.mockImplementation((eventType: string) => {
        callOrder.push(`emit:${eventType}`);
        return Promise.resolve();
      });

      mockContext.updateMessageBlock.mockImplementation(() => {
        callOrder.push('updateMessageBlock');
      });

      vi.mocked(metadata.saveMetadata).mockImplementation(async () => {
        callOrder.push('saveMetadata');
      });

      await renderMessageUpdate(0);

      expect(callOrder).toEqual([
        'emit:MESSAGE_EDITED',
        'updateMessageBlock',
        'emit:MESSAGE_UPDATED',
        'saveMetadata',
      ]);
    });

    it('should skip saveMetadata when skipSave is true', async () => {
      await renderMessageUpdate(0, {skipSave: true});

      expect(metadata.saveMetadata).not.toHaveBeenCalled();
    });

    it('should still emit events when skipSave is true', async () => {
      await renderMessageUpdate(0, {skipSave: true});

      expect(mockEventSource.emit).toHaveBeenCalledWith('MESSAGE_EDITED', 0);
      expect(mockEventSource.emit).toHaveBeenCalledWith('MESSAGE_UPDATED', 0);
      expect(mockContext.updateMessageBlock).toHaveBeenCalledWith(
        0,
        mockMessage
      );
    });

    it('should throw error when context is not available', async () => {
      (global as any).SillyTavern.getContext.mockReturnValue(null);

      await expect(renderMessageUpdate(0)).rejects.toThrow(
        'Cannot render message update: SillyTavern context not available'
      );
    });

    it('should throw error when message does not exist', async () => {
      mockContext.chat = []; // Empty chat

      await expect(renderMessageUpdate(0)).rejects.toThrow(
        'Cannot render message update: message 0 not found in chat'
      );
    });

    it('should handle chat being undefined', async () => {
      mockContext.chat = undefined;

      await expect(renderMessageUpdate(0)).rejects.toThrow(
        'Cannot render message update: message 0 not found in chat'
      );
    });

    it('should throw error when messageId is out of bounds', async () => {
      mockContext.chat = [mockMessage]; // Only 1 message

      await expect(renderMessageUpdate(5)).rejects.toThrow(
        'Cannot render message update: message 5 not found in chat'
      );
    });

    it('should work with different message indices', async () => {
      const message1 = {mes: 'Message 1', name: 'User1'};
      const message2 = {mes: 'Message 2', name: 'User2'};
      const message3 = {mes: 'Message 3', name: 'User3'};
      mockContext.chat = [message1, message2, message3];

      await renderMessageUpdate(2);

      expect(mockContext.updateMessageBlock).toHaveBeenCalledWith(2, message3);
      expect(mockEventSource.emit).toHaveBeenCalledWith('MESSAGE_EDITED', 2);
      expect(mockEventSource.emit).toHaveBeenCalledWith('MESSAGE_UPDATED', 2);
    });

    it('should propagate errors from event emission', async () => {
      const testError = new Error('Event emission failed');
      mockEventSource.emit.mockRejectedValue(testError);

      await expect(renderMessageUpdate(0)).rejects.toThrow(
        'Event emission failed'
      );
    });

    it('should propagate errors from saveMetadata', async () => {
      const testError = new Error('Save failed');
      vi.mocked(metadata.saveMetadata).mockRejectedValue(testError);

      await expect(renderMessageUpdate(0)).rejects.toThrow('Save failed');
    });

    it('should not call saveMetadata if error occurs before save step', async () => {
      const testError = new Error('Update failed');
      mockContext.updateMessageBlock.mockImplementation(() => {
        throw testError;
      });

      await expect(renderMessageUpdate(0)).rejects.toThrow('Update failed');
      expect(metadata.saveMetadata).not.toHaveBeenCalled();
    });

    it('should handle undefined options parameter', async () => {
      await renderMessageUpdate(0, undefined);

      expect(metadata.saveMetadata).toHaveBeenCalledTimes(1);
      expect(mockEventSource.emit).toHaveBeenCalledTimes(2);
    });

    it('should handle empty options object', async () => {
      await renderMessageUpdate(0, {});

      expect(metadata.saveMetadata).toHaveBeenCalledTimes(1);
      expect(mockEventSource.emit).toHaveBeenCalledTimes(2);
    });
  });
});
