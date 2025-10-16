/**
 * Tests for Prompt Generation Service
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {generatePromptsForMessage} from './prompt_generation_service';

describe('prompt_generation_service', () => {
  let mockContext: SillyTavernContext;
  let mockSettings: AutoIllustratorSettings;

  beforeEach(() => {
    // Create mock context with generateRaw
    mockContext = {
      generateRaw: vi.fn(),
    } as unknown as SillyTavernContext;

    // Create mock settings
    mockSettings = {
      maxPromptsPerMessage: 5,
      promptGenerationMode: 'llm-post',
    } as AutoIllustratorSettings;
  });

  describe('generatePromptsForMessage', () => {
    it('should parse valid JSON response with single prompt', async () => {
      const messageText = 'She walked through the forest under the moonlight.';
      const llmResponse = JSON.stringify({
        prompts: [
          {
            text: '1girl, forest, moonlight, highly detailed',
            insertAfter: 'through the forest',
            insertBefore: 'under the moonlight',
            reasoning: 'Key visual scene',
          },
        ],
      });

      vi.mocked(mockContext.generateRaw).mockResolvedValue(llmResponse);

      const result = await generatePromptsForMessage(
        messageText,
        mockContext,
        mockSettings
      );

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('1girl, forest, moonlight, highly detailed');
      expect(result[0].insertAfter).toBe('through the forest');
      expect(result[0].insertBefore).toBe('under the moonlight');
      expect(result[0].reasoning).toBe('Key visual scene');
    });

    it('should parse valid JSON response with multiple prompts', async () => {
      const messageText = 'Complex scene with multiple events.';
      const llmResponse = JSON.stringify({
        prompts: [
          {
            text: 'first scene',
            insertAfter: 'event one',
            insertBefore: 'event two',
          },
          {
            text: 'second scene',
            insertAfter: 'event two',
            insertBefore: 'event three',
          },
        ],
      });

      vi.mocked(mockContext.generateRaw).mockResolvedValue(llmResponse);

      const result = await generatePromptsForMessage(
        messageText,
        mockContext,
        mockSettings
      );

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('first scene');
      expect(result[1].text).toBe('second scene');
    });

    it('should handle JSON response with explanatory text before/after', async () => {
      const messageText = 'Test message.';
      const llmResponse = `Here are the prompts:\n${JSON.stringify({
        prompts: [
          {
            text: 'test prompt',
            insertAfter: 'test',
            insertBefore: 'message',
          },
        ],
      })}\nHope this helps!`;

      vi.mocked(mockContext.generateRaw).mockResolvedValue(llmResponse);

      const result = await generatePromptsForMessage(
        messageText,
        mockContext,
        mockSettings
      );

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('test prompt');
    });

    it('should return empty array when LLM returns no prompts', async () => {
      const messageText = 'No visual content here.';
      const llmResponse = JSON.stringify({
        prompts: [],
      });

      vi.mocked(mockContext.generateRaw).mockResolvedValue(llmResponse);

      const result = await generatePromptsForMessage(
        messageText,
        mockContext,
        mockSettings
      );

      expect(result).toHaveLength(0);
    });

    it('should return empty array on malformed JSON', async () => {
      const messageText = 'Test message.';
      const llmResponse = 'This is not valid JSON { prompts:';

      vi.mocked(mockContext.generateRaw).mockResolvedValue(llmResponse);

      const result = await generatePromptsForMessage(
        messageText,
        mockContext,
        mockSettings
      );

      expect(result).toHaveLength(0);
    });

    it('should return empty array when LLM response missing prompts array', async () => {
      const messageText = 'Test message.';
      const llmResponse = JSON.stringify({
        something: 'else',
      });

      vi.mocked(mockContext.generateRaw).mockResolvedValue(llmResponse);

      const result = await generatePromptsForMessage(
        messageText,
        mockContext,
        mockSettings
      );

      expect(result).toHaveLength(0);
    });

    it('should skip prompts with missing required fields', async () => {
      const messageText = 'Test message.';
      const llmResponse = JSON.stringify({
        prompts: [
          {
            text: 'valid prompt',
            insertAfter: 'test',
            insertBefore: 'message',
          },
          {
            // Missing text field
            insertAfter: 'test',
            insertBefore: 'message',
          },
          {
            text: 'another valid',
            insertAfter: 'another',
            insertBefore: 'test',
          },
        ],
      });

      vi.mocked(mockContext.generateRaw).mockResolvedValue(llmResponse);

      const result = await generatePromptsForMessage(
        messageText,
        mockContext,
        mockSettings
      );

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('valid prompt');
      expect(result[1].text).toBe('another valid');
    });

    it('should skip prompts with empty fields', async () => {
      const messageText = 'Test message.';
      const llmResponse = JSON.stringify({
        prompts: [
          {
            text: 'valid prompt',
            insertAfter: 'test',
            insertBefore: 'message',
          },
          {
            text: '',
            insertAfter: 'test',
            insertBefore: 'message',
          },
          {
            text: 'valid',
            insertAfter: '',
            insertBefore: 'message',
          },
        ],
      });

      vi.mocked(mockContext.generateRaw).mockResolvedValue(llmResponse);

      const result = await generatePromptsForMessage(
        messageText,
        mockContext,
        mockSettings
      );

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('valid prompt');
    });

    it('should respect maxPromptsPerMessage limit', async () => {
      const messageText = 'Test message.';
      const llmResponse = JSON.stringify({
        prompts: [
          {text: 'prompt1', insertAfter: 'a', insertBefore: 'b'},
          {text: 'prompt2', insertAfter: 'c', insertBefore: 'd'},
          {text: 'prompt3', insertAfter: 'e', insertBefore: 'f'},
          {text: 'prompt4', insertAfter: 'g', insertBefore: 'h'},
          {text: 'prompt5', insertAfter: 'i', insertBefore: 'j'},
          {text: 'prompt6', insertAfter: 'k', insertBefore: 'l'}, // Should be cut off
          {text: 'prompt7', insertAfter: 'm', insertBefore: 'n'}, // Should be cut off
        ],
      });

      vi.mocked(mockContext.generateRaw).mockResolvedValue(llmResponse);

      // Settings has maxPromptsPerMessage = 5
      const result = await generatePromptsForMessage(
        messageText,
        mockContext,
        mockSettings
      );

      expect(result).toHaveLength(5);
      expect(result.map(p => p.text)).toEqual([
        'prompt1',
        'prompt2',
        'prompt3',
        'prompt4',
        'prompt5',
      ]);
    });

    it('should handle maxPromptsPerMessage limit of 1', async () => {
      const messageText = 'Test message.';
      const llmResponse = JSON.stringify({
        prompts: [
          {text: 'prompt1', insertAfter: 'a', insertBefore: 'b'},
          {text: 'prompt2', insertAfter: 'c', insertBefore: 'd'},
        ],
      });

      vi.mocked(mockContext.generateRaw).mockResolvedValue(llmResponse);

      mockSettings.maxPromptsPerMessage = 1;

      const result = await generatePromptsForMessage(
        messageText,
        mockContext,
        mockSettings
      );

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('prompt1');
    });

    it('should return empty array when generateRaw throws error', async () => {
      const messageText = 'Test message.';

      vi.mocked(mockContext.generateRaw).mockRejectedValue(
        new Error('Network error')
      );

      const result = await generatePromptsForMessage(
        messageText,
        mockContext,
        mockSettings
      );

      expect(result).toHaveLength(0);
    });

    it('should throw error when generateRaw is not available', async () => {
      const messageText = 'Test message.';
      const contextWithoutGenerateRaw = {} as SillyTavernContext;

      await expect(
        generatePromptsForMessage(
          messageText,
          contextWithoutGenerateRaw,
          mockSettings
        )
      ).rejects.toThrow('LLM generation not available');
    });

    it('should trim whitespace from prompt fields', async () => {
      const messageText = 'Test message.';
      const llmResponse = JSON.stringify({
        prompts: [
          {
            text: '  prompt with spaces  ',
            insertAfter: '  after  ',
            insertBefore: '  before  ',
            reasoning: '  reasoning  ',
          },
        ],
      });

      vi.mocked(mockContext.generateRaw).mockResolvedValue(llmResponse);

      const result = await generatePromptsForMessage(
        messageText,
        mockContext,
        mockSettings
      );

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('prompt with spaces');
      expect(result[0].insertAfter).toBe('after');
      expect(result[0].insertBefore).toBe('before');
      expect(result[0].reasoning).toBe('reasoning');
    });

    it('should handle prompts with special characters', async () => {
      const messageText = 'Test message.';
      const llmResponse = JSON.stringify({
        prompts: [
          {
            text: '1girl, "quoted text", special\\nchars',
            insertAfter: 'test "quoted"',
            insertBefore: 'message.',
          },
        ],
      });

      vi.mocked(mockContext.generateRaw).mockResolvedValue(llmResponse);

      const result = await generatePromptsForMessage(
        messageText,
        mockContext,
        mockSettings
      );

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('1girl, "quoted text", special\\nchars');
      expect(result[0].insertAfter).toBe('test "quoted"');
    });

    it('should handle Unicode characters in prompts', async () => {
      const messageText = '彼女は森を歩いた。';
      const llmResponse = JSON.stringify({
        prompts: [
          {
            text: '1girl, 森, 月光',
            insertAfter: '彼女は',
            insertBefore: '森を歩いた',
          },
        ],
      });

      vi.mocked(mockContext.generateRaw).mockResolvedValue(llmResponse);

      const result = await generatePromptsForMessage(
        messageText,
        mockContext,
        mockSettings
      );

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('1girl, 森, 月光');
    });

    it('should handle reasoning field being optional', async () => {
      const messageText = 'Test message.';
      const llmResponse = JSON.stringify({
        prompts: [
          {
            text: 'prompt without reasoning',
            insertAfter: 'test',
            insertBefore: 'message',
            // No reasoning field
          },
        ],
      });

      vi.mocked(mockContext.generateRaw).mockResolvedValue(llmResponse);

      const result = await generatePromptsForMessage(
        messageText,
        mockContext,
        mockSettings
      );

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('prompt without reasoning');
      expect(result[0].reasoning).toBeUndefined();
    });
  });
});
