/**
 * Unit tests for placeholder module
 */

import {
  PLACEHOLDER_IMAGE_URL,
  createPlaceholderUrl,
  isPlaceholderUrl,
} from './placeholder';

describe('Placeholder URL helpers', () => {
  describe('createPlaceholderUrl', () => {
    it('should create unique URLs with fragment identifier', () => {
      const promptId1 = 'prompt_abc123';
      const promptId2 = 'prompt_xyz789';

      const url1 = createPlaceholderUrl(promptId1);
      const url2 = createPlaceholderUrl(promptId2);

      expect(url1).not.toBe(url2);
      expect(url1).toContain(PLACEHOLDER_IMAGE_URL);
      expect(url1).toContain('promptId=');
      expect(url1).toContain(promptId1);
    });

    it('should encode special characters in promptId', () => {
      const promptId = 'prompt#with&special=chars';
      const url = createPlaceholderUrl(promptId);

      expect(url).toContain(PLACEHOLDER_IMAGE_URL);
      // Should not contain unencoded special characters
      expect(url.indexOf('#promptId=')).toBeGreaterThan(
        url.indexOf(PLACEHOLDER_IMAGE_URL)
      );
    });

    it('should handle empty promptId', () => {
      const url = createPlaceholderUrl('');
      expect(url).toContain(PLACEHOLDER_IMAGE_URL);
      expect(url).toContain('#promptId=');
    });
  });

  describe('isPlaceholderUrl', () => {
    it('should recognize base placeholder URL without fragment', () => {
      expect(isPlaceholderUrl(PLACEHOLDER_IMAGE_URL)).toBe(true);
    });

    it('should recognize placeholder URLs with fragment', () => {
      const url1 = createPlaceholderUrl('prompt_123');
      const url2 = createPlaceholderUrl('prompt_456');

      expect(isPlaceholderUrl(url1)).toBe(true);
      expect(isPlaceholderUrl(url2)).toBe(true);
    });

    it('should reject non-placeholder URLs', () => {
      expect(isPlaceholderUrl('https://example.com/image.png')).toBe(false);
      expect(isPlaceholderUrl('data:image/png;base64,abc123')).toBe(false);
      expect(isPlaceholderUrl('')).toBe(false);
    });

    it('should handle malformed URLs gracefully', () => {
      expect(isPlaceholderUrl('not-a-url')).toBe(false);
      expect(isPlaceholderUrl('data:image/svg')).toBe(false);
    });
  });

  describe('Placeholder URL uniqueness', () => {
    it('should generate unique URLs for different promptIds', () => {
      const urls = new Set<string>();
      const promptIds = ['prompt_1', 'prompt_2', 'prompt_3', 'prompt_4'];

      for (const promptId of promptIds) {
        urls.add(createPlaceholderUrl(promptId));
      }

      // All URLs should be unique
      expect(urls.size).toBe(promptIds.length);

      // All should be recognized as placeholders
      for (const url of urls) {
        expect(isPlaceholderUrl(url)).toBe(true);
      }
    });

    it('should generate same URL for same promptId', () => {
      const promptId = 'prompt_consistent';
      const url1 = createPlaceholderUrl(promptId);
      const url2 = createPlaceholderUrl(promptId);

      expect(url1).toBe(url2);
    });
  });
});
