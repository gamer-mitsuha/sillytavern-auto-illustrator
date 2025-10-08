import {describe, it, expect, beforeEach, vi} from 'vitest';
import {createMockContext} from './test_helpers';
import {
  getDefaultSettings,
  loadSettings,
  saveSettings,
  EXTENSION_NAME,
} from './settings';

describe('settings', () => {
  describe('getDefaultSettings', () => {
    it('should return default settings with correct values', () => {
      const defaults = getDefaultSettings();

      expect(defaults.enabled).toBe(true);
      expect(defaults.metaPrompt).toBeTruthy();
      expect(typeof defaults.metaPrompt).toBe('string');
      expect(defaults.currentPresetId).toBe('default');
      expect(Array.isArray(defaults.customPresets)).toBe(true);
      expect(defaults.customPresets).toEqual([]);
    });
  });

  describe('loadSettings', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should load existing settings from context', () => {
      const existingSettings: AutoIllustratorSettings = {
        enabled: false,
        metaPrompt: 'custom prompt',
        currentPresetId: 'custom-123',
        customPresets: [],
        streamingEnabled: false,
        streamingPollInterval: 500,
        maxConcurrentGenerations: 2,
        logLevel: 'debug',
        manualGenerationMode: 'append',
      };

      const mockContext = createMockContext({
        extensionSettings: {
          [EXTENSION_NAME]: existingSettings,
        },
      });

      const loaded = loadSettings(mockContext);

      expect(loaded.enabled).toEqual(existingSettings.enabled);
      expect(loaded.currentPresetId).toEqual(existingSettings.currentPresetId);
      expect(loaded.customPresets).toEqual(existingSettings.customPresets);
    });

    it('should return defaults if no settings exist', () => {
      const mockContext = createMockContext({
        extensionSettings: {},
      });

      const loaded = loadSettings(mockContext);

      expect(loaded.enabled).toBe(true);
      expect(loaded.metaPrompt).toBeTruthy();
    });

    it('should merge partial settings with defaults', () => {
      const partialSettings = {
        enabled: false,
      };

      const mockContext = createMockContext({
        extensionSettings: {
          [EXTENSION_NAME]: partialSettings,
        },
      });

      const loaded = loadSettings(mockContext);

      expect(loaded.enabled).toBe(false);
      expect(loaded.metaPrompt).toBeTruthy(); // Should use default
      expect(loaded.streamingEnabled).toBe(true); // Should use default
    });
  });

  describe('saveSettings', () => {
    it('should save settings to context and call saveSettingsDebounced', () => {
      const mockSaveDebounced = vi.fn();
      const mockContext = createMockContext({
        extensionSettings: {},
        saveSettingsDebounced: mockSaveDebounced,
      });

      const settings: AutoIllustratorSettings = {
        enabled: true,
        metaPrompt: 'test prompt',
        currentPresetId: 'default',
        customPresets: [],
        streamingEnabled: true,
        streamingPollInterval: 300,
        maxConcurrentGenerations: 1,
        logLevel: 'info',
        manualGenerationMode: 'replace',
      };

      saveSettings(settings, mockContext);

      expect(mockContext.extensionSettings[EXTENSION_NAME]).toEqual(settings);
      expect(mockSaveDebounced).toHaveBeenCalled();
    });

    it('should update existing settings', () => {
      const mockSaveDebounced = vi.fn();
      const mockContext = createMockContext({
        extensionSettings: {
          [EXTENSION_NAME]: {
            enabled: true,
            metaPrompt: 'old',
          },
        },
        saveSettingsDebounced: mockSaveDebounced,
      });

      const newSettings: AutoIllustratorSettings = {
        enabled: false,
        metaPrompt: 'new',
        currentPresetId: 'custom-456',
        customPresets: [],
        streamingEnabled: false,
        streamingPollInterval: 500,
        maxConcurrentGenerations: 2,
        logLevel: 'warn',
        manualGenerationMode: 'append',
      };

      saveSettings(newSettings, mockContext);

      expect(mockContext.extensionSettings[EXTENSION_NAME]).toEqual(
        newSettings
      );
      expect(mockSaveDebounced).toHaveBeenCalled();
    });
  });
});
