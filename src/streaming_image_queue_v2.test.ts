/**
 * Tests for ImageGenerationQueue with regeneration metadata support
 */

import {describe, it, expect, beforeEach} from 'vitest';
import {ImageGenerationQueue} from './streaming_image_queue';

describe('ImageGenerationQueue with regeneration metadata', () => {
  let queue: ImageGenerationQueue;

  beforeEach(() => {
    queue = new ImageGenerationQueue();
  });

  describe('addPrompt with regeneration metadata', () => {
    it('should add prompt with regeneration metadata', () => {
      const prompt = queue.addPrompt(
        'test prompt',
        '<img-prompt="test prompt">',
        0,
        30,
        {
          targetImageUrl: 'http://example.com/old.jpg',
          targetPromptId: 'prompt-123',
          insertionMode: 'replace-image',
        }
      );

      expect(prompt).toBeDefined();
      expect(prompt?.targetImageUrl).toBe('http://example.com/old.jpg');
      expect(prompt?.targetPromptId).toBe('prompt-123');
      expect(prompt?.insertionMode).toBe('replace-image');
    });

    it('should add streaming prompt without regeneration metadata', () => {
      const prompt = queue.addPrompt(
        'test prompt',
        '<img-prompt="test prompt">',
        0,
        30
      );

      expect(prompt).toBeDefined();
      expect(prompt?.targetImageUrl).toBeUndefined();
      expect(prompt?.targetPromptId).toBeUndefined();
      expect(prompt?.insertionMode).toBeUndefined();
    });

    it('should support append-after-image mode', () => {
      const prompt = queue.addPrompt(
        'test prompt',
        '<img-prompt="test prompt">',
        0,
        30,
        {
          targetImageUrl: 'http://example.com/old.jpg',
          targetPromptId: 'prompt-123',
          insertionMode: 'append-after-image',
        }
      );

      expect(prompt?.insertionMode).toBe('append-after-image');
    });

    it('should support append-after-prompt mode', () => {
      const prompt = queue.addPrompt(
        'test prompt',
        '<img-prompt="test prompt">',
        0,
        30,
        {
          insertionMode: 'append-after-prompt',
        }
      );

      expect(prompt?.insertionMode).toBe('append-after-prompt');
    });
  });

  describe('Queue operations with regeneration prompts', () => {
    it('should mix streaming and regeneration prompts', () => {
      const streaming = queue.addPrompt('streaming', 'tag1', 0, 10);
      const regen = queue.addPrompt('regenerate', 'tag2', 20, 30, {
        targetImageUrl: 'http://example.com/old.jpg',
        targetPromptId: 'prompt-123',
      });

      expect(queue.size()).toBe(2);
      expect(streaming?.targetImageUrl).toBeUndefined();
      expect(regen?.targetImageUrl).toBe('http://example.com/old.jpg');
    });

    it('should retrieve regeneration prompts correctly', () => {
      queue.addPrompt('test', 'tag', 0, 10, {
        targetImageUrl: 'http://example.com/old.jpg',
        targetPromptId: 'prompt-123',
      });

      const next = queue.getNextPending();
      expect(next).toBeDefined();
      expect(next?.targetImageUrl).toBe('http://example.com/old.jpg');
    });
  });
});
