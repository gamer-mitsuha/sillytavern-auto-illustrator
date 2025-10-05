import {describe, it, expect, beforeEach, vi} from 'vitest';
import {generateImage, replacePromptsWithImages} from './image_generator';

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
      const mockContext = {
        SlashCommandParser: {
          commands: {
            sd: {
              callback: mockCallback,
            },
          },
        },
      };

      const imageUrl = await generateImage('a beautiful sunset', mockContext);

      expect(mockCallback).toHaveBeenCalledWith(
        {quiet: 'true'},
        'a beautiful sunset'
      );
      expect(imageUrl).toBe('https://example.com/image.png');
    });

    it('should return null on error', async () => {
      const mockCallback = vi.fn().mockRejectedValue(new Error('SD error'));
      const mockContext = {
        SlashCommandParser: {
          commands: {
            sd: {
              callback: mockCallback,
            },
          },
        },
      };

      const imageUrl = await generateImage('test prompt', mockContext);

      expect(imageUrl).toBeNull();
    });

    it('should return null if sd command not available', async () => {
      const mockContext = {
        SlashCommandParser: {
          commands: {},
        },
      };

      const imageUrl = await generateImage('test prompt', mockContext);

      expect(imageUrl).toBeNull();
    });
  });

  describe('replacePromptsWithImages', () => {
    it('should replace single prompt with image', async () => {
      const mockCallback = vi
        .fn()
        .mockResolvedValue('https://example.com/image1.png');
      const mockContext = {
        SlashCommandParser: {
          commands: {
            sd: {
              callback: mockCallback,
            },
          },
        },
      };

      const text = 'Text before <img_prompt="sunset scene"> text after';
      const result = await replacePromptsWithImages(text, mockContext);

      expect(result).toContain('<img src="https://example.com/image1.png"');
      expect(result).toContain('title="sunset scene"');
      expect(result).toContain('alt="sunset scene"');
      expect(result).not.toContain('<img_prompt');
    });

    it('should replace multiple prompts with images', async () => {
      const mockCallback = vi
        .fn()
        .mockResolvedValueOnce('https://example.com/image1.png')
        .mockResolvedValueOnce('https://example.com/image2.png');
      const mockContext = {
        SlashCommandParser: {
          commands: {
            sd: {
              callback: mockCallback,
            },
          },
        },
      };

      const text =
        'Start <img_prompt="scene 1"> middle <img_prompt="scene 2"> end';
      const result = await replacePromptsWithImages(text, mockContext);

      expect(result).toContain('https://example.com/image1.png');
      expect(result).toContain('https://example.com/image2.png');
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    it('should remove prompt tags if image generation fails', async () => {
      const mockCallback = vi.fn().mockResolvedValue(null);
      const mockContext = {
        SlashCommandParser: {
          commands: {
            sd: {
              callback: mockCallback,
            },
          },
        },
      };

      const text = 'Text <img_prompt="failed prompt"> more text';
      const result = await replacePromptsWithImages(text, mockContext);

      expect(result).toBe('Text  more text');
      expect(result).not.toContain('<img_prompt');
    });

    it('should return original text if no prompts found', async () => {
      const mockContext = {
        SlashCommandParser: {
          commands: {
            sd: {
              callback: vi.fn(),
            },
          },
        },
      };

      const text = 'Just some regular text without prompts';
      const result = await replacePromptsWithImages(text, mockContext);

      expect(result).toBe(text);
    });

    it('should preserve text order and position', async () => {
      const mockCallback = vi
        .fn()
        .mockResolvedValue('https://example.com/image.png');
      const mockContext = {
        SlashCommandParser: {
          commands: {
            sd: {
              callback: mockCallback,
            },
          },
        },
      };

      const text = 'Start <img_prompt="middle"> end';
      const result = await replacePromptsWithImages(text, mockContext);

      expect(result).toMatch(/^Start .+ end$/);
      expect(result.indexOf('Start')).toBe(0);
      expect(result.indexOf('end')).toBeGreaterThan(0);
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

      const mockContext = {
        SlashCommandParser: {
          commands: {
            sd: {
              callback: mockCallback,
            },
          },
        },
      } as any;

      const text =
        '<img_prompt="first"> <img_prompt="second"> <img_prompt="third">';
      await replacePromptsWithImages(text, mockContext);

      // Verify calls happened sequentially (each call number should be consecutive)
      expect(callOrder).toEqual([1, 2, 3]);
      expect(mockCallback).toHaveBeenCalledTimes(3);
    });
  });
});
