import {describe, it, expect, beforeEach} from 'vitest';
import {
  injectPrompt,
  getDefaultMetaPrompt,
  shouldInjectPrompt,
} from './prompt_injector';

describe('prompt_injector', () => {
  describe('getDefaultMetaPrompt', () => {
    it('should return a meta prompt with default word interval', () => {
      const metaPrompt = getDefaultMetaPrompt(250);
      expect(metaPrompt).toContain('250');
      expect(metaPrompt).toContain('<img_prompt="');
      expect(metaPrompt).toContain('">');
    });

    it('should handle different word intervals', () => {
      const metaPrompt = getDefaultMetaPrompt(500);
      expect(metaPrompt).toContain('500');
    });
  });

  describe('shouldInjectPrompt', () => {
    it('should return true when enabled', () => {
      const settings: AutoIllustratorSettings = {
        enabled: true,
        wordInterval: 250,
        metaPrompt: 'test',
      };
      expect(shouldInjectPrompt(settings)).toBe(true);
    });

    it('should return false when disabled', () => {
      const settings: AutoIllustratorSettings = {
        enabled: false,
        wordInterval: 250,
        metaPrompt: 'test',
      };
      expect(shouldInjectPrompt(settings)).toBe(false);
    });
  });

  describe('injectPrompt', () => {
    let settings: AutoIllustratorSettings;

    beforeEach(() => {
      settings = {
        enabled: true,
        wordInterval: 250,
        metaPrompt: getDefaultMetaPrompt(250),
      };
    });

    it('should not modify chat when disabled', () => {
      settings.enabled = false;
      const chat = [{is_user: true, is_system: false, mes: 'Hello'}];
      const originalLength = chat.length;
      injectPrompt(chat, settings);
      expect(chat.length).toBe(originalLength);
    });

    it('should inject meta prompt into system message when enabled', () => {
      const chat = [
        {is_system: true, is_user: false, mes: 'You are a helpful assistant.'},
        {is_user: true, is_system: false, mes: 'Hello'},
      ];
      injectPrompt(chat, settings);
      expect(chat[0].mes).toContain('You are a helpful assistant.');
      expect(chat[0].mes).toContain(settings.metaPrompt);
    });

    it('should create system message if none exists', () => {
      const chat = [{is_user: true, is_system: false, mes: 'Hello'}];
      const originalLength = chat.length;
      injectPrompt(chat, settings);
      expect(chat.length).toBe(originalLength + 1);
      expect(chat[0].is_system).toBe(true);
      expect(chat[0].role).toBe('system'); // Should have role field for API
      expect(chat[0].mes).toContain(settings.metaPrompt);
    });

    it('should not inject duplicate meta prompts', () => {
      const chat = [
        {is_system: true, is_user: false, mes: settings.metaPrompt},
        {is_user: true, is_system: false, mes: 'Hello'},
      ];
      injectPrompt(chat, settings);
      const metaPromptCount = (chat[0].mes.match(/<img_prompt="/g) || [])
        .length;
      const expectedCount = (settings.metaPrompt.match(/<img_prompt="/g) || [])
        .length;
      expect(metaPromptCount).toBe(expectedCount);
    });

    it('should modify chat array in-place', () => {
      const chat = [{is_user: true, is_system: false, mes: 'Hello'}];
      const chatReference = chat;
      injectPrompt(chat, settings);
      // Should be the same reference (modified in-place)
      expect(chat).toBe(chatReference);
      // But content should be different
      expect(chat[0].is_system).toBe(true);
    });
  });
});
