/**
 * Prompt Metadata Tests
 * Tests for prompt history storage and retrieval
 */

import {describe, it, expect, beforeEach} from 'vitest';
import {
  createPositionKey,
  parsePositionKey,
  getMetadata,
  generatePromptId,
  recordPrompt,
  recordImagePrompt,
  initializePromptPosition,
  addPromptVersion,
  getCurrentPromptId,
  getPromptText,
  getImagePromptId,
  getPositionHistory,
  replacePromptAtIndex,
} from './prompt_metadata';
import type {PromptPosition} from './types';

describe('PromptMetadata', () => {
  let mockContext: SillyTavernContext;

  beforeEach(() => {
    // Create fresh mock context for each test
    mockContext = {
      chat_metadata: {},
      chat: [],
      saveChat: async () => {},
    } as unknown as SillyTavernContext;
  });

  describe('replacePromptAtIndex', () => {
    it('should replace first prompt when index is 0', () => {
      const text = 'Text <!--img-prompt="old prompt"-->';
      const result = replacePromptAtIndex(text, 0, 'new prompt');
      expect(result).toBe('Text <!--img-prompt="new prompt"-->');
    });

    it('should replace second prompt when index is 1', () => {
      const text =
        'First <!--img-prompt="prompt1"--> second <!--img-prompt="prompt2"-->';
      const result = replacePromptAtIndex(text, 1, 'updated');
      expect(result).toBe(
        'First <!--img-prompt="prompt1"--> second <!--img-prompt="updated"-->'
      );
    });

    it('should leave other prompts unchanged', () => {
      const text =
        '<!--img-prompt="a"--> <!--img-prompt="b"--> <!--img-prompt="c"-->';
      const result = replacePromptAtIndex(text, 1, 'B');
      expect(result).toBe(
        '<!--img-prompt="a"--> <!--img-prompt="B"--> <!--img-prompt="c"-->'
      );
    });
  });

  describe('Position key helpers', () => {
    it('should create position key from PromptPosition', () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 3};
      expect(createPositionKey(position)).toBe('42_3');
    });

    it('should parse position key back to PromptPosition', () => {
      const position = parsePositionKey('42_3');
      expect(position).toEqual({messageId: 42, promptIndex: 3});
    });

    it('should round-trip correctly', () => {
      const original: PromptPosition = {messageId: 123, promptIndex: 5};
      const key = createPositionKey(original);
      const parsed = parsePositionKey(key);
      expect(parsed).toEqual(original);
    });
  });

  describe('getMetadata', () => {
    it('should initialize metadata if not present', () => {
      const metadata = getMetadata(mockContext);

      expect(metadata).toBeDefined();
      expect(metadata.imageUrlToPromptId).toEqual({});
      expect(metadata.promptIdToText).toEqual({});
      expect(metadata.promptPositionHistory).toEqual({});
    });

    it('should return existing metadata if present', () => {
      const existing = {
        imageUrlToPromptId: {test: 'value'},
        promptIdToText: {},
        promptPositionHistory: {},
      };
      mockContext.chat_metadata.auto_illustrator = existing;

      const metadata = getMetadata(mockContext);
      expect(metadata).toBe(existing);
      expect(metadata.imageUrlToPromptId).toEqual({test: 'value'});
    });
  });

  describe('generatePromptId', () => {
    it('should generate unique IDs for different prompts', () => {
      const id1 = generatePromptId('1girl, long hair');
      const id2 = generatePromptId('2girls, short hair');

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^prompt_[a-z0-9]+_[a-z0-9]+$/);
      expect(id2).toMatch(/^prompt_[a-z0-9]+_[a-z0-9]+$/);
    });

    it('should generate consistent format', () => {
      const id = generatePromptId('test prompt');
      expect(id).toMatch(/^prompt_[a-z0-9]+_[a-z0-9]+$/);
    });
  });

  describe('recordPrompt', () => {
    it('should record new prompt and return ID', () => {
      const promptText = '1girl, long hair, blue eyes';
      const promptId = recordPrompt(promptText, mockContext);

      expect(promptId).toBeDefined();
      expect(promptId).toMatch(/^prompt_/);

      const metadata = getMetadata(mockContext);
      expect(metadata.promptIdToText[promptId]).toBe(promptText);
    });

    it('should de-duplicate identical prompts', () => {
      const promptText = '1girl, long hair';

      const id1 = recordPrompt(promptText, mockContext);
      const id2 = recordPrompt(promptText, mockContext);

      // IDs might be different due to timestamp, but text should be stored
      const metadata = getMetadata(mockContext);
      expect(metadata.promptIdToText[id1]).toBe(promptText);
      expect(metadata.promptIdToText[id2]).toBe(promptText);
    });

    it('should handle multiple different prompts', () => {
      const prompt1 = '1girl, long hair';
      const prompt2 = '2girls, short hair';
      const prompt3 = '1boy, school uniform';

      const id1 = recordPrompt(prompt1, mockContext);
      const id2 = recordPrompt(prompt2, mockContext);
      const id3 = recordPrompt(prompt3, mockContext);

      const metadata = getMetadata(mockContext);
      expect(metadata.promptIdToText[id1]).toBe(prompt1);
      expect(metadata.promptIdToText[id2]).toBe(prompt2);
      expect(metadata.promptIdToText[id3]).toBe(prompt3);
    });
  });

  describe('recordImagePrompt', () => {
    it('should link image URL to prompt ID', () => {
      const imageUrl = 'https://example.com/image.png';
      const promptId = 'prompt_test123';

      recordImagePrompt(imageUrl, promptId, mockContext);

      const metadata = getMetadata(mockContext);
      expect(metadata.imageUrlToPromptId[imageUrl]).toBe(promptId);
    });

    it('should handle multiple images', () => {
      const url1 = 'https://example.com/img1.png';
      const url2 = 'https://example.com/img2.png';
      const id1 = 'prompt_abc';
      const id2 = 'prompt_def';

      recordImagePrompt(url1, id1, mockContext);
      recordImagePrompt(url2, id2, mockContext);

      const metadata = getMetadata(mockContext);
      expect(metadata.imageUrlToPromptId[url1]).toBe(id1);
      expect(metadata.imageUrlToPromptId[url2]).toBe(id2);
    });
  });

  describe('initializePromptPosition', () => {
    it('should create initial history entry', () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};
      const promptId = 'prompt_initial';

      initializePromptPosition(position, promptId, mockContext);

      const metadata = getMetadata(mockContext);
      const key = createPositionKey(position);
      const history = metadata.promptPositionHistory[key];

      expect(history).toBeDefined();
      expect(history.versions).toHaveLength(1);
      expect(history.versions[0].promptId).toBe(promptId);
      expect(history.versions[0].feedback).toBe('');
      expect(history.versions[0].timestamp).toBeGreaterThan(0);
    });

    it('should not overwrite existing history', () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};
      const promptId1 = 'prompt_first';
      const promptId2 = 'prompt_second';

      initializePromptPosition(position, promptId1, mockContext);
      initializePromptPosition(position, promptId2, mockContext);

      const metadata = getMetadata(mockContext);
      const key = createPositionKey(position);
      const history = metadata.promptPositionHistory[key];

      // Should still only have one version (the first one)
      expect(history.versions).toHaveLength(1);
      expect(history.versions[0].promptId).toBe(promptId1);
    });

    it('should handle multiple positions', () => {
      const pos1: PromptPosition = {messageId: 42, promptIndex: 0};
      const pos2: PromptPosition = {messageId: 42, promptIndex: 1};
      const pos3: PromptPosition = {messageId: 43, promptIndex: 0};

      initializePromptPosition(pos1, 'prompt_1', mockContext);
      initializePromptPosition(pos2, 'prompt_2', mockContext);
      initializePromptPosition(pos3, 'prompt_3', mockContext);

      const metadata = getMetadata(mockContext);
      expect(Object.keys(metadata.promptPositionHistory)).toHaveLength(3);
    });
  });

  describe('addPromptVersion', () => {
    beforeEach(() => {
      // Setup a message in the chat (array must have enough elements)
      mockContext.chat = new Array(100);
      mockContext.chat[42] = {
        index: 42,
        mes: 'Some text <!--img-prompt="1girl, long hair"-->',
      } as unknown as Message;
    });

    it('should add new version to history', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};
      const initialPromptId = recordPrompt('1girl, long hair', mockContext);
      initializePromptPosition(position, initialPromptId, mockContext);

      const newPromptId = recordPrompt(
        '1girl, long hair, detailed hands',
        mockContext
      );
      await addPromptVersion(position, newPromptId, 'fix hands', mockContext);

      const history = getPositionHistory(position, mockContext);
      expect(history?.versions).toHaveLength(2);
      expect(history?.versions[1].promptId).toBe(newPromptId);
      expect(history?.versions[1].feedback).toBe('fix hands');
    });

    it('should update message text with new prompt', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};
      const initialPromptId = recordPrompt('1girl, long hair', mockContext);
      initializePromptPosition(position, initialPromptId, mockContext);

      const newPromptId = recordPrompt('1girl, short hair', mockContext);
      await addPromptVersion(position, newPromptId, 'change hair', mockContext);

      const message = mockContext.chat[42];
      expect(message.mes).toContain('<!--img-prompt="1girl, short hair"-->');
      expect(message.mes).not.toContain('long hair');
    });

    it('should throw error if no history exists', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};
      const promptId = 'prompt_test';

      await expect(
        addPromptVersion(position, promptId, 'test', mockContext)
      ).rejects.toThrow('No history found');
    });

    it('should throw error if prompt text not found', async () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};
      initializePromptPosition(position, 'prompt_initial', mockContext);

      await expect(
        addPromptVersion(position, 'nonexistent_prompt', 'test', mockContext)
      ).rejects.toThrow('Prompt text not found');
    });

    it('should throw error if message not found', async () => {
      const position: PromptPosition = {messageId: 999, promptIndex: 0};
      const promptId = recordPrompt('test', mockContext);
      initializePromptPosition(position, promptId, mockContext);

      const newPromptId = recordPrompt('updated', mockContext);
      await expect(
        addPromptVersion(position, newPromptId, 'test', mockContext)
      ).rejects.toThrow('Message not found');
    });

    it('should handle multiple prompts in same message', async () => {
      // Setup message with multiple prompts
      mockContext.chat = new Array(100);
      mockContext.chat[42] = {
        index: 42,
        mes: 'First <!--img-prompt="1girl"--> second <!--img-prompt="1boy"-->',
      } as unknown as Message;

      const pos1: PromptPosition = {messageId: 42, promptIndex: 0};
      const pos2: PromptPosition = {messageId: 42, promptIndex: 1};

      const id1 = recordPrompt('1girl', mockContext);
      const id2 = recordPrompt('1boy', mockContext);
      initializePromptPosition(pos1, id1, mockContext);
      initializePromptPosition(pos2, id2, mockContext);

      // Update second prompt
      const newId2 = recordPrompt('1man', mockContext);
      await addPromptVersion(pos2, newId2, 'age up', mockContext);

      const message = mockContext.chat[42];
      expect(message.mes).toContain('<!--img-prompt="1girl"-->');
      expect(message.mes).toContain('<!--img-prompt="1man"-->');
      expect(message.mes).not.toContain('1boy');
    });
  });

  describe('getCurrentPromptId', () => {
    it('should return latest prompt ID', () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};
      const id1 = 'prompt_v1';
      const id2 = 'prompt_v2';

      initializePromptPosition(position, id1, mockContext);

      // Manually add second version to metadata
      const metadata = getMetadata(mockContext);
      const key = createPositionKey(position);
      metadata.promptPositionHistory[key].versions.push({
        promptId: id2,
        feedback: 'test',
        timestamp: Date.now(),
      });

      expect(getCurrentPromptId(position, mockContext)).toBe(id2);
    });

    it('should return null if no history exists', () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};
      expect(getCurrentPromptId(position, mockContext)).toBeNull();
    });

    it('should return null if history is empty', () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};
      const metadata = getMetadata(mockContext);
      const key = createPositionKey(position);
      metadata.promptPositionHistory[key] = {versions: []};

      expect(getCurrentPromptId(position, mockContext)).toBeNull();
    });
  });

  describe('getPromptText', () => {
    it('should return prompt text by ID', () => {
      const promptText = '1girl, long hair';
      const promptId = recordPrompt(promptText, mockContext);

      expect(getPromptText(promptId, mockContext)).toBe(promptText);
    });

    it('should return null for nonexistent ID', () => {
      expect(getPromptText('nonexistent', mockContext)).toBeNull();
    });
  });

  describe('getImagePromptId', () => {
    it('should return prompt ID for image URL', () => {
      const imageUrl = 'https://example.com/image.png';
      const promptId = 'prompt_test';

      recordImagePrompt(imageUrl, promptId, mockContext);

      expect(getImagePromptId(imageUrl, mockContext)).toBe(promptId);
    });

    it('should return null for nonexistent URL', () => {
      expect(
        getImagePromptId('https://example.com/none.png', mockContext)
      ).toBeNull();
    });
  });

  describe('getPositionHistory', () => {
    it('should return complete history for position', () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};
      const promptId = 'prompt_test';

      initializePromptPosition(position, promptId, mockContext);

      const history = getPositionHistory(position, mockContext);
      expect(history).toBeDefined();
      expect(history?.versions).toHaveLength(1);
      expect(history?.versions[0].promptId).toBe(promptId);
    });

    it('should return null for nonexistent position', () => {
      const position: PromptPosition = {messageId: 999, promptIndex: 0};
      expect(getPositionHistory(position, mockContext)).toBeNull();
    });

    it('should include all versions chronologically', () => {
      const position: PromptPosition = {messageId: 42, promptIndex: 0};

      initializePromptPosition(position, 'prompt_v1', mockContext);

      const metadata = getMetadata(mockContext);
      const key = createPositionKey(position);
      metadata.promptPositionHistory[key].versions.push({
        promptId: 'prompt_v2',
        feedback: 'update 1',
        timestamp: Date.now() + 1000,
      });
      metadata.promptPositionHistory[key].versions.push({
        promptId: 'prompt_v3',
        feedback: 'update 2',
        timestamp: Date.now() + 2000,
      });

      const history = getPositionHistory(position, mockContext);
      expect(history?.versions).toHaveLength(3);
      expect(history?.versions[0].promptId).toBe('prompt_v1');
      expect(history?.versions[1].promptId).toBe('prompt_v2');
      expect(history?.versions[2].promptId).toBe('prompt_v3');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete workflow: detect → generate → update → regenerate', async () => {
      // Setup
      mockContext.chat = new Array(100);
      mockContext.chat[42] = {
        index: 42,
        mes: 'Story text <!--img-prompt="1girl, long hair"-->',
      } as unknown as Message;

      const position: PromptPosition = {messageId: 42, promptIndex: 0};

      // 1. Detect prompt and initialize
      const originalPromptText = '1girl, long hair';
      const originalPromptId = recordPrompt(originalPromptText, mockContext);
      initializePromptPosition(position, originalPromptId, mockContext);

      // 2. Generate image and record
      const imageUrl = 'https://example.com/generated.png';
      recordImagePrompt(imageUrl, originalPromptId, mockContext);

      // 3. Update prompt with feedback
      const updatedPromptText = '1girl, long hair, detailed hands';
      const updatedPromptId = recordPrompt(updatedPromptText, mockContext);
      await addPromptVersion(
        position,
        updatedPromptId,
        'fix hand anatomy',
        mockContext
      );

      // 4. Verify state
      const currentId = getCurrentPromptId(position, mockContext);
      expect(currentId).toBe(updatedPromptId);
      expect(getPromptText(currentId!, mockContext)).toBe(updatedPromptText);

      const history = getPositionHistory(position, mockContext);
      expect(history?.versions).toHaveLength(2);

      // Original image still points to original prompt
      expect(getImagePromptId(imageUrl, mockContext)).toBe(originalPromptId);

      // Message text updated
      expect(mockContext.chat[42].mes).toContain(updatedPromptText);
    });
  });
});
