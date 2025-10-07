/**
 * Unit tests for Manual Generation Module
 */

import {describe, it, expect} from 'vitest';
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

  describe('findImageIndexInPrompt', () => {
    // Test helper to simulate the internal function
    function findImageIndexInPrompt(
      text: string,
      promptText: string,
      imageSrc: string
    ): number | null {
      const promptTag = `<img_prompt="${promptText}">`;
      const promptIndex = text.indexOf(promptTag);

      if (promptIndex === -1) {
        return null;
      }

      const afterPrompt = text.substring(promptIndex + promptTag.length);
      const imgTagRegex = /\s*<img\s+[^>]*>/g;
      let index = 0;
      let lastMatchEnd = 0;
      let match;

      while ((match = imgTagRegex.exec(afterPrompt)) !== null) {
        if (
          match.index === lastMatchEnd ||
          afterPrompt.substring(lastMatchEnd, match.index).trim() === ''
        ) {
          index++;
          lastMatchEnd = imgTagRegex.lastIndex;

          if (match[0].includes(`src="${imageSrc}"`)) {
            return index;
          }
        } else {
          break;
        }
      }

      return null;
    }

    it('should find first image index', () => {
      const text = '<img_prompt="test">\n<img src="1.jpg">\n<img src="2.jpg">';
      const result = findImageIndexInPrompt(text, 'test', '1.jpg');
      expect(result).toBe(1);
    });

    it('should find second image index', () => {
      const text = '<img_prompt="test">\n<img src="1.jpg">\n<img src="2.jpg">';
      const result = findImageIndexInPrompt(text, 'test', '2.jpg');
      expect(result).toBe(2);
    });

    it('should find third image index', () => {
      const text =
        '<img_prompt="test">\n<img src="1.jpg">\n<img src="2.jpg">\n<img src="3.jpg">';
      const result = findImageIndexInPrompt(text, 'test', '3.jpg');
      expect(result).toBe(3);
    });

    it('should return null when image not found', () => {
      const text = '<img_prompt="test">\n<img src="1.jpg">';
      const result = findImageIndexInPrompt(text, 'test', '999.jpg');
      expect(result).toBeNull();
    });

    it('should return null when prompt not found', () => {
      const text = '<img_prompt="test">\n<img src="1.jpg">';
      const result = findImageIndexInPrompt(text, 'nonexistent', '1.jpg');
      expect(result).toBeNull();
    });

    it('should handle images with complex attributes', () => {
      const text =
        '<img_prompt="test">\n<img src="1.jpg" title="AI generated image #1">\n<img src="2.jpg" title="AI generated image #2">';
      const result = findImageIndexInPrompt(text, 'test', '2.jpg');
      expect(result).toBe(2);
    });

    it('should stop at non-contiguous images', () => {
      const text =
        '<img_prompt="test">\n<img src="1.jpg">\nSome text\n<img src="2.jpg">';
      const result = findImageIndexInPrompt(text, 'test', '2.jpg');
      expect(result).toBeNull();
    });

    it('should handle multiple prompts correctly', () => {
      const text = `<img_prompt="first">
<img src="a.jpg">
<img src="b.jpg">
<img_prompt="second">
<img src="c.jpg">
<img src="d.jpg">`;

      expect(findImageIndexInPrompt(text, 'first', 'a.jpg')).toBe(1);
      expect(findImageIndexInPrompt(text, 'first', 'b.jpg')).toBe(2);
      expect(findImageIndexInPrompt(text, 'second', 'c.jpg')).toBe(1);
      expect(findImageIndexInPrompt(text, 'second', 'd.jpg')).toBe(2);
    });
  });

  describe('countRegeneratedImages', () => {
    // Test helper to simulate the internal function
    function countRegeneratedImages(
      text: string,
      promptText: string,
      imageIndex: number
    ): number {
      const promptTag = `<img_prompt="${promptText}">`;
      const promptIndex = text.indexOf(promptTag);

      if (promptIndex === -1) {
        return 0;
      }

      const afterPrompt = text.substring(promptIndex + promptTag.length);
      const imgTagRegex = /\s*<img\s+[^>]*>/g;
      let maxRegenNumber = 0;
      let lastMatchEnd = 0;
      let match;

      const regenPattern = new RegExp(
        `AI generated image #${imageIndex} \\(Regenerated (\\d+)\\)`
      );

      while ((match = imgTagRegex.exec(afterPrompt)) !== null) {
        if (
          match.index === lastMatchEnd ||
          afterPrompt.substring(lastMatchEnd, match.index).trim() === ''
        ) {
          lastMatchEnd = imgTagRegex.lastIndex;

          const regenMatch = match[0].match(regenPattern);
          if (regenMatch) {
            const regenNumber = parseInt(regenMatch[1], 10);
            if (regenNumber > maxRegenNumber) {
              maxRegenNumber = regenNumber;
            }
          }
        } else {
          break;
        }
      }

      return maxRegenNumber;
    }

    it('should return 0 when no regenerated images exist', () => {
      const text =
        '<img_prompt="test">\n<img src="1.jpg" title="AI generated image #1">';
      const result = countRegeneratedImages(text, 'test', 1);
      expect(result).toBe(0);
    });

    it('should count single regenerated image', () => {
      const text =
        '<img_prompt="test">\n<img src="1.jpg" title="AI generated image #1">\n<img src="2.jpg" title="AI generated image #1 (Regenerated 1)">';
      const result = countRegeneratedImages(text, 'test', 1);
      expect(result).toBe(1);
    });

    it('should count multiple regenerated images', () => {
      const text = `<img_prompt="test">
<img src="1.jpg" title="AI generated image #1">
<img src="2.jpg" title="AI generated image #1 (Regenerated 1)">
<img src="3.jpg" title="AI generated image #1 (Regenerated 2)">
<img src="4.jpg" title="AI generated image #1 (Regenerated 3)">`;
      const result = countRegeneratedImages(text, 'test', 1);
      expect(result).toBe(3);
    });

    it('should return highest regeneration number', () => {
      const text = `<img_prompt="test">
<img src="1.jpg" title="AI generated image #1">
<img src="2.jpg" title="AI generated image #1 (Regenerated 1)">
<img src="3.jpg" title="AI generated image #1 (Regenerated 5)">
<img src="4.jpg" title="AI generated image #1 (Regenerated 2)">`;
      const result = countRegeneratedImages(text, 'test', 1);
      expect(result).toBe(5);
    });

    it('should only count regenerations for specific image index', () => {
      const text = `<img_prompt="test">
<img src="1.jpg" title="AI generated image #1">
<img src="2.jpg" title="AI generated image #2">
<img src="3.jpg" title="AI generated image #1 (Regenerated 1)">
<img src="4.jpg" title="AI generated image #2 (Regenerated 1)">`;
      expect(countRegeneratedImages(text, 'test', 1)).toBe(1);
      expect(countRegeneratedImages(text, 'test', 2)).toBe(1);
    });

    it('should return 0 when prompt not found', () => {
      const text =
        '<img_prompt="test">\n<img src="1.jpg" title="AI generated image #1 (Regenerated 1)">';
      const result = countRegeneratedImages(text, 'nonexistent', 1);
      expect(result).toBe(0);
    });

    it('should handle multiple prompts correctly', () => {
      const text = `<img_prompt="first">
<img src="a.jpg" title="AI generated image #1">
<img src="b.jpg" title="AI generated image #1 (Regenerated 1)">
<img_prompt="second">
<img src="c.jpg" title="AI generated image #1">
<img src="d.jpg" title="AI generated image #1 (Regenerated 1)">
<img src="e.jpg" title="AI generated image #1 (Regenerated 2)">`;

      expect(countRegeneratedImages(text, 'first', 1)).toBe(1);
      expect(countRegeneratedImages(text, 'second', 1)).toBe(2);
    });

    it('should stop counting at non-contiguous images', () => {
      const text = `<img_prompt="test">
<img src="1.jpg" title="AI generated image #1">
<img src="2.jpg" title="AI generated image #1 (Regenerated 1)">
Some text here
<img src="3.jpg" title="AI generated image #1 (Regenerated 2)">`;
      const result = countRegeneratedImages(text, 'test', 1);
      expect(result).toBe(1);
    });
  });
});
