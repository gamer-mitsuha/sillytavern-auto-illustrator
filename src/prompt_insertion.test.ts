/**
 * Tests for Prompt Insertion Module
 */

import {describe, it, expect} from 'vitest';
import {
  insertPromptTagsWithContext,
  isValidSuggestion,
  type PromptSuggestion,
} from './prompt_insertion';

describe('prompt_insertion', () => {
  describe('insertPromptTagsWithContext', () => {
    const tagTemplate = '<!--img-prompt="{PROMPT}"-->';

    it('should insert a single prompt tag at the correct position', () => {
      const messageText = 'She walked through the forest under the moonlight.';
      const suggestions: PromptSuggestion[] = [
        {
          text: '1girl, forest, moonlight, highly detailed',
          insertAfter: 'the forest',
          insertBefore: ' under',
        },
      ];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      expect(result.insertedCount).toBe(1);
      expect(result.failedSuggestions).toHaveLength(0);
      expect(result.updatedText).toContain(
        '<!--img-prompt="1girl, forest, moonlight, highly detailed"-->'
      );
      expect(result.updatedText).toMatch(/the forest\s+<!--img-prompt/);
      expect(result.updatedText).toMatch(/-->\s+under/);
    });

    it('should insert multiple prompt tags in correct order', () => {
      const messageText =
        'She entered the garden. The roses were blooming. Birds sang in the trees.';
      const suggestions: PromptSuggestion[] = [
        {
          text: 'garden, flowers',
          insertAfter: 'entered the garden',
          insertBefore: '. The roses',
        },
        {
          text: 'birds, trees',
          insertAfter: 'sang in the trees',
          insertBefore: '.',
        },
      ];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      expect(result.insertedCount).toBe(2);
      expect(result.failedSuggestions).toHaveLength(0);
      expect(result.updatedText).toContain(
        '<!--img-prompt="garden, flowers"-->'
      );
      expect(result.updatedText).toContain('<!--img-prompt="birds, trees"-->');
    });

    it('should skip prompt when context is not found', () => {
      const messageText = 'She walked through the forest.';
      const suggestions: PromptSuggestion[] = [
        {
          text: 'ocean, waves',
          insertAfter: 'at the beach',
          insertBefore: 'under the sun',
        },
      ];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      expect(result.insertedCount).toBe(0);
      expect(result.failedSuggestions).toHaveLength(1);
      expect(result.updatedText).toBe(messageText); // Unchanged
    });

    it('should handle case-insensitive context matching', () => {
      const messageText = 'She WALKED through THE FOREST.';
      const suggestions: PromptSuggestion[] = [
        {
          text: 'forest scene',
          insertAfter: 'through the forest',
          insertBefore: '.',
        },
      ];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      expect(result.insertedCount).toBe(1);
      expect(result.updatedText).toContain('<!--img-prompt="forest scene"-->');
    });

    it('should insert prompt at message start when insertAfter is at the beginning', () => {
      const messageText = 'The sun rose over the mountains.';
      const suggestions: PromptSuggestion[] = [
        {
          text: 'sunrise, mountains',
          insertAfter: 'The sun',
          insertBefore: ' rose',
        },
      ];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      expect(result.insertedCount).toBe(1);
      expect(result.updatedText).toContain(
        '<!--img-prompt="sunrise, mountains"-->'
      );
      expect(result.updatedText).toMatch(/The sun\s+<!--img-prompt/);
      expect(result.updatedText).toMatch(/-->\s+rose/);
    });

    it('should insert prompt at message end when insertBefore is at the end', () => {
      const messageText = 'She smiled at the beautiful sunset.';
      const suggestions: PromptSuggestion[] = [
        {
          text: 'sunset, beautiful',
          insertAfter: 'beautiful sunset',
          insertBefore: '.',
        },
      ];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      expect(result.insertedCount).toBe(1);
      expect(result.updatedText).toContain(
        'beautiful sunset <!--img-prompt="sunset, beautiful"--> .'
      );
    });

    it('should handle multiple prompts with some failing', () => {
      const messageText = 'She walked through the forest and reached the lake.';
      const suggestions: PromptSuggestion[] = [
        {
          text: 'forest scene',
          insertAfter: 'the forest',
          insertBefore: ' and',
        },
        {
          text: 'ocean waves', // This should fail (ocean not in text)
          insertAfter: 'at the ocean',
          insertBefore: 'with waves',
        },
        {
          text: 'lake view',
          insertAfter: 'the lake',
          insertBefore: '.',
        },
      ];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      expect(result.insertedCount).toBe(2);
      expect(result.failedSuggestions).toHaveLength(1);
      expect(result.failedSuggestions[0].text).toBe('ocean waves');
      expect(result.updatedText).toContain('<!--img-prompt="forest scene"-->');
      expect(result.updatedText).toContain('<!--img-prompt="lake view"-->');
    });

    it('should escape regex special characters in context', () => {
      const messageText = 'She asked: "What?" He replied: "Nothing."';
      const suggestions: PromptSuggestion[] = [
        {
          text: 'dialogue scene',
          insertAfter: '"What?"',
          insertBefore: ' He',
        },
      ];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      expect(result.insertedCount).toBe(1);
      expect(result.updatedText).toContain(
        '<!--img-prompt="dialogue scene"-->'
      );
    });

    it('should handle empty suggestions array', () => {
      const messageText = 'She walked through the forest.';
      const suggestions: PromptSuggestion[] = [];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      expect(result.insertedCount).toBe(0);
      expect(result.failedSuggestions).toHaveLength(0);
      expect(result.updatedText).toBe(messageText);
    });

    it('should use default tag format when template has no placeholder', () => {
      const messageText = 'She walked through the forest.';
      const suggestions: PromptSuggestion[] = [
        {
          text: 'forest scene',
          insertAfter: 'the forest',
          insertBefore: '.',
        },
      ];
      const invalidTemplate = 'no-placeholder-template';

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        invalidTemplate
      );

      expect(result.insertedCount).toBe(1);
      // Should fall back to default format
      expect(result.updatedText).toContain('<!--img-prompt="forest scene"-->');
    });

    it('should fail when insertAfter and insertBefore are not adjacent', () => {
      const messageText = 'She entered the garden. The roses were blooming.';
      const suggestions: PromptSuggestion[] = [
        {
          text: 'garden scene',
          // Missing the period and space between "garden" and "The"
          insertAfter: 'entered the garden',
          insertBefore: 'The roses were',
        },
      ];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      // Should fail because "entered the gardenThe roses were" doesn't exist
      expect(result.insertedCount).toBe(0);
      expect(result.failedSuggestions).toHaveLength(1);
      expect(result.updatedText).toBe(messageText); // Unchanged
    });

    it('should succeed when insertAfter and insertBefore are adjacent with correct spacing', () => {
      const messageText = 'She entered the garden. The roses were blooming.';
      const suggestions: PromptSuggestion[] = [
        {
          text: 'garden scene',
          // Correctly includes period and space
          insertAfter: 'entered the garden. ',
          insertBefore: 'The roses were',
        },
      ];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      // Should succeed because "entered the garden. The roses were" exists
      expect(result.insertedCount).toBe(1);
      expect(result.failedSuggestions).toHaveLength(0);
      expect(result.updatedText).toContain('<!--img-prompt="garden scene"-->');
    });

    it('should handle extra spaces between insertAfter and insertBefore', () => {
      const messageText = 'She entered the garden.  The roses were blooming.';
      const suggestions: PromptSuggestion[] = [
        {
          text: 'garden scene',
          // LLM provided single space but message has double space
          insertAfter: 'entered the garden. ',
          insertBefore: 'The roses were',
        },
      ];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      // Should still succeed due to flexible whitespace matching
      expect(result.insertedCount).toBe(1);
      expect(result.failedSuggestions).toHaveLength(0);
      expect(result.updatedText).toContain('<!--img-prompt="garden scene"-->');
    });

    it('should handle newlines between insertAfter and insertBefore', () => {
      const messageText = 'She entered the garden.\n\nThe roses were blooming.';
      const suggestions: PromptSuggestion[] = [
        {
          text: 'garden scene',
          // LLM provided single space but message has newlines
          insertAfter: 'entered the garden.',
          insertBefore: 'The roses were',
        },
      ];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      // Should succeed due to flexible whitespace matching
      expect(result.insertedCount).toBe(1);
      expect(result.failedSuggestions).toHaveLength(0);
      expect(result.updatedText).toContain('<!--img-prompt="garden scene"-->');
    });

    it('should handle missing space if content is actually adjacent', () => {
      const messageText = 'She entered the garden.The roses were blooming.';
      const suggestions: PromptSuggestion[] = [
        {
          text: 'garden scene',
          // LLM forgot the space
          insertAfter: 'entered the garden.',
          insertBefore: 'The roses were',
        },
      ];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      // Should succeed - flexible matching allows \s* (zero or more spaces)
      expect(result.insertedCount).toBe(1);
      expect(result.failedSuggestions).toHaveLength(0);
      expect(result.updatedText).toContain('<!--img-prompt="garden scene"-->');
    });

    it('should handle prompts that need to be inserted from left to right', () => {
      const messageText = 'First part. Second part. Third part.';
      const suggestions: PromptSuggestion[] = [
        // Intentionally out of order
        {
          text: 'third',
          insertAfter: 'Third part',
          insertBefore: '.',
        },
        {
          text: 'first',
          insertAfter: 'First part',
          insertBefore: '. Second',
        },
        {
          text: 'second',
          insertAfter: 'Second part',
          insertBefore: '. Third',
        },
      ];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      expect(result.insertedCount).toBe(3);
      // Check that all prompts are inserted
      expect(result.updatedText).toContain('<!--img-prompt="first"-->');
      expect(result.updatedText).toContain('<!--img-prompt="second"-->');
      expect(result.updatedText).toContain('<!--img-prompt="third"-->');

      // Verify order is maintained (first before second before third)
      const firstIndex = result.updatedText.indexOf(
        '<!--img-prompt="first"-->'
      );
      const secondIndex = result.updatedText.indexOf(
        '<!--img-prompt="second"-->'
      );
      const thirdIndex = result.updatedText.indexOf(
        '<!--img-prompt="third"-->'
      );
      expect(firstIndex).toBeLessThan(secondIndex);
      expect(secondIndex).toBeLessThan(thirdIndex);
    });

    it('should handle Unicode characters in context', () => {
      const messageText = '彼女は森を歩いた。月光の下で。';
      const suggestions: PromptSuggestion[] = [
        {
          text: 'forest, moonlight',
          insertAfter: '森を歩いた',
          insertBefore: '。月光の下で',
        },
      ];

      const result = insertPromptTagsWithContext(
        messageText,
        suggestions,
        tagTemplate
      );

      expect(result.insertedCount).toBe(1);
      expect(result.updatedText).toContain(
        '<!--img-prompt="forest, moonlight"-->'
      );
    });
  });

  describe('isValidSuggestion', () => {
    it('should return true for valid suggestion', () => {
      const suggestion: PromptSuggestion = {
        text: 'forest scene',
        insertAfter: 'through the forest',
        insertBefore: 'under the moon',
      };

      expect(isValidSuggestion(suggestion)).toBe(true);
    });

    it('should return false when text is missing', () => {
      const suggestion = {
        insertAfter: 'through the forest',
        insertBefore: 'under the moon',
      } as Partial<PromptSuggestion>;

      expect(isValidSuggestion(suggestion)).toBe(false);
    });

    it('should return false when text is empty', () => {
      const suggestion: PromptSuggestion = {
        text: '',
        insertAfter: 'through the forest',
        insertBefore: 'under the moon',
      };

      expect(isValidSuggestion(suggestion)).toBe(false);
    });

    it('should return false when insertAfter is missing', () => {
      const suggestion = {
        text: 'forest scene',
        insertBefore: 'under the moon',
      } as Partial<PromptSuggestion>;

      expect(isValidSuggestion(suggestion)).toBe(false);
    });

    it('should return false when insertBefore is missing', () => {
      const suggestion = {
        text: 'forest scene',
        insertAfter: 'through the forest',
      } as Partial<PromptSuggestion>;

      expect(isValidSuggestion(suggestion)).toBe(false);
    });

    it('should return false when fields are only whitespace', () => {
      const suggestion: PromptSuggestion = {
        text: '   ',
        insertAfter: '  ',
        insertBefore: '\t',
      };

      expect(isValidSuggestion(suggestion)).toBe(false);
    });

    it('should return true even if reasoning is missing (optional field)', () => {
      const suggestion: PromptSuggestion = {
        text: 'forest scene',
        insertAfter: 'through the forest',
        insertBefore: 'under the moon',
        // reasoning is undefined
      };

      expect(isValidSuggestion(suggestion)).toBe(true);
    });
  });
});
