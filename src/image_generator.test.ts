/**
 * Tests for Image Generator V2 Module
 */

import {describe, it, expect, beforeEach, vi} from 'vitest';
import {
  initializeConcurrencyLimiter,
  updateMaxConcurrent,
  updateMinInterval,
  generateImage,
  insertDeferredImages,
} from './image_generator';
import type {DeferredImage, QueuedPrompt} from './types';
import type {AutoIllustratorChatMetadata} from './types';
import * as messageRenderer from './utils/message_renderer';

// Mock dependencies
vi.mock('./logger', () => ({
  createLogger: () => ({
    trace: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('./regex', () => ({
  extractImagePromptsMultiPattern: vi.fn((text, patterns) => {
    // Simple mock: find <!--img-prompt="..."-->
    const matches: any[] = [];
    const regex = /<!--img-prompt="([^"]+)"-->/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        fullMatch: match[0],
        prompt: match[1],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
    return matches;
  }),
}));

vi.mock('./prompt_manager', () => ({
  linkImageToPrompt: vi.fn(),
}));

vi.mock('./metadata', () => ({
  saveMetadata: vi.fn().mockResolvedValue(undefined),
  getMetadata: vi.fn(),
}));

vi.mock('./utils/message_renderer', () => ({
  renderMessageUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./manual_generation', () => ({
  attachRegenerationHandlers: vi.fn(),
}));

describe('Image Generator V2', () => {
  describe('initializeConcurrencyLimiter', () => {
    it('should initialize limiter with correct settings', () => {
      expect(() => {
        initializeConcurrencyLimiter(3, 100);
      }).not.toThrow();
    });
  });

  describe('updateMaxConcurrent', () => {
    it('should update max concurrent limit', () => {
      initializeConcurrencyLimiter(1);
      expect(() => {
        updateMaxConcurrent(5);
      }).not.toThrow();
    });

    it('should initialize limiter if not already initialized', () => {
      expect(() => {
        updateMaxConcurrent(3);
      }).not.toThrow();
    });
  });

  describe('updateMinInterval', () => {
    it('should update minimum interval', () => {
      initializeConcurrencyLimiter(1);
      expect(() => {
        updateMinInterval(200);
      }).not.toThrow();
    });

    it('should initialize limiter if not already initialized', () => {
      expect(() => {
        updateMinInterval(150);
      }).not.toThrow();
    });
  });

  describe('insertDeferredImages', () => {
    let mockContext: any;
    let mockMetadata: AutoIllustratorChatMetadata;
    let mockSettings: AutoIllustratorSettings;

    beforeEach(() => {
      mockContext = {
        chat: [
          {mes: 'Message 0'},
          {
            mes: 'Test message with <!--img-prompt="a cat"-->',
          },
        ],
        extensionSettings: {
          auto_illustrator: {
            promptDetectionPatterns: ['<!--img-prompt="([^"]+)"-->'],
            imageDisplayWidth: 100,
          },
        },
        eventSource: {
          emit: vi.fn().mockResolvedValue(undefined),
          once: vi.fn(),
        },
        updateMessageBlock: vi.fn(),
        saveChat: vi.fn().mockResolvedValue(undefined),
        eventTypes: {
          MESSAGE_EDITED: 'MESSAGE_EDITED',
          MESSAGE_UPDATED: 'MESSAGE_UPDATED',
        },
      };

      mockMetadata = {
        promptRegistry: {
          promptNodes: new Map(),
          imageToPromptId: new Map(),
        },
      };

      mockSettings = mockContext.extensionSettings
        .auto_illustrator as AutoIllustratorSettings;
    });

    it('should return 0 for empty deferred images array', async () => {
      const count = await insertDeferredImages(
        [],
        1,
        mockContext,
        mockMetadata,
        mockSettings
      );
      expect(count).toBe(0);
    });

    it('should return 0 if message not found', async () => {
      const deferred: DeferredImage[] = [
        {
          prompt: {
            id: 'prompt1',
            prompt: 'a cat',
            fullMatch: '<!--img-prompt="a cat"-->',
            startIndex: 0,
            endIndex: 27,
            state: 'COMPLETED',
            attempts: 1,
            detectedAt: Date.now(),
            completedAt: Date.now(),
          },
          imageUrl: 'http://example.com/cat.jpg',
          promptId: 'prompt1',
          completedAt: Date.now(),
        },
      ];

      const count = await insertDeferredImages(
        deferred,
        999, // Non-existent message
        mockContext,
        mockMetadata,
        mockSettings
      );
      expect(count).toBe(0);
    });

    it('should insert new image after prompt tag (streaming mode)', async () => {
      const queuedPrompt: QueuedPrompt = {
        id: 'prompt1',
        prompt: 'a cat',
        fullMatch: '<!--img-prompt="a cat"-->',
        startIndex: 18,
        endIndex: 45,
        state: 'COMPLETED',
        attempts: 1,
        detectedAt: Date.now(),
        completedAt: Date.now(),
      };

      const deferred: DeferredImage[] = [
        {
          prompt: queuedPrompt,
          imageUrl: 'http://example.com/cat.jpg',
          promptId: 'prompt1',
          promptPreview: 'a cat',
          completedAt: Date.now(),
        },
      ];

      const count = await insertDeferredImages(
        deferred,
        1,
        mockContext,
        mockMetadata,
        mockSettings
      );

      expect(count).toBe(1);
      expect(mockContext.chat[1].mes).toContain('<img src=');
      expect(mockContext.chat[1].mes).toContain('http://example.com/cat.jpg');
      // saveChat is now handled by renderMessageUpdate
      expect(messageRenderer.renderMessageUpdate).toHaveBeenCalledWith(1);
    });

    it('should replace existing image (regeneration replace mode)', async () => {
      mockContext.chat[1].mes =
        'Text with <img src="http://example.com/old.jpg" alt="old" title="old">';

      const queuedPrompt: QueuedPrompt = {
        id: 'prompt1',
        prompt: 'a cat',
        fullMatch: '',
        startIndex: 0,
        endIndex: 0,
        state: 'COMPLETED',
        attempts: 1,
        detectedAt: Date.now(),
        completedAt: Date.now(),
        targetImageUrl: 'http://example.com/old.jpg',
        targetPromptId: 'prompt1',
        insertionMode: 'replace-image',
      };

      const deferred: DeferredImage[] = [
        {
          prompt: queuedPrompt,
          imageUrl: 'http://example.com/new.jpg',
          promptId: 'prompt1',
          completedAt: Date.now(),
        },
      ];

      const count = await insertDeferredImages(
        deferred,
        1,
        mockContext,
        mockMetadata,
        mockSettings
      );

      expect(count).toBe(1);
      expect(mockContext.chat[1].mes).not.toContain('old.jpg');
      expect(mockContext.chat[1].mes).toContain('new.jpg');
    });

    it('should append after existing image (regeneration append mode)', async () => {
      mockContext.chat[1].mes =
        'Text with <img src="http://example.com/old.jpg" alt="old" title="old">';

      const queuedPrompt: QueuedPrompt = {
        id: 'prompt1',
        prompt: 'a cat',
        fullMatch: '',
        startIndex: 0,
        endIndex: 0,
        state: 'COMPLETED',
        attempts: 1,
        detectedAt: Date.now(),
        completedAt: Date.now(),
        targetImageUrl: 'http://example.com/old.jpg',
        targetPromptId: 'prompt1',
        insertionMode: 'append-after-image',
      };

      const deferred: DeferredImage[] = [
        {
          prompt: queuedPrompt,
          imageUrl: 'http://example.com/new.jpg',
          promptId: 'prompt1',
          completedAt: Date.now(),
        },
      ];

      const count = await insertDeferredImages(
        deferred,
        1,
        mockContext,
        mockMetadata,
        mockSettings
      );

      expect(count).toBe(1);
      expect(mockContext.chat[1].mes).toContain('old.jpg');
      expect(mockContext.chat[1].mes).toContain('new.jpg');
      // New image should appear after old image
      const oldIndex = mockContext.chat[1].mes.indexOf('old.jpg');
      const newIndex = mockContext.chat[1].mes.indexOf('new.jpg');
      expect(newIndex).toBeGreaterThan(oldIndex);
    });

    it('should handle mixed batch (streaming + regeneration)', async () => {
      mockContext.chat[1].mes =
        'Text <!--img-prompt="a cat"--> and <img src="http://example.com/old.jpg" alt="old" title="old">';

      const streamingPrompt: QueuedPrompt = {
        id: 'prompt1',
        prompt: 'a cat',
        fullMatch: '<!--img-prompt="a cat"-->',
        startIndex: 5,
        endIndex: 32,
        state: 'COMPLETED',
        attempts: 1,
        detectedAt: Date.now(),
        completedAt: Date.now(),
      };

      const regenerationPrompt: QueuedPrompt = {
        id: 'prompt2',
        prompt: 'regenerated',
        fullMatch: '',
        startIndex: 0,
        endIndex: 0,
        state: 'COMPLETED',
        attempts: 1,
        detectedAt: Date.now(),
        completedAt: Date.now(),
        targetImageUrl: 'http://example.com/old.jpg',
        targetPromptId: 'prompt2',
        insertionMode: 'replace-image',
      };

      const deferred: DeferredImage[] = [
        {
          prompt: streamingPrompt,
          imageUrl: 'http://example.com/cat.jpg',
          promptId: 'prompt1',
          completedAt: Date.now(),
        },
        {
          prompt: regenerationPrompt,
          imageUrl: 'http://example.com/new.jpg',
          promptId: 'prompt2',
          completedAt: Date.now(),
        },
      ];

      const count = await insertDeferredImages(
        deferred,
        1,
        mockContext,
        mockMetadata,
        mockSettings
      );

      expect(count).toBe(2);
      expect(mockContext.chat[1].mes).toContain('cat.jpg');
      expect(mockContext.chat[1].mes).toContain('new.jpg');
      expect(mockContext.chat[1].mes).not.toContain('old.jpg');
    });

    it('should call renderMessageUpdate to handle events and save', async () => {
      const deferred: DeferredImage[] = [
        {
          prompt: {
            id: 'prompt1',
            prompt: 'a cat',
            fullMatch: '<!--img-prompt="a cat"-->',
            startIndex: 18,
            endIndex: 45,
            state: 'COMPLETED',
            attempts: 1,
            detectedAt: Date.now(),
            completedAt: Date.now(),
          },
          imageUrl: 'http://example.com/cat.jpg',
          promptId: 'prompt1',
          completedAt: Date.now(),
        },
      ];

      await insertDeferredImages(
        deferred,
        1,
        mockContext,
        mockMetadata,
        mockSettings
      );

      // Should call renderMessageUpdate with the message ID
      expect(messageRenderer.renderMessageUpdate).toHaveBeenCalledWith(1);
    });

    it('should handle errors gracefully', async () => {
      // Create a deferred image with a prompt that won't be found
      const deferred: DeferredImage[] = [
        {
          prompt: {
            id: 'prompt1',
            prompt: 'nonexistent prompt',
            fullMatch: '<!--img-prompt="nonexistent prompt"-->',
            startIndex: 999, // Invalid position
            endIndex: 1000,
            state: 'COMPLETED',
            attempts: 1,
            detectedAt: Date.now(),
            completedAt: Date.now(),
          },
          imageUrl: 'http://example.com/cat.jpg',
          promptId: 'prompt1',
          completedAt: Date.now(),
        },
      ];

      // Should not throw, just log warning
      const count = await insertDeferredImages(
        deferred,
        1,
        mockContext,
        mockMetadata,
        mockSettings
      );

      expect(count).toBe(0);
      // Should still call renderMessageUpdate even if no images inserted
      expect(messageRenderer.renderMessageUpdate).toHaveBeenCalledWith(1);
    });
  });
});
