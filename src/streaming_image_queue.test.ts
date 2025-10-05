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
      const result = queue.addPrompt('test prompt', 0, 10);

      expect(result).not.toBeNull();
      expect(result?.prompt).toBe('test prompt');
      expect(result?.startIndex).toBe(0);
      expect(result?.endIndex).toBe(10);
      expect(result?.state).toBe('QUEUED');
      expect(result?.attempts).toBe(0);
    });

    it('should not add duplicate prompts', () => {
      queue.addPrompt('test prompt', 0, 10);
      const duplicate = queue.addPrompt('test prompt', 0, 10);

      expect(duplicate).toBeNull();
      expect(queue.size()).toBe(1);
    });

    it('should add same prompt at different position', () => {
      const first = queue.addPrompt('test prompt', 0, 10);
      const second = queue.addPrompt('test prompt', 20, 30);

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(queue.size()).toBe(2);
    });

    it('should generate unique IDs for prompts', () => {
      const first = queue.addPrompt('prompt 1', 0, 10);
      const second = queue.addPrompt('prompt 2', 0, 10);

      expect(first?.id).not.toBe(second?.id);
    });
  });

  describe('hasPrompt', () => {
    it('should return true if prompt exists', () => {
      queue.addPrompt('test prompt', 0, 10);

      expect(queue.hasPrompt('test prompt', 0)).toBe(true);
    });

    it('should return false if prompt does not exist', () => {
      expect(queue.hasPrompt('nonexistent', 0)).toBe(false);
    });

    it('should differentiate same prompt at different positions', () => {
      queue.addPrompt('test prompt', 0, 10);

      expect(queue.hasPrompt('test prompt', 0)).toBe(true);
      expect(queue.hasPrompt('test prompt', 20)).toBe(false);
    });
  });

  describe('getNextPending', () => {
    it('should return next QUEUED prompt', () => {
      queue.addPrompt('prompt 1', 0, 10);
      queue.addPrompt('prompt 2', 20, 30);

      const next = queue.getNextPending();

      expect(next).not.toBeNull();
      expect(next?.state).toBe('QUEUED');
    });

    it('should return null if no QUEUED prompts', () => {
      const prompt = queue.addPrompt('test', 0, 10);
      queue.updateState(prompt!.id, 'GENERATING');

      const next = queue.getNextPending();

      expect(next).toBeNull();
    });

    it('should skip non-QUEUED prompts', () => {
      const first = queue.addPrompt('prompt 1', 0, 10);
      queue.updateState(first!.id, 'GENERATING');

      const second = queue.addPrompt('prompt 2', 20, 30);

      const next = queue.getNextPending();

      expect(next?.id).toBe(second?.id);
    });
  });

  describe('updateState', () => {
    it('should update prompt state', () => {
      const prompt = queue.addPrompt('test', 0, 10);
      queue.updateState(prompt!.id, 'GENERATING');

      const updated = queue.getPrompt(prompt!.id);

      expect(updated?.state).toBe('GENERATING');
    });

    it('should increment attempts when state changes to GENERATING', () => {
      const prompt = queue.addPrompt('test', 0, 10);

      expect(prompt?.attempts).toBe(0);

      queue.updateState(prompt!.id, 'GENERATING');
      const updated = queue.getPrompt(prompt!.id);

      expect(updated?.attempts).toBe(1);
      expect(updated?.generationStartedAt).toBeDefined();
    });

    it('should set completedAt for COMPLETED state', () => {
      const prompt = queue.addPrompt('test', 0, 10);
      queue.updateState(prompt!.id, 'COMPLETED', {imageUrl: 'test.jpg'});

      const updated = queue.getPrompt(prompt!.id);

      expect(updated?.completedAt).toBeDefined();
      expect(updated?.imageUrl).toBe('test.jpg');
    });

    it('should set error for FAILED state', () => {
      const prompt = queue.addPrompt('test', 0, 10);
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
      queue.addPrompt('prompt 1', 0, 10);
      const second = queue.addPrompt('prompt 2', 20, 30);
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
      queue.addPrompt('prompt 1', 0, 10);
      const second = queue.addPrompt('prompt 2', 20, 30);
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
      queue.addPrompt('prompt 1', 0, 10);
      queue.addPrompt('prompt 2', 20, 30);

      expect(queue.size()).toBe(2);

      queue.clear();

      expect(queue.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return correct queue size', () => {
      expect(queue.size()).toBe(0);

      queue.addPrompt('prompt 1', 0, 10);
      expect(queue.size()).toBe(1);

      queue.addPrompt('prompt 2', 20, 30);
      expect(queue.size()).toBe(2);
    });
  });

  describe('getAllPrompts', () => {
    it('should return all prompts', () => {
      queue.addPrompt('prompt 1', 0, 10);
      queue.addPrompt('prompt 2', 20, 30);

      const all = queue.getAllPrompts();

      expect(all).toHaveLength(2);
      expect(all.map(p => p.prompt)).toContain('prompt 1');
      expect(all.map(p => p.prompt)).toContain('prompt 2');
    });
  });

  describe('adjustPositionsAfterInsertion', () => {
    it('should adjust positions of prompts after insertion point', () => {
      queue.addPrompt('early', 0, 10);
      queue.addPrompt('middle', 50, 60);
      queue.addPrompt('late', 100, 110);

      // Insert 20 chars at position 40 (before middle and late)
      queue.adjustPositionsAfterInsertion(40, 20);

      const prompts = queue.getAllPrompts();
      const early = prompts.find(p => p.prompt === 'early')!;
      const middle = prompts.find(p => p.prompt === 'middle')!;
      const late = prompts.find(p => p.prompt === 'late')!;

      // Early should be unchanged (before insertion point)
      expect(early.startIndex).toBe(0);
      expect(early.endIndex).toBe(10);

      // Middle should be adjusted (+20)
      expect(middle.startIndex).toBe(70);
      expect(middle.endIndex).toBe(80);

      // Late should be adjusted (+20)
      expect(late.startIndex).toBe(120);
      expect(late.endIndex).toBe(130);
    });

    it('should only adjust QUEUED and GENERATING prompts', () => {
      const p1 = queue.addPrompt('queued', 50, 60)!;
      const p2 = queue.addPrompt('generating', 100, 110)!;
      const p3 = queue.addPrompt('completed', 150, 160)!;
      const p4 = queue.addPrompt('failed', 200, 210)!;

      queue.updateState(p2.id, 'GENERATING');
      queue.updateState(p3.id, 'COMPLETED');
      queue.updateState(p4.id, 'FAILED');

      // Insert at position 0 (before all)
      queue.adjustPositionsAfterInsertion(0, 30);

      const prompts = queue.getAllPrompts();
      const queued = prompts.find(p => p.prompt === 'queued')!;
      const generating = prompts.find(p => p.prompt === 'generating')!;
      const completed = prompts.find(p => p.prompt === 'completed')!;
      const failed = prompts.find(p => p.prompt === 'failed')!;

      // QUEUED and GENERATING should be adjusted
      expect(queued.startIndex).toBe(80);
      expect(generating.startIndex).toBe(130);

      // COMPLETED and FAILED should NOT be adjusted
      expect(completed.startIndex).toBe(150);
      expect(failed.startIndex).toBe(200);
    });

    it('should not adjust prompts at or before insertion point', () => {
      queue.addPrompt('at_point', 50, 60);
      queue.addPrompt('before_point', 30, 40);

      queue.adjustPositionsAfterInsertion(50, 20);

      const prompts = queue.getAllPrompts();
      const atPoint = prompts.find(p => p.prompt === 'at_point')!;
      const beforePoint = prompts.find(p => p.prompt === 'before_point')!;

      // Neither should be adjusted (not > insertionPoint)
      expect(atPoint.startIndex).toBe(50);
      expect(beforePoint.startIndex).toBe(30);
    });

    it('should handle empty queue', () => {
      // Should not throw
      queue.adjustPositionsAfterInsertion(100, 50);
      expect(queue.size()).toBe(0);
    });

    it('should handle realistic streaming scenario', () => {
      // Simulate stream detection
      queue.addPrompt('first', 100, 150);
      queue.addPrompt('second', 200, 250);
      queue.addPrompt('third', 300, 350);

      // First image inserted: adds 80 chars at position 150
      queue.adjustPositionsAfterInsertion(150, 80);

      const prompts = queue.getAllPrompts();
      const first = prompts.find(p => p.prompt === 'first')!;
      const second = prompts.find(p => p.prompt === 'second')!;
      const third = prompts.find(p => p.prompt === 'third')!;

      // First unchanged
      expect(first.startIndex).toBe(100);
      expect(first.endIndex).toBe(150);

      // Second and third shifted by +80
      expect(second.startIndex).toBe(280);
      expect(second.endIndex).toBe(330);
      expect(third.startIndex).toBe(380);
      expect(third.endIndex).toBe(430);
    });
  });
});
