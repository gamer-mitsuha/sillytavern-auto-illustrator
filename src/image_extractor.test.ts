import {describe, it, expect} from 'vitest';
import {extractImagePrompts, hasImagePrompts} from './image_extractor';

describe('image_extractor', () => {
  describe('hasImagePrompts', () => {
    it('should return true when text contains image prompts', () => {
      const text = 'Some text <img_prompt="a beautiful sunset"> more text';
      expect(hasImagePrompts(text)).toBe(true);
    });

    it('should return false when text has no image prompts', () => {
      const text = 'Just some regular text without any prompts';
      expect(hasImagePrompts(text)).toBe(false);
    });

    it('should return false for empty text', () => {
      expect(hasImagePrompts('')).toBe(false);
    });
  });

  describe('extractImagePrompts', () => {
    it('should extract single image prompt', () => {
      const text =
        'The dragon appeared <img_prompt="fierce red dragon breathing fire"> in the sky.';
      const matches = extractImagePrompts(text);

      expect(matches).toHaveLength(1);
      expect(matches[0].prompt).toBe('fierce red dragon breathing fire');
      expect(matches[0].fullMatch).toBe(
        '<img_prompt="fierce red dragon breathing fire">'
      );
    });

    it('should extract multiple image prompts', () => {
      const text = `The knight rode <img_prompt="medieval knight on horseback"> through the forest.
        Suddenly, a castle appeared <img_prompt="ancient stone castle with tall towers">.`;
      const matches = extractImagePrompts(text);

      expect(matches).toHaveLength(2);
      expect(matches[0].prompt).toBe('medieval knight on horseback');
      expect(matches[1].prompt).toBe('ancient stone castle with tall towers');
    });

    it('should handle prompts with special characters', () => {
      const text =
        'A scene <img_prompt="character with blue eyes & long hair"> appears.';
      const matches = extractImagePrompts(text);

      expect(matches).toHaveLength(1);
      expect(matches[0].prompt).toBe('character with blue eyes & long hair');
      expect(matches[0].prompt).toContain('&');
    });

    it('should return empty array for text without prompts', () => {
      const text = 'Just some regular text';
      const matches = extractImagePrompts(text);

      expect(matches).toHaveLength(0);
    });

    it('should handle malformed prompts gracefully', () => {
      const text = 'Text with <img_prompt="unclosed prompt and more text';
      const matches = extractImagePrompts(text);

      // Should not match malformed prompt
      expect(matches).toHaveLength(0);
    });

    it('should preserve position information', () => {
      const text = 'Start <img_prompt="test prompt"> end';
      const matches = extractImagePrompts(text);

      expect(matches[0].startIndex).toBeGreaterThan(0);
      expect(matches[0].endIndex).toBeGreaterThan(matches[0].startIndex);
      expect(text.substring(matches[0].startIndex, matches[0].endIndex)).toBe(
        matches[0].fullMatch
      );
    });

    it('should skip empty prompts', () => {
      const text = 'Text with <img_prompt=""> empty prompt';
      const matches = extractImagePrompts(text);

      // Empty prompts should be skipped (malformed during streaming)
      expect(matches).toHaveLength(0);
    });

    it('should skip whitespace-only prompts', () => {
      const text = 'Text with <img_prompt="   "> whitespace prompt';
      const matches = extractImagePrompts(text);

      // Whitespace-only prompts should be skipped
      expect(matches).toHaveLength(0);
    });

    it('should handle prompts with nested quotes', () => {
      const text = 'A <img_prompt="character saying \\"hello\\""> scene';
      const matches = extractImagePrompts(text);

      expect(matches).toHaveLength(1);
      expect(matches[0].prompt).toContain('saying');
    });

    it('should not match incomplete tag - missing closing quote and bracket', () => {
      const text = 'Streaming in progress <img_prompt="partial';
      const matches = extractImagePrompts(text);

      expect(matches).toHaveLength(0);
    });

    it('should not match incomplete tag - missing closing bracket', () => {
      const text = 'Streaming in progress <img_prompt="complete text"';
      const matches = extractImagePrompts(text);

      expect(matches).toHaveLength(0);
    });

    it('should not match incomplete tag - opening tag only', () => {
      const text = 'Streaming in progress <img_prompt=';
      const matches = extractImagePrompts(text);

      expect(matches).toHaveLength(0);
    });

    it('should match complete tag after incomplete ones in streaming text', () => {
      const text =
        'First <img_prompt="incomplete then <img_prompt="complete tag"> done';
      const matches = extractImagePrompts(text);

      // Should only match the complete tag
      expect(matches).toHaveLength(1);
      expect(matches[0].prompt).toBe('complete tag');
    });
  });
});
