/**
 * Tests for the reconciliation module
 */

import {describe, it, expect} from 'vitest';
import {
  createMarker,
  parseMarker,
  checkIdempotency,
  hashString,
  validateMessageState,
  findAllMarkers,
  reconcileMessage,
  microDelay,
  removeAllMarkers,
} from './reconciliation';
import type {AutoIllustratorChatMetadata} from './types';
import type {PromptRegistry} from './prompt_manager';

describe('Reconciliation Module', () => {
  describe('createMarker', () => {
    it('should create a valid marker with promptId and imageUrl', () => {
      const promptId = 'test-prompt-123';
      const imageUrl = 'https://example.com/image.png';

      const marker = createMarker(promptId, imageUrl);

      expect(marker).toContain('<!-- auto-illustrator:');
      expect(marker).toContain(`promptId=${promptId}`);
      expect(marker).toContain('imageUrl=');
      expect(marker).toContain('-->');
    });

    it('should escape special characters in imageUrl', () => {
      const promptId = 'test-prompt';
      const imageUrl = 'https://example.com/image?param=<value>&other="test"';

      const marker = createMarker(promptId, imageUrl);

      // URL gets normalized to /image (query params stripped by URL parsing)
      // So we just verify the marker is created and doesn't contain raw HTML
      expect(marker).toContain('<!-- auto-illustrator:');
      expect(marker).not.toContain('<value>');
      expect(marker).not.toContain('"test"');
    });
  });

  describe('parseMarker', () => {
    it('should parse a valid marker', () => {
      const promptId = 'test-prompt-123';
      const imageUrl = 'https://example.com/image.png';
      const marker = createMarker(promptId, imageUrl);

      const parsed = parseMarker(marker);

      expect(parsed).not.toBeNull();
      expect(parsed?.promptId).toBe(promptId);
      // URL gets normalized to /image.png
      expect(parsed?.imageUrl).toBe('/image.png');
    });

    it('should return null for invalid marker', () => {
      const invalid = '<!-- some other comment -->';

      const parsed = parseMarker(invalid);

      expect(parsed).toBeNull();
    });

    it('should preserve data URIs', () => {
      const promptId = 'test-prompt';
      const dataUri =
        'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4Ij48L3N2Zz4=';
      const marker = createMarker(promptId, dataUri);

      const parsed = parseMarker(marker);

      expect(parsed).not.toBeNull();
      // Data URIs should be preserved as-is
      expect(parsed?.imageUrl).toBe(dataUri);
    });
  });

  describe('checkIdempotency', () => {
    it('should detect already inserted image with marker', () => {
      const promptId = 'test-prompt-123';
      const imageUrl = 'https://example.com/image.png';
      const marker = createMarker(promptId, imageUrl);

      const messageText = `Some text\n${marker}\n<img src="${imageUrl}" />\nMore text`;

      const result = checkIdempotency(messageText, promptId, imageUrl);

      expect(result.alreadyInserted).toBe(true);
      expect(result.markerPosition).toBeGreaterThan(-1);
    });

    it('should detect already inserted image without marker (legacy)', () => {
      const promptId = 'test-prompt-123';
      const imageUrl = 'https://example.com/image.png';
      // Use normalized URL in the message text since that's what would be in real messages
      const normalizedUrl = '/image.png';

      const messageText = `Some text\n<img src="${normalizedUrl}" alt="test" />\nMore text`;

      const result = checkIdempotency(messageText, promptId, imageUrl);

      expect(result.alreadyInserted).toBe(true);
      expect(result.markerPosition).toBe(-1);
    });

    it('should return false if image not found', () => {
      const promptId = 'test-prompt-123';
      const imageUrl = 'https://example.com/image.png';

      const messageText = 'Some text without the image';

      const result = checkIdempotency(messageText, promptId, imageUrl);

      expect(result.alreadyInserted).toBe(false);
      expect(result.markerPosition).toBe(-1);
    });

    it('should normalize data URIs consistently', () => {
      const promptId = 'test-prompt-123';
      const dataUri =
        'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4Ij48L3N2Zz4=';

      // Create marker with normalized data URI
      const marker = createMarker(promptId, dataUri);
      const messageText = `<!--img-prompt="test"-->\n${marker}\n<img src="${dataUri}" />`;

      // Check with same data URI - should find it
      const result = checkIdempotency(messageText, promptId, dataUri);

      expect(result.alreadyInserted).toBe(true);
      expect(result.markerPosition).toBeGreaterThan(-1);
    });
  });

  describe('hashString', () => {
    it('should produce consistent hash for same string', () => {
      const text = 'Hello, world!';

      const hash1 = hashString(text);
      const hash2 = hashString(text);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different strings', () => {
      const text1 = 'Hello, world!';
      const text2 = 'Hello, world';

      const hash1 = hashString(text1);
      const hash2 = hashString(text2);

      expect(hash1).not.toBe(hash2);
    });

    it('should produce 8-character hex string', () => {
      const text = 'Test string';

      const hash = hashString(text);

      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe('validateMessageState', () => {
    it('should return not modified for identical text', () => {
      const text = 'Hello, world!';

      const result = validateMessageState(text, text);

      expect(result.modified).toBe(false);
      expect(result.changePercent).toBe(0);
      expect(result.originalHash).toBe(result.currentHash);
    });

    it('should detect small modifications within threshold', () => {
      const original = 'Hello, world!';
      const current = 'Hello, world! '; // Added space

      const result = validateMessageState(original, current, 10);

      expect(result.modified).toBe(false);
      expect(result.changePercent).toBeLessThan(10);
    });

    it('should detect large modifications exceeding threshold', () => {
      const original = 'Hello, world!';
      const current =
        'Hello, world! This is a much longer text with many more words.';

      const result = validateMessageState(original, current, 10);

      expect(result.modified).toBe(true);
      expect(result.changePercent).toBeGreaterThan(10);
    });
  });

  describe('findAllMarkers', () => {
    it('should find all markers in text', () => {
      const marker1 = createMarker('prompt1', 'https://example.com/img1.png');
      const marker2 = createMarker('prompt2', 'https://example.com/img2.png');

      const messageText = `Some text\n${marker1}\n<img />\nMore text\n${marker2}\n<img />`;

      const markers = findAllMarkers(messageText);

      expect(markers).toHaveLength(2);
      expect(markers[0]).toBe(marker1);
      expect(markers[1]).toBe(marker2);
    });

    it('should return empty array if no markers found', () => {
      const messageText = 'Some text without markers';

      const markers = findAllMarkers(messageText);

      expect(markers).toHaveLength(0);
    });
  });

  describe('reconcileMessage', () => {
    it('should not modify message if all images present', () => {
      const promptId = 'test-prompt-123';
      const imageUrl = 'https://example.com/image.png';
      const marker = createMarker(promptId, imageUrl);

      const messageText = `<!--img-prompt="cat"-->\n${marker}\n<img src="${imageUrl}" />`;

      const metadata: AutoIllustratorChatMetadata = {
        promptRegistry: {
          nodes: {
            [promptId]: {
              id: promptId,
              messageId: 1,
              promptIndex: 0,
              text: 'cat',
              parentId: null,
              childIds: [],
              generatedImages: [imageUrl],
              source: 'ai-message',
              createdAt: Date.now(),
            },
          },
          imageToPromptId: {
            [imageUrl]: promptId,
          },
          rootPromptIds: [promptId],
        },
      };

      const {updatedText, result} = reconcileMessage(1, messageText, metadata);

      expect(updatedText).toBe(messageText);
      expect(result.missingCount).toBe(0);
      expect(result.restoredCount).toBe(0);
    });

    it('should restore missing image from metadata', () => {
      const promptId = 'test-prompt-123';
      const imageUrl = 'https://example.com/image.png';

      const messageText = '<!--img-prompt="cat"-->';

      const metadata: AutoIllustratorChatMetadata = {
        promptRegistry: {
          nodes: {
            [promptId]: {
              id: promptId,
              messageId: 1,
              promptIndex: 0,
              text: 'cat',
              parentId: null,
              childIds: [],
              generatedImages: [imageUrl],
              source: 'ai-message',
              createdAt: Date.now(),
            },
          },
          imageToPromptId: {
            [imageUrl]: promptId,
          },
          rootPromptIds: [promptId],
        },
      };

      const {updatedText, result} = reconcileMessage(1, messageText, metadata);

      expect(updatedText).not.toBe(messageText);
      expect(updatedText).toContain(imageUrl);
      expect(updatedText).toContain('auto-illustrator:');
      expect(result.missingCount).toBe(1);
      expect(result.restoredCount).toBe(1);
    });

    it('should not restore if prompt tag not found', () => {
      const promptId = 'test-prompt-123';
      const imageUrl = 'https://example.com/image.png';

      const messageText = 'Some text without the prompt tag';

      const metadata: AutoIllustratorChatMetadata = {
        promptRegistry: {
          nodes: {
            [promptId]: {
              id: promptId,
              messageId: 1,
              promptIndex: 0,
              text: 'cat',
              parentId: null,
              childIds: [],
              generatedImages: [imageUrl],
              source: 'ai-message',
              createdAt: Date.now(),
            },
          },
          imageToPromptId: {
            [imageUrl]: promptId,
          },
          rootPromptIds: [promptId],
        },
      };

      const {updatedText, result} = reconcileMessage(1, messageText, metadata);

      expect(updatedText).toBe(messageText);
      expect(result.missingCount).toBe(1);
      expect(result.restoredCount).toBe(0);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle multiple missing images', () => {
      const promptId1 = 'test-prompt-1';
      const promptId2 = 'test-prompt-2';
      const imageUrl1 = 'https://example.com/img1.png';
      const imageUrl2 = 'https://example.com/img2.png';

      const messageText = '<!--img-prompt="cat"-->\n<!--img-prompt="dog"-->';

      const metadata: AutoIllustratorChatMetadata = {
        promptRegistry: {
          nodes: {
            [promptId1]: {
              id: promptId1,
              messageId: 1,
              promptIndex: 0,
              text: 'cat',
              parentId: null,
              childIds: [],
              generatedImages: [imageUrl1],
              source: 'ai-message',
              createdAt: Date.now(),
            },
            [promptId2]: {
              id: promptId2,
              messageId: 1,
              promptIndex: 1,
              text: 'dog',
              parentId: null,
              childIds: [],
              generatedImages: [imageUrl2],
              source: 'ai-message',
              createdAt: Date.now(),
            },
          },
          imageToPromptId: {
            [imageUrl1]: promptId1,
            [imageUrl2]: promptId2,
          },
          rootPromptIds: [promptId1, promptId2],
        },
      };

      const {updatedText, result} = reconcileMessage(1, messageText, metadata);

      expect(updatedText).toContain(imageUrl1);
      expect(updatedText).toContain(imageUrl2);
      expect(result.missingCount).toBe(2);
      expect(result.restoredCount).toBe(2);
    });

    it('should skip messages with no registered prompts', () => {
      const messageText = 'Some text';

      const metadata: AutoIllustratorChatMetadata = {
        promptRegistry: {
          nodes: {},
          imageToPromptId: {},
          rootPromptIds: [],
        },
      };

      const {updatedText, result} = reconcileMessage(1, messageText, metadata);

      expect(updatedText).toBe(messageText);
      expect(result.missingCount).toBe(0);
      expect(result.restoredCount).toBe(0);
    });

    it('should skip prompts with no generated images', () => {
      const promptId = 'test-prompt-123';

      const messageText = '<!--img-prompt="cat"-->';

      const metadata: AutoIllustratorChatMetadata = {
        promptRegistry: {
          nodes: {
            [promptId]: {
              id: promptId,
              messageId: 1,
              promptIndex: 0,
              text: 'cat',
              parentId: null,
              childIds: [],
              generatedImages: [], // No images
              source: 'ai-message',
              createdAt: Date.now(),
            },
          },
          imageToPromptId: {},
          rootPromptIds: [promptId],
        },
      };

      const {updatedText, result} = reconcileMessage(1, messageText, metadata);

      expect(updatedText).toBe(messageText);
      expect(result.missingCount).toBe(0);
      expect(result.restoredCount).toBe(0);
    });
  });

  describe('microDelay', () => {
    it('should delay for specified milliseconds', async () => {
      const start = Date.now();

      await microDelay(50);

      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow 5ms margin
      expect(elapsed).toBeLessThan(100);
    });

    it('should work with 0ms delay', async () => {
      const start = Date.now();

      await microDelay(0);

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(20);
    });
  });

  describe('removeAllMarkers', () => {
    it('should remove all markers from text', () => {
      const marker1 = createMarker('prompt1', 'https://example.com/img1.png');
      const marker2 = createMarker('prompt2', 'https://example.com/img2.png');

      const text = `Some text\n${marker1}\n<img src="url1" />\nMore text\n${marker2}\n<img src="url2" />`;

      const cleaned = removeAllMarkers(text);

      expect(cleaned).not.toContain('auto-illustrator');
      expect(cleaned).toContain('<img src="url1" />');
      expect(cleaned).toContain('<img src="url2" />');
      expect(cleaned).toContain('Some text');
      expect(cleaned).toContain('More text');
    });

    it('should return unchanged text if no markers present', () => {
      const text = 'Some text without any markers';

      const cleaned = removeAllMarkers(text);

      expect(cleaned).toBe(text);
    });

    it('should handle text with only markers', () => {
      const marker1 = createMarker('prompt1', 'https://example.com/img1.png');
      const marker2 = createMarker('prompt2', 'https://example.com/img2.png');

      const text = `${marker1}\n${marker2}`;

      const cleaned = removeAllMarkers(text);

      expect(cleaned.trim()).toBe('');
    });

    it('should handle markers with special characters in URLs', () => {
      const marker = createMarker(
        'prompt1',
        'https://example.com/image?param=<value>&other="test"'
      );

      const text = `Text ${marker} More text`;

      const cleaned = removeAllMarkers(text);

      expect(cleaned).not.toContain('auto-illustrator');
      expect(cleaned.trim()).toBe('Text More text');
    });
  });
});
