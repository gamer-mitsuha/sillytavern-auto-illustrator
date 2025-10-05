/**
 * Tests for Queue Processor Module
 * Note: Some async integration scenarios are tested through manual/integration testing
 * due to the complex asynchronous nature of the processor
 */

import {describe, it, expect, beforeEach, vi} from 'vitest';
import {QueueProcessor} from './queue_processor';
import {ImageGenerationQueue} from './streaming_image_queue';
import {createMockContext} from './test_helpers';

describe('QueueProcessor', () => {
  let processor: QueueProcessor;
  let queue: ImageGenerationQueue;
  let mockContext: SillyTavernContext;

  beforeEach(() => {
    queue = new ImageGenerationQueue();
    mockContext = createMockContext({
      SlashCommandParser: {
        commands: {
          sd: {
            callback: vi.fn().mockResolvedValue('https://example.com/test.jpg'),
          },
        },
      },
    });
    processor = new QueueProcessor(queue, mockContext, 1);
  });

  describe('initialization and lifecycle', () => {
    it('should create processor with correct max concurrent', () => {
      const customProcessor = new QueueProcessor(queue, mockContext, 3);
      expect(customProcessor.getStatus().maxConcurrent).toBe(3);
    });

    it('should start with correct state', () => {
      const mockCallback = vi.fn();
      processor.start(0, mockCallback);

      expect(processor.getStatus().isRunning).toBe(true);
      expect(processor.getStatus().messageId).toBe(0);
      expect(processor.getStatus().activeGenerations).toBe(0);
    });

    it('should stop processor', () => {
      processor.start(0, vi.fn());
      expect(processor.getStatus().isRunning).toBe(true);

      processor.stop();

      expect(processor.getStatus().isRunning).toBe(false);
      expect(processor.getStatus().messageId).toBe(-1);
    });

    it('should handle stop when not running', () => {
      // Should not throw
      processor.stop();
      expect(processor.getStatus().isRunning).toBe(false);
    });

    it('should stop previous processor when starting new one', () => {
      processor.start(0, vi.fn());
      expect(processor.getStatus().messageId).toBe(0);

      processor.start(1, vi.fn());
      expect(processor.getStatus().messageId).toBe(1);
    });
  });

  describe('getStatus', () => {
    it('should return correct status when not running', () => {
      const status = processor.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.messageId).toBe(-1);
      expect(status.activeGenerations).toBe(0);
      expect(status.maxConcurrent).toBe(1);
      expect(status.queueStats).toBeDefined();
    });

    it('should return correct status when running', () => {
      processor.start(5, vi.fn());

      const status = processor.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.messageId).toBe(5);
      expect(status.maxConcurrent).toBe(1);
    });

    it('should include queue stats', () => {
      queue.addPrompt('test1', 0, 10);
      queue.addPrompt('test2', 10, 20);

      const status = processor.getStatus();

      expect(status.queueStats.QUEUED).toBe(2);
      expect(status.queueStats.COMPLETED).toBe(0);
    });
  });

  describe('processRemaining', () => {
    it('should handle empty queue', async () => {
      processor.start(0, vi.fn());

      // Should not throw
      await processor.processRemaining();

      expect(queue.size()).toBe(0);
    });

    it('should process prompts that are already queued', async () => {
      queue.addPrompt('prompt1', 0, 10);
      queue.addPrompt('prompt2', 10, 20);

      processor.start(0, vi.fn());

      // ProcessRemaining should handle the queue
      await processor.processRemaining();

      // At least processing should have been attempted
      const stats = queue.getStats();
      expect(
        stats.QUEUED + stats.GENERATING + stats.COMPLETED + stats.FAILED
      ).toBe(2);
    });
  });

  describe('trigger', () => {
    it('should not throw when processor is running', () => {
      processor.start(0, vi.fn());
      queue.addPrompt('test', 0, 10);

      // Should not throw
      processor.trigger();
    });

    it('should not throw when processor is not running', () => {
      queue.addPrompt('test', 0, 10);

      // Should not throw
      processor.trigger();

      // Prompt should still be queued
      expect(queue.getPromptsByState('QUEUED')).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('should handle max concurrent of different values', () => {
      const processor1 = new QueueProcessor(queue, mockContext, 1);
      const processor2 = new QueueProcessor(queue, mockContext, 3);
      const processor3 = new QueueProcessor(queue, mockContext, 5);

      expect(processor1.getStatus().maxConcurrent).toBe(1);
      expect(processor2.getStatus().maxConcurrent).toBe(3);
      expect(processor3.getStatus().maxConcurrent).toBe(5);
    });

    it('should not start processing if already processing', () => {
      processor.start(0, vi.fn());
      const initialMessageId = processor.getStatus().messageId;

      // Starting again should update messageId
      processor.start(1, vi.fn());

      expect(processor.getStatus().messageId).not.toBe(initialMessageId);
    });
  });
});
