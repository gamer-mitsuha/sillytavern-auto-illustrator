import {describe, it, expect, beforeEach} from 'vitest';
import {
  injectPrompt,
  getDefaultMetaPrompt,
  shouldInjectPrompt,
  createPromptInjectionHandler,
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

    it('should not modify empty chat array', () => {
      const chat: any[] = [];
      injectPrompt(chat, settings);
      expect(chat.length).toBe(0);
    });

    it('should inject system message before last message', () => {
      const chat = [
        {is_user: true, is_system: false, mes: 'Hello'},
        {is_user: false, is_system: false, mes: 'Response'},
      ];
      injectPrompt(chat, settings);
      expect(chat.length).toBe(3);
      expect(chat[1].is_system).toBe(true);
      expect(chat[1].role).toBe('system');
      expect(chat[1].mes).toContain(settings.metaPrompt);
      expect(chat[2].mes).toBe('Response'); // Last message still at the end
    });

    it('should inject before the only message if chat has one message', () => {
      const chat = [{is_user: true, is_system: false, mes: 'Hello'}];
      injectPrompt(chat, settings);
      expect(chat.length).toBe(2);
      expect(chat[0].is_system).toBe(true);
      expect(chat[0].mes).toContain(settings.metaPrompt);
      expect(chat[1].mes).toBe('Hello');
    });

    it('should not inject duplicate meta prompts at same position', () => {
      const chat = [
        {is_user: true, is_system: false, mes: 'First'},
        {is_user: true, is_system: false, mes: 'Second'},
      ];
      injectPrompt(chat, settings);
      expect(chat.length).toBe(3);
      // Try to inject again
      injectPrompt(chat, settings);
      expect(chat.length).toBe(3); // Should not add another
    });

    it('should modify chat array in-place', () => {
      const chat = [{is_user: true, is_system: false, mes: 'Hello'}];
      const chatReference = chat;
      injectPrompt(chat, settings);
      // Should be the same reference (modified in-place)
      expect(chat).toBe(chatReference);
    });

    it('should create system message with correct structure', () => {
      const chat = [{is_user: true, is_system: false, mes: 'Hello'}];
      injectPrompt(chat, settings);
      const systemMsg = chat[0];
      expect(systemMsg.role).toBe('system');
      expect(systemMsg.mes).toBe(settings.metaPrompt);
      expect(systemMsg.is_system).toBe(true);
      expect(systemMsg.is_user).toBe(false);
      expect(systemMsg.name).toBe('system');
      expect(systemMsg.send_date).toBeDefined();
    });
  });

  describe('createPromptInjectionHandler', () => {
    it('should create a handler function', () => {
      const getSettings = () => ({
        enabled: true,
        wordInterval: 250,
        metaPrompt: 'test',
      });
      const handler = createPromptInjectionHandler(getSettings);
      expect(typeof handler).toBe('function');
    });

    it('should inject prompt when handler is called', () => {
      const settings: AutoIllustratorSettings = {
        enabled: true,
        wordInterval: 250,
        metaPrompt: getDefaultMetaPrompt(250),
      };
      const getSettings = () => settings;
      const handler = createPromptInjectionHandler(getSettings);

      const chat = [{is_user: true, is_system: false, mes: 'Hello'}];
      handler(chat);

      expect(chat.length).toBe(2);
      expect(chat[0].is_system).toBe(true);
      expect(chat[0].mes).toBe(settings.metaPrompt);
    });

    it('should not inject when disabled', () => {
      const settings: AutoIllustratorSettings = {
        enabled: false,
        wordInterval: 250,
        metaPrompt: getDefaultMetaPrompt(250),
      };
      const getSettings = () => settings;
      const handler = createPromptInjectionHandler(getSettings);

      const chat = [{is_user: true, is_system: false, mes: 'Hello'}];
      handler(chat);

      expect(chat.length).toBe(1);
    });

    it('should use current settings when called', () => {
      let enabled = false;
      const getSettings = () => ({
        enabled,
        wordInterval: 250,
        metaPrompt: 'test prompt',
      });
      const handler = createPromptInjectionHandler(getSettings);

      const chat = [{is_user: true, is_system: false, mes: 'Hello'}];

      // First call - disabled
      handler(chat);
      expect(chat.length).toBe(1);

      // Enable and call again
      enabled = true;
      handler(chat);
      expect(chat.length).toBe(2);
      expect(chat[0].mes).toBe('test prompt');
    });
  });
});
