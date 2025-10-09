/**
 * Prompt Updater Tests
 * Tests for LLM-based prompt updating functionality
 */

import {describe, it, expect, beforeEach, vi} from 'vitest';
import {updatePromptForPosition} from './prompt_updater';
import {
  recordPrompt,
  initializePromptPosition,
  getPromptText,
  getCurrentPromptId,
  getPositionHistory,
} from './prompt_metadata';
import type {PromptPosition} from './types';

describe('PromptUpdater', () => {
  let mockContext: SillyTavernContext;

  beforeEach(() => {
    // Create fresh mock context for each test
    mockContext = {
      chat_metadata: {},
      chat: new Array(100),
      saveChat: vi.fn(async () => {}),
      generateQuietPrompt: vi.fn(),
    } as unknown as SillyTavernContext;

    // Setup a message
    mockContext.chat[42] = {
      index: 42,
      mes: 'Story text <!--img-prompt="1girl, long hair"-->',
    } as unknown as Message;
  });

  describe('updatePromptForPosition', () => {
    it('should successfully update prompt with LLM feedback', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};
      const originalPrompt = '1girl, long hair';

      // Initialize position with original prompt
      const originalId = recordPrompt(originalPrompt, mockContext);
      initializePromptPosition(position, originalId, mockContext);

      // Mock LLM response
      (mockContext.generateQuietPrompt as vi.Mock).mockResolvedValue(
        '<!--img-prompt="1girl, long hair, detailed hands"-->'
      );

      const newPromptId = await updatePromptForPosition(
        position,
        'fix hands',
        mockContext
      );

      expect(newPromptId).toBeTruthy();
      expect(mockContext.generateQuietPrompt).toHaveBeenCalledOnce();

      const newPrompt = getPromptText(newPromptId!, mockContext);
      expect(newPrompt).toBe('1girl, long hair, detailed hands');

      // Verify history updated
      const history = getPositionHistory(position, mockContext);
      expect(history?.versions).toHaveLength(2);
      expect(history?.versions[1].feedback).toBe('fix hands');
    });

    it('should update message text with new prompt', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};

      const originalId = recordPrompt('1girl, long hair', mockContext);
      initializePromptPosition(position, originalId, mockContext);

      (mockContext.generateQuietPrompt as vi.Mock).mockResolvedValue(
        '<!--img-prompt="1girl, short hair"-->'
      );

      await updatePromptForPosition(position, 'make hair short', mockContext);

      expect(mockContext.chat[42].mes).toContain(
        '<!--img-prompt="1girl, short hair"-->'
      );
      expect(mockContext.chat[42].mes).not.toContain('long hair');
    });

    it('should throw error if LLM not available', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};

      const originalId = recordPrompt('1girl', mockContext);
      initializePromptPosition(position, originalId, mockContext);

      // Remove LLM function
      mockContext.generateQuietPrompt = undefined as any;

      await expect(
        updatePromptForPosition(position, 'test', mockContext)
      ).rejects.toThrow('LLM generation not available');
    });

    it('should return null if no prompt found at position', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 5};

      const result = await updatePromptForPosition(
        position,
        'test',
        mockContext
      );

      expect(result).toBeNull();
      expect(mockContext.generateQuietPrompt).not.toHaveBeenCalled();
    });

    it('should return null if LLM response cannot be parsed', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};

      const originalId = recordPrompt('1girl', mockContext);
      initializePromptPosition(position, originalId, mockContext);

      // LLM returns unparseable response
      (mockContext.generateQuietPrompt as vi.Mock).mockResolvedValue(
        'I cannot help with that'
      );

      const result = await updatePromptForPosition(
        position,
        'test',
        mockContext
      );

      expect(result).toBeNull();
    });

    it('should handle LLM generation errors', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};

      const originalId = recordPrompt('1girl', mockContext);
      initializePromptPosition(position, originalId, mockContext);

      (mockContext.generateQuietPrompt as vi.Mock).mockRejectedValue(
        new Error('LLM service unavailable')
      );

      await expect(
        updatePromptForPosition(position, 'test', mockContext)
      ).rejects.toThrow('LLM service unavailable');
    });

    it('should extract prompt from various LLM response formats', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};

      const originalId = recordPrompt('1girl', mockContext);
      initializePromptPosition(position, originalId, mockContext);

      const testCases = [
        '<!--img-prompt="updated prompt"-->',
        'Here is the updated prompt:\n<!--img-prompt="updated prompt"-->',
        '<!--img-prompt="updated prompt"-->\nHope this helps!',
        'The new prompt is: <!--img-prompt="updated prompt"--> as requested.',
      ];

      for (const llmResponse of testCases) {
        (mockContext.generateQuietPrompt as vi.Mock).mockResolvedValue(
          llmResponse
        );

        const result = await updatePromptForPosition(
          position,
          'test',
          mockContext
        );

        expect(result).toBeTruthy();
        const prompt = getPromptText(result!, mockContext);
        expect(prompt).toBe('updated prompt');

        // Reset for next test
        const currentId = getCurrentPromptId(position, mockContext);
        getPromptText(currentId!, mockContext);
      }
    });

    it('should handle multiple updates to same position', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};

      // Initial prompt
      const id1 = recordPrompt('1girl, long hair', mockContext);
      initializePromptPosition(position, id1, mockContext);

      // First update
      (mockContext.generateQuietPrompt as vi.Mock).mockResolvedValue(
        '<!--img-prompt="1girl, long hair, blue eyes"-->'
      );
      await updatePromptForPosition(position, 'add blue eyes', mockContext);

      // Second update
      (mockContext.generateQuietPrompt as vi.Mock).mockResolvedValue(
        '<!--img-prompt="1girl, long hair, blue eyes, school uniform"-->'
      );
      await updatePromptForPosition(
        position,
        'add school uniform',
        mockContext
      );

      const history = getPositionHistory(position, mockContext);
      expect(history?.versions).toHaveLength(3);
      expect(history?.versions[0].feedback).toBe('');
      expect(history?.versions[1].feedback).toBe('add blue eyes');
      expect(history?.versions[2].feedback).toBe('add school uniform');

      const currentId = getCurrentPromptId(position, mockContext);
      const currentPrompt = getPromptText(currentId!, mockContext);
      expect(currentPrompt).toBe('1girl, long hair, blue eyes, school uniform');
    });

    it('should pass correct template to LLM', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};

      const originalId = recordPrompt('1girl, long hair', mockContext);
      initializePromptPosition(position, originalId, mockContext);

      (mockContext.generateQuietPrompt as vi.Mock).mockResolvedValue(
        '<!--img-prompt="updated"-->'
      );

      await updatePromptForPosition(position, 'make it better', mockContext);

      const llmCall = (mockContext.generateQuietPrompt as vi.Mock).mock
        .calls[0][0];
      expect(llmCall.quietPrompt).toContain('1girl, long hair');
      expect(llmCall.quietPrompt).toContain('make it better');
      expect(llmCall.quietPrompt).toContain('<!--img-prompt=');
      expect(llmCall.quietToLoud).toBe(true);
    });

    it('should save chat after successful update', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};

      const originalId = recordPrompt('1girl', mockContext);
      initializePromptPosition(position, originalId, mockContext);

      (mockContext.generateQuietPrompt as vi.Mock).mockResolvedValue(
        '<!--img-prompt="updated"-->'
      );

      await updatePromptForPosition(position, 'test', mockContext);

      expect(mockContext.saveChat).toHaveBeenCalled();
    });

    it('should handle empty user feedback gracefully', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};

      const originalId = recordPrompt('1girl', mockContext);
      initializePromptPosition(position, originalId, mockContext);

      (mockContext.generateQuietPrompt as vi.Mock).mockResolvedValue(
        '<!--img-prompt="1girl, improved"-->'
      );

      const result = await updatePromptForPosition(position, '', mockContext);

      expect(result).toBeTruthy();
      expect(mockContext.generateQuietPrompt).toHaveBeenCalled();

      const llmCall = (mockContext.generateQuietPrompt as vi.Mock).mock
        .calls[0][0];
      expect(llmCall.quietPrompt).toContain(''); // Empty feedback
    });

    it('should handle special characters in feedback', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};

      const originalId = recordPrompt('1girl', mockContext);
      initializePromptPosition(position, originalId, mockContext);

      (mockContext.generateQuietPrompt as vi.Mock).mockResolvedValue(
        '<!--img-prompt="updated"-->'
      );

      const feedback = 'Fix "anatomy" & <details> (especially hands)';
      await updatePromptForPosition(position, feedback, mockContext);

      const history = getPositionHistory(position, mockContext);
      expect(history?.versions[1].feedback).toBe(feedback);
    });
  });

  describe('Integration with metadata', () => {
    it('should maintain consistency between prompt text and history', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};

      const originalId = recordPrompt('original prompt', mockContext);
      initializePromptPosition(position, originalId, mockContext);

      (mockContext.generateQuietPrompt as vi.Mock).mockResolvedValue(
        '<!--img-prompt="updated prompt"-->'
      );

      const newId = await updatePromptForPosition(
        position,
        'update it',
        mockContext
      );

      // Verify current ID matches
      const currentId = getCurrentPromptId(position, mockContext);
      expect(currentId).toBe(newId);

      // Verify text can be retrieved
      const text = getPromptText(newId!, mockContext);
      expect(text).toBe('updated prompt');

      // Verify history has both versions
      const history = getPositionHistory(position, mockContext);
      expect(history?.versions[0].promptId).toBe(originalId);
      expect(history?.versions[1].promptId).toBe(newId);
    });
  });
});
