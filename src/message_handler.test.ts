import {describe, it, expect, beforeEach, vi} from 'vitest';
import {createMockContext} from './test_helpers';
import {createMessageHandler, processMessageImages} from './message_handler';

// Mock toastr globally
interface GlobalWithToastr {
  toastr: {
    success: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warning: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
}

(globalThis as unknown as GlobalWithToastr).toastr = {
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
        chat_metadata: {},
      });

      const message =
        'Text with <!--img-prompt="beautiful scene"--> in the middle';
      const messageId = 0;

      await processMessageImages(message, messageId, mockContext);

      expect(mockContext.chat[0].mes).toContain(
        '<!--img-prompt="beautiful scene"-->'
      );
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
        chat_metadata: {},
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
        chat_metadata: {},
      });

      const message = 'Text with <!--img-prompt="test"-->';
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
        chat_metadata: {},
        eventSource: {
          on: vi.fn(),
          once: vi.fn(),
          emit: vi.fn(),
        },
        chat: [],
      });

      const mockSettings = {streamingEnabled: false} as AutoIllustratorSettings;
      const handler = createMessageHandler(mockContext, mockSettings);
      expect(typeof handler).toBe('function');
    });

    it('should process message and emit MESSAGE_EDITED event', async () => {
      const mockCallback = vi
        .fn()
        .mockResolvedValue('https://example.com/image.png');
      const mockEmit = vi.fn();
      const mockSaveChat = vi.fn().mockResolvedValue(undefined);
      const mockUpdateMessageBlock = vi.fn();
      const MESSAGE_EDITED = 'MESSAGE_EDITED';
      const MESSAGE_UPDATED = 'MESSAGE_UPDATED';
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
          once: vi.fn(),
          emit: mockEmit,
        },
        eventTypes: {
          MESSAGE_EDITED: MESSAGE_EDITED,
          MESSAGE_UPDATED: MESSAGE_UPDATED,
        },
        chat: [
          {
            is_user: false,
            mes: 'Here is a scene <!--img-prompt="test scene"-->',
          },
        ],
        chat_metadata: {},
        saveChat: mockSaveChat,
        updateMessageBlock: mockUpdateMessageBlock,
      });

      const mockSettings = {streamingEnabled: false} as AutoIllustratorSettings;
      const handler = createMessageHandler(mockContext, mockSettings);
      await handler(0);

      // Should call updateMessageBlock to render images in DOM
      expect(mockUpdateMessageBlock).toHaveBeenCalledWith(
        0,
        mockContext.chat[0]
      );

      // Should call emit with MESSAGE_EDITED and MESSAGE_UPDATED event types
      expect(mockEmit).toHaveBeenCalledWith(MESSAGE_EDITED, 0);
      expect(mockEmit).toHaveBeenCalledWith(MESSAGE_UPDATED, 0);
    });
  });
});
