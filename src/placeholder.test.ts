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

    it('should generate different URLs for same promptId due to timestamp', async () => {
      const promptId = 'prompt_consistent';
      const url1 = createPlaceholderUrl(promptId);
      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 2));
      const url2 = createPlaceholderUrl(promptId);

      // Should be different due to timestamp
      expect(url1).not.toBe(url2);
      // Both should contain the same promptId
      expect(url1).toContain(promptId);
      expect(url2).toContain(promptId);
      // Both should be recognized as placeholders
      expect(isPlaceholderUrl(url1)).toBe(true);
      expect(isPlaceholderUrl(url2)).toBe(true);
    });

    it('should include timestamp in URL fragment', () => {
      const promptId = 'prompt_123';
      const beforeTime = Date.now();
      const url = createPlaceholderUrl(promptId);
      const afterTime = Date.now();

      expect(url).toContain('ts=');

      // Extract timestamp from URL
      const match = url.match(/ts=(\d+)/);
      expect(match).not.toBeNull();
      if (match) {
        const timestamp = parseInt(match[1], 10);
        expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(timestamp).toBeLessThanOrEqual(afterTime);
      }
    });

    it('should generate unique URLs for multiple regenerations of same prompt', async () => {
      const promptId = 'prompt_regenerate_test';
      const urls = new Set<string>();

      // Simulate multiple regeneration attempts
      for (let i = 0; i < 5; i++) {
        urls.add(createPlaceholderUrl(promptId));
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 2));
      }

      // All 5 attempts should have unique URLs
      expect(urls.size).toBe(5);

      // All should be recognized as placeholders
      for (const url of urls) {
        expect(isPlaceholderUrl(url)).toBe(true);
        expect(url).toContain(promptId);
      }
    });
  });
});
