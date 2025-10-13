import {describe, it, expect, beforeEach, vi} from 'vitest';
import {
  generateImage,
  replacePromptsWithImages,
  parseCommonTags,
  deduplicateTags,
  validateCommonTags,
  applyCommonTags,
} from './image_generator';
import {createMockContext} from './test_helpers';

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

      const text = 'Text before <!--img-prompt="sunset scene"--> text after';
      const result = await replacePromptsWithImages(text, mockContext);

      expect(result).toContain('<!--img-prompt="sunset scene"-->');
      expect(result).toContain('<img src="https://example.com/image1.png"');
      expect(result).toContain('title="AI generated image #1"');
      expect(result).toContain('alt="AI generated image #1"');
      // Check that image comes after the prompt
      const promptIndex = result.indexOf('<!--img-prompt="sunset scene"-->');
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
        'Start <!--img-prompt="scene 1"--> middle <!--img-prompt="scene 2"--> end';
      const result = await replacePromptsWithImages(text, mockContext);

      expect(result).toContain('<!--img-prompt="scene 1"-->');
      expect(result).toContain('<!--img-prompt="scene 2"-->');
      expect(result).toContain('https://example.com/image1.png');
      expect(result).toContain('https://example.com/image2.png');
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    it('should keep prompt tags if image generation fails', async () => {
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

      const text = 'Text <!--img-prompt="failed prompt"--> more text';
      const result = await replacePromptsWithImages(text, mockContext);

      // Prompt tag should be preserved to allow retry and show what was attempted
      expect(result).toBe(text);
      expect(result).toContain('<!--img-prompt="failed prompt"-->');
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

      const text = 'Start <!--img-prompt="middle"--> end';
      const result = await replacePromptsWithImages(text, mockContext);

      expect(result).toContain('<!--img-prompt="middle"-->');
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
        '<!--img-prompt="first"--> <!--img-prompt="second"--> <!--img-prompt="third"-->';
      await replacePromptsWithImages(text, mockContext);

      // Verify calls happened sequentially (each call number should be consecutive)
      expect(callOrder).toEqual([1, 2, 3]);
      expect(mockCallback).toHaveBeenCalledTimes(3);
    });

    it('should use simple title and alt attributes', async () => {
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

      const text =
        '<!--img-prompt="rating:nsfw, asuna_(sao), danbooru, 1girl, close-up"-->';
      const result = await replacePromptsWithImages(text, mockContext);

      // Should use simple, safe title/alt (avoids all special character issues)
      expect(result).toContain('<!--img-prompt="rating:nsfw, asuna_(sao)');
      expect(result).toContain('title="AI generated image #1"');
      expect(result).toContain('alt="AI generated image #1"');
      expect(result).toContain('https://example.com/image.png');
    });

    it('should handle prompts with parentheses and special chars', async () => {
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

      // Test with parentheses and other valid prompt characters
      const text = '<!--img-prompt="character (masterpiece), detailed face"-->';
      const result = await replacePromptsWithImages(text, mockContext);

      // Simple title/alt works with any valid prompt characters
      expect(result).toContain('title="AI generated image #1"');
      expect(result).toContain('alt="AI generated image #1"');
      expect(result).toContain('https://example.com/image.png');
      // Original prompt tag should remain unchanged
      expect(result).toContain(
        '<!--img-prompt="character (masterpiece), detailed face"-->'
      );
    });
  });

  describe('parseCommonTags', () => {
    it('should parse comma-separated tags', () => {
      const result = parseCommonTags('tag1, tag2, tag3');
      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should trim whitespace from tags', () => {
      const result = parseCommonTags('  tag1  ,  tag2  ,  tag3  ');
      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should filter out empty tags', () => {
      const result = parseCommonTags('tag1, , tag2,  , tag3');
      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should return empty array for empty string', () => {
      expect(parseCommonTags('')).toEqual([]);
      expect(parseCommonTags('   ')).toEqual([]);
    });

    it('should handle single tag', () => {
      const result = parseCommonTags('single-tag');
      expect(result).toEqual(['single-tag']);
    });
  });

  describe('deduplicateTags', () => {
    it('should remove duplicate tags (case-insensitive)', () => {
      const result = deduplicateTags([
        'masterpiece',
        'Masterpiece',
        'MASTERPIECE',
      ]);
      expect(result).toEqual(['masterpiece']);
    });

    it('should preserve first occurrence casing', () => {
      const result = deduplicateTags([
        'HighQuality',
        'highquality',
        'HIGHQUALITY',
      ]);
      expect(result).toEqual(['HighQuality']);
    });

    it('should handle no duplicates', () => {
      const result = deduplicateTags(['tag1', 'tag2', 'tag3']);
      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should handle empty array', () => {
      const result = deduplicateTags([]);
      expect(result).toEqual([]);
    });

    it('should handle complex deduplication scenario', () => {
      const result = deduplicateTags([
        'masterpiece',
        'high quality',
        'Masterpiece',
        'detailed',
        'HIGH QUALITY',
        'Detailed',
      ]);
      expect(result).toEqual(['masterpiece', 'high quality', 'detailed']);
    });
  });

  describe('validateCommonTags', () => {
    it('should accept valid tag strings', () => {
      expect(validateCommonTags('tag1, tag2, tag3')).toEqual({valid: true});
      expect(validateCommonTags('masterpiece, high quality')).toEqual({
        valid: true,
      });
      expect(validateCommonTags('')).toEqual({valid: true});
    });

    it('should reject tags with invalid characters', () => {
      const invalidChars = ['<', '>', '{', '}', '[', ']', '\\'];
      for (const char of invalidChars) {
        const result = validateCommonTags(`tag1${char}, tag2`);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid characters');
      }
    });

    it('should accept tags with parentheses and other special chars', () => {
      // These are commonly used in image prompts
      expect(validateCommonTags('tag(masterpiece), tag:quality')).toEqual({
        valid: true,
      });
    });
  });

  describe('applyCommonTags', () => {
    it('should add common tags as prefix', () => {
      const result = applyCommonTags(
        'character, scene',
        'masterpiece, quality',
        'prefix'
      );
      expect(result).toBe('masterpiece, quality, character, scene');
    });

    it('should add common tags as suffix', () => {
      const result = applyCommonTags(
        'character, scene',
        'masterpiece, quality',
        'suffix'
      );
      expect(result).toBe('character, scene, masterpiece, quality');
    });

    it('should deduplicate tags (case-insensitive)', () => {
      const result = applyCommonTags(
        'Masterpiece, character',
        'masterpiece, quality',
        'prefix'
      );
      expect(result).toBe('masterpiece, quality, character');
    });

    it('should preserve first occurrence casing during deduplication', () => {
      const result = applyCommonTags(
        'HighQuality, character',
        'masterpiece, highquality',
        'prefix'
      );
      expect(result).toBe('masterpiece, highquality, character');
    });

    it('should return original prompt if common tags is empty', () => {
      expect(applyCommonTags('character, scene', '', 'prefix')).toBe(
        'character, scene'
      );
      expect(applyCommonTags('character, scene', '  ', 'suffix')).toBe(
        'character, scene'
      );
    });

    it('should handle complex deduplication with prefix', () => {
      const result = applyCommonTags(
        'masterpiece, character, quality',
        'quality, detailed, Masterpiece',
        'prefix'
      );
      // First occurrence wins, so: quality, detailed, Masterpiece (from common), character
      expect(result).toBe('quality, detailed, Masterpiece, character');
    });

    it('should handle complex deduplication with suffix', () => {
      const result = applyCommonTags(
        'masterpiece, character, quality',
        'quality, detailed, Masterpiece',
        'suffix'
      );
      // First occurrence wins, so: masterpiece (from prompt), character, quality (from prompt), detailed
      expect(result).toBe('masterpiece, character, quality, detailed');
    });
  });
});
