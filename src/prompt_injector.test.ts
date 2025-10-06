import {describe, it, expect} from 'vitest';
import {createMockContext} from './test_helpers';
import {updateExtensionPrompt} from './prompt_injector';

describe('prompt_injector', () => {
  describe('updateExtensionPrompt', () => {
    it('should call setExtensionPrompt with correct parameters when enabled', () => {
      const calls: unknown[][] = [];
      const mockContext = createMockContext({
        setExtensionPrompt: (...args: unknown[]) => {
          calls.push(args);
        },
      });

      const settings: AutoIllustratorSettings = {
        enabled: true,
        wordInterval: 250,
        metaPrompt: 'test prompt',
        currentPresetId: 'default',
        customPresets: [],
        streamingEnabled: true,
        streamingPollInterval: 300,
        maxConcurrentGenerations: 1,
        logLevel: 'info',
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
      const calls: unknown[][] = [];
      const mockContext = createMockContext({
        setExtensionPrompt: (...args: unknown[]) => {
          calls.push(args);
        },
      });

      const settings: AutoIllustratorSettings = {
        enabled: false,
        wordInterval: 250,
        metaPrompt: 'test prompt',
        currentPresetId: 'default',
        customPresets: [],
        streamingEnabled: true,
        streamingPollInterval: 300,
        maxConcurrentGenerations: 1,
        logLevel: 'info',
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
      const mockContext = createMockContext({});

      const settings: AutoIllustratorSettings = {
        enabled: true,
        wordInterval: 250,
        metaPrompt: 'test prompt',
        currentPresetId: 'default',
        customPresets: [],
        streamingEnabled: true,
        streamingPollInterval: 300,
        maxConcurrentGenerations: 1,
        logLevel: 'info',
      };

      // Should not throw
      expect(() => {
        updateExtensionPrompt(mockContext, settings);
      }).not.toThrow();
    });
  });
});
