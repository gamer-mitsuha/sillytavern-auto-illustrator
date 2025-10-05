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
      } as any;

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
      expect(calls[0][3]).toBe(1); // depth: 1 message before end
      expect(calls[0][4]).toBe(false); // scan: false
      expect(calls[0][5]).toBe(0); // role: SYSTEM
    });

    it('should set empty value when disabled', () => {
      const calls: any[] = [];
      const mockContext = {
        setExtensionPrompt: (...args: any[]) => {
          calls.push(args);
        },
      } as any;

      const settings: AutoIllustratorSettings = {
        enabled: false,
        wordInterval: 250,
        metaPrompt: 'test prompt',
      };

      updateExtensionPrompt(mockContext, settings);

      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBe('auto_illustrator'); // key
      expect(calls[0][1]).toBe(''); // value should be empty when disabled
      expect(calls[0][2]).toBe(1); // position: in-chat
      expect(calls[0][3]).toBe(1); // depth: 1 message before end
      expect(calls[0][4]).toBe(false); // scan: false
      expect(calls[0][5]).toBe(0); // role: SYSTEM
    });

    it('should handle missing setExtensionPrompt function', () => {
      const mockContext = {};

      const settings: AutoIllustratorSettings = {
        enabled: true,
        wordInterval: 250,
        metaPrompt: 'test prompt',
      };

      // Should not throw
      expect(() => {
        updateExtensionPrompt(mockContext as any, settings);
      }).not.toThrow();
    });
  });
});
