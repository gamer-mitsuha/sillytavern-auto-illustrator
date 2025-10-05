import {describe, it, expect, beforeEach, vi} from 'vitest';
import {createMockContext} from './test_helpers';
import {createMessageHandler, processMessageImages} from './message_handler';

// Mock toastr globally
(globalThis as any).toastr = {
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
};

describe('message_handler', () => {
  describe('processMessageImages', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should process message with image prompts', async () => {
      const mockCallback = vi
        .fn()
        .mockResolvedValue('https://example.com/image.png');
      const mockContext = createMockContext({
        SlashCommandParser: {
          commands: {
            sd: {
              callback: mockCallback,
            },
          },
        },
        chat: [{is_user: false, mes: 'Original message'}],
      });

      const message = 'Text with <img_prompt="beautiful scene"> in the middle';
      const messageId = 0;

      await processMessageImages(message, messageId, mockContext);

      expect(mockContext.chat[0].mes).not.toContain('<img_prompt');
      expect(mockContext.chat[0].mes).toContain(
        '<img src="https://example.com/image.png"'
      );
    });

    it('should not modify message without image prompts', async () => {
      const originalMessage = 'Just regular text';
      const mockContext = createMockContext({
        SlashCommandParser: {
          commands: {
            sd: {
              callback: vi.fn(),
            },
          },
        },
        chat: [{is_user: false, mes: originalMessage}],
      });

      const messageId = 0;

      await processMessageImages(originalMessage, messageId, mockContext);

      expect(mockContext.chat[0].mes).toBe(originalMessage);
    });

    it('should handle invalid message ID gracefully', async () => {
      const mockContext = createMockContext({
        SlashCommandParser: {
          commands: {
            sd: {
              callback: vi.fn(),
            },
          },
        },
        chat: [],
      });

      const message = 'Text with <img_prompt="test">';
      const messageId = 999;

      await expect(
        processMessageImages(message, messageId, mockContext)
      ).resolves.not.toThrow();
    });
  });

  describe('createMessageHandler', () => {
    it('should return a function', () => {
      const mockContext = createMockContext({
        SlashCommandParser: {
          commands: {
            sd: {
              callback: vi.fn(),
            },
          },
        },
        eventSource: {
          on: vi.fn(),
          emit: vi.fn(),
        },
        chat: [],
      });

      const handler = createMessageHandler(mockContext);
      expect(typeof handler).toBe('function');
    });

    it('should process message and emit MESSAGE_EDITED event', async () => {
      const mockCallback = vi
        .fn()
        .mockResolvedValue('https://example.com/image.png');
      const mockEmit = vi.fn();
      const MESSAGE_EDITED = 'MESSAGE_EDITED';
      const mockContext = createMockContext({
        SlashCommandParser: {
          commands: {
            sd: {
              callback: mockCallback,
            },
          },
        },
        eventSource: {
          on: vi.fn(),
          emit: mockEmit,
        },
        eventTypes: {
          MESSAGE_EDITED: MESSAGE_EDITED,
        },
        chat: [
          {is_user: false, mes: 'Here is a scene <img_prompt="test scene">'},
        ],
      });

      const handler = createMessageHandler(mockContext);
      await handler(0);

      // Should call emit with MESSAGE_EDITED event type constant
      expect(mockEmit).toHaveBeenCalledWith(MESSAGE_EDITED, 0);
    });
  });
});
