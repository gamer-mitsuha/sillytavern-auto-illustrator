import {describe, it, expect, beforeEach, vi} from 'vitest';
import {
  generateImage,
  replacePromptsWithImages,
  insertImageIntoMessage,
} from './image_generator';
import {createMockContext} from './test_helpers';

// Mock toastr globally
(globalThis as any).toastr = {
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
};

describe('image_generator', () => {
  describe('generateImage', () => {
    beforeEach(() => {
      // Reset mocks before each test
      vi.clearAllMocks();
    });

    it('should call sd slash command with correct parameters', async () => {
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
      });

      const imageUrl = await generateImage('a beautiful sunset', mockContext);

      expect(mockCallback).toHaveBeenCalledWith(
        {quiet: 'true'},
        'a beautiful sunset'
      );
      expect(imageUrl).toBe('https://example.com/image.png');
    });

    it('should return null on error', async () => {
      const mockCallback = vi.fn().mockRejectedValue(new Error('SD error'));
      const mockContext = createMockContext({
        SlashCommandParser: {
          commands: {
            sd: {
              callback: mockCallback,
            },
          },
        },
      });

      const imageUrl = await generateImage('test prompt', mockContext);

      expect(imageUrl).toBeNull();
    });

    it('should return null if sd command not available', async () => {
      const mockContext = createMockContext({
        SlashCommandParser: {
          commands: {},
        },
      });

      const imageUrl = await generateImage('test prompt', mockContext);

      expect(imageUrl).toBeNull();
    });
  });

  describe('replacePromptsWithImages', () => {
    it('should preserve prompt tag and add image on next line', async () => {
      const mockCallback = vi
        .fn()
        .mockResolvedValue('https://example.com/image1.png');
      const mockContext = createMockContext({
        SlashCommandParser: {
          commands: {
            sd: {
              callback: mockCallback,
            },
          },
        },
      });

      const text = 'Text before <img_prompt="sunset scene"> text after';
      const result = await replacePromptsWithImages(text, mockContext);

      expect(result).toContain('<img_prompt="sunset scene">');
      expect(result).toContain('<img src="https://example.com/image1.png"');
      expect(result).toContain('title="sunset scene"');
      expect(result).toContain('alt="sunset scene"');
      // Check that image comes after the prompt
      const promptIndex = result.indexOf('<img_prompt="sunset scene">');
      const imgIndex = result.indexOf('<img src=');
      expect(imgIndex).toBeGreaterThan(promptIndex);
    });

    it('should preserve multiple prompts and add images', async () => {
      const mockCallback = vi
        .fn()
        .mockResolvedValueOnce('https://example.com/image1.png')
        .mockResolvedValueOnce('https://example.com/image2.png');
      const mockContext = createMockContext({
        SlashCommandParser: {
          commands: {
            sd: {
              callback: mockCallback,
            },
          },
        },
      });

      const text =
        'Start <img_prompt="scene 1"> middle <img_prompt="scene 2"> end';
      const result = await replacePromptsWithImages(text, mockContext);

      expect(result).toContain('<img_prompt="scene 1">');
      expect(result).toContain('<img_prompt="scene 2">');
      expect(result).toContain('https://example.com/image1.png');
      expect(result).toContain('https://example.com/image2.png');
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    it('should remove prompt tags if image generation fails', async () => {
      const mockCallback = vi.fn().mockResolvedValue(null);
      const mockContext = createMockContext({
        SlashCommandParser: {
          commands: {
            sd: {
              callback: mockCallback,
            },
          },
        },
      });

      const text = 'Text <img_prompt="failed prompt"> more text';
      const result = await replacePromptsWithImages(text, mockContext);

      expect(result).toBe('Text  more text');
      expect(result).not.toContain('<img_prompt');
    });

    it('should return original text if no prompts found', async () => {
      const mockContext = createMockContext({
        SlashCommandParser: {
          commands: {
            sd: {
              callback: vi.fn(),
            },
          },
        },
      });

      const text = 'Just some regular text without prompts';
      const result = await replacePromptsWithImages(text, mockContext);

      expect(result).toBe(text);
    });

    it('should preserve text order and position', async () => {
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
      });

      const text = 'Start <img_prompt="middle"> end';
      const result = await replacePromptsWithImages(text, mockContext);

      expect(result).toContain('<img_prompt="middle">');
      expect(result.indexOf('Start')).toBe(0);
      expect(result.indexOf('end')).toBeGreaterThan(0);
      expect(result).toContain('https://example.com/image.png');
    });

    it('should generate images sequentially to avoid rate limiting', async () => {
      const callOrder: number[] = [];
      const mockCallback = vi.fn().mockImplementation(async () => {
        const callNumber = mockCallback.mock.calls.length;
        callOrder.push(callNumber);
        // Simulate async delay
        await new Promise(resolve => setTimeout(resolve, 10));
        return `https://example.com/image${callNumber}.png`;
      });

      const mockContext = createMockContext({
        SlashCommandParser: {
          commands: {
            sd: {
              callback: mockCallback,
            },
          },
        },
      });

      const text =
        '<img_prompt="first"> <img_prompt="second"> <img_prompt="third">';
      await replacePromptsWithImages(text, mockContext);

      // Verify calls happened sequentially (each call number should be consecutive)
      expect(callOrder).toEqual([1, 2, 3]);
      expect(mockCallback).toHaveBeenCalledTimes(3);
    });
  });

  describe('insertImageIntoMessage', () => {
    it('should insert image after prompt in message', async () => {
      const mockEmit = vi.fn();
      const mockContext = createMockContext({
        chat: [
          {
            mes: 'Text <img_prompt="test prompt"> more text',
            is_user: false,
          },
        ],
        eventSource: {
          on: vi.fn(),
          once: vi.fn(),
          emit: mockEmit,
        },
        eventTypes: {
          MESSAGE_EDITED: 'MESSAGE_EDITED',
        },
      });

      const promptInfo = {
        id: 'test_id',
        prompt: 'test prompt',
        startIndex: 5,
        endIndex: 31,
        state: 'COMPLETED' as const,
        attempts: 1,
        detectedAt: Date.now(),
      };

      await insertImageIntoMessage(
        promptInfo,
        'https://example.com/test.jpg',
        0,
        mockContext
      );

      expect(mockContext.chat[0].mes).toContain('<img_prompt="test prompt">');
      expect(mockContext.chat[0].mes).toContain(
        '<img src="https://example.com/test.jpg"'
      );
      expect(mockEmit).toHaveBeenCalledWith('MESSAGE_EDITED', 0);
    });

    it('should handle message not found', async () => {
      const mockContext = createMockContext({
        chat: [],
      });

      const promptInfo = {
        id: 'test_id',
        prompt: 'test',
        startIndex: 0,
        endIndex: 10,
        state: 'COMPLETED' as const,
        attempts: 1,
        detectedAt: Date.now(),
      };

      // Should not throw
      await insertImageIntoMessage(promptInfo, 'test.jpg', 0, mockContext);
    });

    it('should handle prompt tag not found in text', async () => {
      const mockContext = createMockContext({
        chat: [
          {
            mes: 'Text without the prompt tag',
            is_user: false,
          },
        ],
      });

      const promptInfo = {
        id: 'test_id',
        prompt: 'nonexistent prompt',
        startIndex: 0,
        endIndex: 10,
        state: 'COMPLETED' as const,
        attempts: 1,
        detectedAt: Date.now(),
      };

      await insertImageIntoMessage(promptInfo, 'test.jpg', 0, mockContext);

      // Message should be unchanged
      expect(mockContext.chat[0].mes).toBe('Text without the prompt tag');
    });

    it('should not insert duplicate images', async () => {
      const initialMessage =
        '<img_prompt="test">\n<img src="existing.jpg" title="test" alt="test">';
      const mockContext = createMockContext({
        chat: [
          {
            mes: initialMessage,
            is_user: false,
          },
        ],
      });

      const promptInfo = {
        id: 'test_id',
        prompt: 'test',
        startIndex: 0,
        endIndex: 20,
        state: 'COMPLETED' as const,
        attempts: 1,
        detectedAt: Date.now(),
      };

      await insertImageIntoMessage(promptInfo, 'existing.jpg', 0, mockContext);

      // Should not add duplicate - message should be unchanged
      expect(mockContext.chat[0].mes).toBe(initialMessage);
    });

    it('should handle growing streaming text with position search', async () => {
      const mockEmit = vi.fn();
      const mockContext = createMockContext({
        chat: [
          {
            // Text has grown since prompt was detected
            mes: 'Before <img_prompt="test"> middle text and more new streamed text...',
            is_user: false,
          },
        ],
        eventSource: {
          on: vi.fn(),
          once: vi.fn(),
          emit: mockEmit,
        },
        eventTypes: {
          MESSAGE_EDITED: 'MESSAGE_EDITED',
        },
      });

      const promptInfo = {
        id: 'test_id',
        prompt: 'test',
        startIndex: 7, // Original position when detected
        endIndex: 26,
        state: 'COMPLETED' as const,
        attempts: 1,
        detectedAt: Date.now(),
      };

      await insertImageIntoMessage(promptInfo, 'test.jpg', 0, mockContext);

      // Should still find and insert the image
      expect(mockContext.chat[0].mes).toContain('<img src="test.jpg"');
      expect(mockEmit).toHaveBeenCalled();
    });

    it('should preserve existing text before and after insertion', async () => {
      const mockContext = createMockContext({
        chat: [
          {
            mes: 'Start <img_prompt="test"> End',
            is_user: false,
          },
        ],
        eventSource: {
          on: vi.fn(),
          once: vi.fn(),
          emit: vi.fn(),
        },
      });

      const promptInfo = {
        id: 'test_id',
        prompt: 'test',
        startIndex: 6,
        endIndex: 26,
        state: 'COMPLETED' as const,
        attempts: 1,
        detectedAt: Date.now(),
      };

      await insertImageIntoMessage(promptInfo, 'test.jpg', 0, mockContext);

      expect(mockContext.chat[0].mes).toContain('Start');
      expect(mockContext.chat[0].mes).toContain('End');
      expect(mockContext.chat[0].mes).toContain('<img_prompt="test">');
    });
  });
});
