/**
 * Tests for Streaming Image Queue Module
 */

import {describe, it, expect, beforeEach} from 'vitest';
import {ImageGenerationQueue} from './streaming_image_queue';

describe('StreamingImageQueue', () => {
  let queue: ImageGenerationQueue;

  beforeEach(() => {
    queue = new ImageGenerationQueue();
  });

  describe('addPrompt', () => {
    it('should add a new prompt to the queue', () => {
      const result = queue.addPrompt(
        'test prompt',
        '<!--img-prompt="test prompt"-->',
        0,
        10
      );

      expect(result).not.toBeNull();
      expect(result?.prompt).toBe('test prompt');
      expect(result?.startIndex).toBe(0);
      expect(result?.endIndex).toBe(10);
      expect(result?.state).toBe('QUEUED');
      expect(result?.attempts).toBe(0);
    });

    it('should not add duplicate prompts', () => {
      queue.addPrompt('test prompt', '<!--img-prompt="test prompt"-->', 0, 10);
      const duplicate = queue.addPrompt(
        'test prompt',
        '<!--img-prompt="test prompt"-->',
        0,
        10
      );

      expect(duplicate).toBeNull();
      expect(queue.size()).toBe(1);
    });

    it('should add same prompt at different position', () => {
      const first = queue.addPrompt(
        'test prompt',
        '<!--img-prompt="test prompt"-->',
        0,
        10
      );
      const second = queue.addPrompt(
        'test prompt',
        '<!--img-prompt="test prompt"-->',
        20,
        30
      );

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(queue.size()).toBe(2);
    });

    it('should generate unique IDs for prompts', () => {
      const first = queue.addPrompt(
        'prompt 1',
        '<!--img-prompt="prompt 1"-->',
        0,
        10
      );
      const second = queue.addPrompt(
        'prompt 2',
        '<!--img-prompt="prompt 2"-->',
        0,
        10
      );

      expect(first?.id).not.toBe(second?.id);
    });
  });

  describe('hasPrompt', () => {
    it('should return true if prompt exists', () => {
      queue.addPrompt('test prompt', '<!--img-prompt="test prompt"-->', 0, 10);

      expect(queue.hasPrompt('test prompt', 0)).toBe(true);
    });

    it('should return false if prompt does not exist', () => {
      expect(queue.hasPrompt('nonexistent', 0)).toBe(false);
    });

    it('should differentiate same prompt at different positions', () => {
      queue.addPrompt('test prompt', '<!--img-prompt="test prompt"-->', 0, 10);

      expect(queue.hasPrompt('test prompt', 0)).toBe(true);
      expect(queue.hasPrompt('test prompt', 20)).toBe(false);
    });
  });

  describe('getNextPending', () => {
    it('should return next QUEUED prompt', () => {
      queue.addPrompt('prompt 1', '<!--img-prompt="prompt 1"-->', 0, 10);
      queue.addPrompt('prompt 2', '<!--img-prompt="prompt 2"-->', 20, 30);

      const next = queue.getNextPending();

      expect(next).not.toBeNull();
      expect(next?.state).toBe('QUEUED');
    });

    it('should return null if no QUEUED prompts', () => {
      const prompt = queue.addPrompt('test', '<!--img-prompt="test"-->', 0, 10);
      queue.updateState(prompt!.id, 'GENERATING');

      const next = queue.getNextPending();

      expect(next).toBeNull();
    });

    it('should skip non-QUEUED prompts', () => {
      const first = queue.addPrompt(
        'prompt 1',
        '<!--img-prompt="prompt 1"-->',
        0,
        10
      );
      queue.updateState(first!.id, 'GENERATING');

      const second = queue.addPrompt(
        'prompt 2',
        '<!--img-prompt="prompt 2"-->',
        20,
        30
      );

      const next = queue.getNextPending();

      expect(next?.id).toBe(second?.id);
    });
  });

  describe('updateState', () => {
    it('should update prompt state', () => {
      const prompt = queue.addPrompt('test', '<!--img-prompt="test"-->', 0, 10);
      queue.updateState(prompt!.id, 'GENERATING');

      const updated = queue.getPrompt(prompt!.id);

      expect(updated?.state).toBe('GENERATING');
    });

    it('should increment attempts when state changes to GENERATING', () => {
      const prompt = queue.addPrompt('test', '<!--img-prompt="test"-->', 0, 10);

      expect(prompt?.attempts).toBe(0);

      queue.updateState(prompt!.id, 'GENERATING');
      const updated = queue.getPrompt(prompt!.id);

      expect(updated?.attempts).toBe(1);
      expect(updated?.generationStartedAt).toBeDefined();
    });

    it('should set completedAt for COMPLETED state', () => {
      const prompt = queue.addPrompt('test', '<!--img-prompt="test"-->', 0, 10);
      queue.updateState(prompt!.id, 'COMPLETED', {imageUrl: 'test.jpg'});

      const updated = queue.getPrompt(prompt!.id);

      expect(updated?.completedAt).toBeDefined();
      expect(updated?.imageUrl).toBe('test.jpg');
    });

    it('should set error for FAILED state', () => {
      const prompt = queue.addPrompt('test', '<!--img-prompt="test"-->', 0, 10);
      queue.updateState(prompt!.id, 'FAILED', {error: 'Test error'});

      const updated = queue.getPrompt(prompt!.id);

      expect(updated?.completedAt).toBeDefined();
      expect(updated?.error).toBe('Test error');
    });

    it('should warn on invalid prompt ID', () => {
      queue.updateState('invalid_id', 'COMPLETED');
      // Should not throw, just log warning
    });
  });

  describe('getPromptsByState', () => {
    it('should return prompts by state', () => {
      queue.addPrompt('prompt 1', '<!--img-prompt="prompt 1"-->', 0, 10);
      const second = queue.addPrompt(
        'prompt 2',
        '<!--img-prompt="prompt 2"-->',
        20,
        30
      );
      queue.updateState(second!.id, 'GENERATING');

      const queued = queue.getPromptsByState('QUEUED');
      const generating = queue.getPromptsByState('GENERATING');

      expect(queued).toHaveLength(1);
      expect(generating).toHaveLength(1);
    });

    it('should return empty array if no prompts in state', () => {
      const completed = queue.getPromptsByState('COMPLETED');

      expect(completed).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return counts for all states', () => {
      queue.addPrompt('prompt 1', '<!--img-prompt="prompt 1"-->', 0, 10);
      const second = queue.addPrompt(
        'prompt 2',
        '<!--img-prompt="prompt 2"-->',
        20,
        30
      );
      queue.updateState(second!.id, 'COMPLETED');

      const stats = queue.getStats();

      expect(stats.QUEUED).toBe(1);
      expect(stats.COMPLETED).toBe(1);
      expect(stats.GENERATING).toBe(0);
      expect(stats.FAILED).toBe(0);
      expect(stats.DETECTED).toBe(0);
    });

    it('should return zero counts for empty queue', () => {
      const stats = queue.getStats();

      expect(stats.QUEUED).toBe(0);
      expect(stats.COMPLETED).toBe(0);
      expect(stats.GENERATING).toBe(0);
      expect(stats.FAILED).toBe(0);
      expect(stats.DETECTED).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all prompts', () => {
      queue.addPrompt('prompt 1', '<!--img-prompt="prompt 1"-->', 0, 10);
      queue.addPrompt('prompt 2', '<!--img-prompt="prompt 2"-->', 20, 30);

      expect(queue.size()).toBe(2);

      queue.clear();

      expect(queue.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return correct queue size', () => {
      expect(queue.size()).toBe(0);

      queue.addPrompt('prompt 1', '<!--img-prompt="prompt 1"-->', 0, 10);
      expect(queue.size()).toBe(1);

      queue.addPrompt('prompt 2', '<!--img-prompt="prompt 2"-->', 20, 30);
      expect(queue.size()).toBe(2);
    });
  });

  describe('getAllPrompts', () => {
    it('should return all prompts', () => {
      queue.addPrompt('prompt 1', '<!--img-prompt="prompt 1"-->', 0, 10);
      queue.addPrompt('prompt 2', '<!--img-prompt="prompt 2"-->', 20, 30);

      const all = queue.getAllPrompts();

      expect(all).toHaveLength(2);
      expect(all.map(p => p.prompt)).toContain('prompt 1');
      expect(all.map(p => p.prompt)).toContain('prompt 2');
    });
  });
});
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

    it('should allow multiple regenerations of same prompt with different timestamps', () => {
      // Simulate multiple regeneration requests for the same prompt text
      // by using different timestamps as startIndex (as done in session_manager)
      const timestamp1 = Date.now();
      const timestamp2 = timestamp1 + 1;
      const timestamp3 = timestamp1 + 2;

      const regen1 = queue.addPrompt(
        'same prompt',
        '',
        timestamp1,
        timestamp1,
        {
          targetImageUrl: '/images/test1.png',
          targetPromptId: 'prompt-123',
          insertionMode: 'replace-image',
        }
      );

      const regen2 = queue.addPrompt(
        'same prompt',
        '',
        timestamp2,
        timestamp2,
        {
          targetImageUrl: '/images/test2.png',
          targetPromptId: 'prompt-123',
          insertionMode: 'replace-image',
        }
      );

      const regen3 = queue.addPrompt(
        'same prompt',
        '',
        timestamp3,
        timestamp3,
        {
          targetImageUrl: '/images/test1.png',
          targetPromptId: 'prompt-123',
          insertionMode: 'append-after-image',
        }
      );

      // All three should be queued (not deduplicated)
      expect(regen1).toBeDefined();
      expect(regen2).toBeDefined();
      expect(regen3).toBeDefined();
      expect(queue.size()).toBe(3);

      // Verify they have different IDs
      expect(regen1?.id).not.toBe(regen2?.id);
      expect(regen2?.id).not.toBe(regen3?.id);
      expect(regen1?.id).not.toBe(regen3?.id);
    });
  });
});
