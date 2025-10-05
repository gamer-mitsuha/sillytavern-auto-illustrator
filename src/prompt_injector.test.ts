import {describe, it, expect} from 'vitest';
import {getDefaultMetaPrompt, updateExtensionPrompt} from './prompt_injector';

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

  describe('updateExtensionPrompt', () => {
    it('should call setExtensionPrompt with correct parameters when enabled', () => {
      const calls: any[] = [];
      const mockContext = {
        setExtensionPrompt: (...args: any[]) => {
          calls.push(args);
        },
        extensionPromptRoles: {SYSTEM: 0},
      };

      const settings: AutoIllustratorSettings = {
        enabled: true,
        wordInterval: 250,
        metaPrompt: 'test prompt',
      };

      updateExtensionPrompt(mockContext, settings);

      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBe('auto_illustrator'); // key
      expect(calls[0][1]).toBe('test prompt'); // value
      expect(calls[0][2]).toBe(1); // position: in-chat
      expect(calls[0][3]).toBe(0); // depth: last message
      expect(calls[0][4]).toBe(0); // role: SYSTEM
      expect(calls[0][5]).toBe(false); // scan: false
      expect(typeof calls[0][6]).toBe('function'); // filter function
    });

    it('should use filter function to check enabled status', () => {
      let filterFunc: any = null;
      const mockContext = {
        setExtensionPrompt: (...args: any[]) => {
          filterFunc = args[6];
        },
        extensionPromptRoles: {SYSTEM: 0},
      };

      const settings: AutoIllustratorSettings = {
        enabled: true,
        wordInterval: 250,
        metaPrompt: 'test prompt',
      };

      updateExtensionPrompt(mockContext, settings);

      expect(filterFunc).not.toBeNull();
      expect(filterFunc()).toBe(true);

      // Change enabled status
      settings.enabled = false;
      expect(filterFunc()).toBe(false);
    });

    it('should handle missing extensionPromptRoles', () => {
      const calls: any[] = [];
      const mockContext = {
        setExtensionPrompt: (...args: any[]) => {
          calls.push(args);
        },
      };

      const settings: AutoIllustratorSettings = {
        enabled: true,
        wordInterval: 250,
        metaPrompt: 'test prompt',
      };

      updateExtensionPrompt(mockContext, settings);

      expect(calls.length).toBe(1);
      expect(calls[0][4]).toBe(0); // role should default to 0
    });
  });
});
