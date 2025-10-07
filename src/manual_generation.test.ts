/**
 * Unit tests for Manual Generation Module
 */

import {describe, it, expect, beforeEach} from 'vitest';
import {hasExistingImage, removeExistingImages} from './manual_generation';

describe('Manual Generation', () => {
  describe('Append mode - finding last image position', () => {
    it('should find position after single image', () => {
      const text = '<img_prompt="test">\n<img src="1.jpg">';
      const promptTag = '<img_prompt="test">';
      const insertPos = promptTag.length;
      const afterPrompt = text.substring(insertPos);

      const imgTagRegex = /\s*<img\s+[^>]*>/g;
      let lastMatchEnd = 0;
      let match;

      while ((match = imgTagRegex.exec(afterPrompt)) !== null) {
        if (
          match.index === lastMatchEnd ||
          afterPrompt.substring(lastMatchEnd, match.index).trim() === ''
        ) {
          lastMatchEnd = imgTagRegex.lastIndex;
        } else {
          break;
        }
      }

      expect(lastMatchEnd).toBeGreaterThan(0);
      expect(afterPrompt.substring(0, lastMatchEnd)).toContain(
        '<img src="1.jpg">'
      );
    });

    it('should find position after multiple consecutive images', () => {
      const text =
        '<img_prompt="test">\n<img src="1.jpg">\n<img src="2.jpg">\n<img src="3.jpg">';
      const promptTag = '<img_prompt="test">';
      const insertPos = promptTag.length;
      const afterPrompt = text.substring(insertPos);

      const imgTagRegex = /\s*<img\s+[^>]*>/g;
      let lastMatchEnd = 0;
      let match;

      while ((match = imgTagRegex.exec(afterPrompt)) !== null) {
        if (
          match.index === lastMatchEnd ||
          afterPrompt.substring(lastMatchEnd, match.index).trim() === ''
        ) {
          lastMatchEnd = imgTagRegex.lastIndex;
        } else {
          break;
        }
      }

      expect(lastMatchEnd).toBeGreaterThan(0);
      const matchedText = afterPrompt.substring(0, lastMatchEnd);
      expect(matchedText).toContain('<img src="1.jpg">');
      expect(matchedText).toContain('<img src="2.jpg">');
      expect(matchedText).toContain('<img src="3.jpg">');
    });

    it('should stop at non-image content', () => {
      const text =
        '<img_prompt="test">\n<img src="1.jpg">\n<img src="2.jpg">\nSome text\n<img src="3.jpg">';
      const promptTag = '<img_prompt="test">';
      const insertPos = promptTag.length;
      const afterPrompt = text.substring(insertPos);

      const imgTagRegex = /\s*<img\s+[^>]*>/g;
      let lastMatchEnd = 0;
      let match;

      while ((match = imgTagRegex.exec(afterPrompt)) !== null) {
        if (
          match.index === lastMatchEnd ||
          afterPrompt.substring(lastMatchEnd, match.index).trim() === ''
        ) {
          lastMatchEnd = imgTagRegex.lastIndex;
        } else {
          break;
        }
      }

      expect(lastMatchEnd).toBeGreaterThan(0);
      const matchedText = afterPrompt.substring(0, lastMatchEnd);
      expect(matchedText).toContain('<img src="1.jpg">');
      expect(matchedText).toContain('<img src="2.jpg">');
      expect(matchedText).not.toContain('Some text');
      expect(matchedText).not.toContain('<img src="3.jpg">');
    });
  });

  describe('hasExistingImage', () => {
    it('should return true when image exists after prompt', () => {
      const text =
        '<img_prompt="test prompt">\n<img src="test.jpg" title="Test" alt="Test">';
      const result = hasExistingImage(text, 'test prompt');
      expect(result).toBe(true);
    });

    it('should return true when image exists with whitespace', () => {
      const text =
        '<img_prompt="test prompt">  \n  <img src="test.jpg" title="Test" alt="Test">';
      const result = hasExistingImage(text, 'test prompt');
      expect(result).toBe(true);
    });

    it('should return false when no image exists after prompt', () => {
      const text = '<img_prompt="test prompt">';
      const result = hasExistingImage(text, 'test prompt');
      expect(result).toBe(false);
    });

    it('should return false when prompt does not exist', () => {
      const text = '<img src="test.jpg" title="Test" alt="Test">';
      const result = hasExistingImage(text, 'test prompt');
      expect(result).toBe(false);
    });

    it('should return false when image exists but not after prompt', () => {
      const text =
        '<img src="test.jpg" title="Test" alt="Test">\n<img_prompt="test prompt">';
      const result = hasExistingImage(text, 'test prompt');
      expect(result).toBe(false);
    });

    it('should handle multiple prompts correctly', () => {
      const text = `<img_prompt="first prompt">
Some text here
<img_prompt="second prompt">
<img src="test.jpg" title="Test" alt="Test">`;
      expect(hasExistingImage(text, 'first prompt')).toBe(false);
      expect(hasExistingImage(text, 'second prompt')).toBe(true);
    });
  });

  describe('removeExistingImages', () => {
    it('should remove image after prompt', () => {
      const text =
        '<img_prompt="test prompt">\n<img src="test.jpg" title="Test" alt="Test">';
      const result = removeExistingImages(text);
      expect(result).toBe('<img_prompt="test prompt">');
    });

    it('should remove multiple images after prompts', () => {
      const text = `<img_prompt="first">
<img src="1.jpg" title="1" alt="1">
Some text
<img_prompt="second">
<img src="2.jpg" title="2" alt="2">`;

      const result = removeExistingImages(text);
      expect(result).toContain('<img_prompt="first">');
      expect(result).toContain('<img_prompt="second">');
      expect(result).not.toContain('<img src="1.jpg"');
      expect(result).not.toContain('<img src="2.jpg"');
      expect(result).toContain('Some text');
    });

    it('should handle images with various attributes', () => {
      const text =
        '<img_prompt="test">  <img src="test.jpg" class="foo" id="bar" data-test="value">';
      const result = removeExistingImages(text);
      expect(result).toBe('<img_prompt="test">');
    });

    it('should preserve standalone images (not after prompts)', () => {
      const text = `<img src="standalone.jpg">
<img_prompt="test">
<img src="after-prompt.jpg">`;

      const result = removeExistingImages(text);
      expect(result).toContain('<img src="standalone.jpg">');
      expect(result).not.toContain('<img src="after-prompt.jpg">');
    });

    it('should return unchanged text when no images to remove', () => {
      const text = '<img_prompt="test">';
      const result = removeExistingImages(text);
      expect(result).toBe(text);
    });

    it('should handle empty string', () => {
      const result = removeExistingImages('');
      expect(result).toBe('');
    });

    it('should preserve text between prompt and image', () => {
      const text =
        '<img_prompt="test"> \n\t <img src="test.jpg" title="Test" alt="Test">';
      const result = removeExistingImages(text);
      expect(result).toBe('<img_prompt="test">');
    });
  });
});
