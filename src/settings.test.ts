import {describe, it, expect, beforeEach, vi} from 'vitest';
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
      expect(defaults.wordInterval).toBe(250);
      expect(defaults.metaPrompt).toBeTruthy();
      expect(typeof defaults.metaPrompt).toBe('string');
    });
  });

  describe('loadSettings', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should load existing settings from context', () => {
      const existingSettings: AutoIllustratorSettings = {
        enabled: false,
        wordInterval: 500,
        metaPrompt: 'custom prompt',
      };

      const mockContext = {
        extensionSettings: {
          [EXTENSION_NAME]: existingSettings,
        },
      };

      const loaded = loadSettings(mockContext);

      expect(loaded).toEqual(existingSettings);
    });

    it('should return defaults if no settings exist', () => {
      const mockContext = {
        extensionSettings: {},
      };

      const loaded = loadSettings(mockContext);

      expect(loaded.enabled).toBe(true);
      expect(loaded.wordInterval).toBe(250);
    });

    it('should merge partial settings with defaults', () => {
      const partialSettings = {
        enabled: false,
      };

      const mockContext = {
        extensionSettings: {
          [EXTENSION_NAME]: partialSettings,
        },
      };

      const loaded = loadSettings(mockContext);

      expect(loaded.enabled).toBe(false);
      expect(loaded.wordInterval).toBe(250); // Should use default
      expect(loaded.metaPrompt).toBeTruthy(); // Should use default
    });
  });

  describe('saveSettings', () => {
    it('should save settings to context and call saveSettingsDebounced', () => {
      const mockSaveDebounced = vi.fn();
      const mockContext = {
        extensionSettings: {},
        saveSettingsDebounced: mockSaveDebounced,
      };

      const settings: AutoIllustratorSettings = {
        enabled: true,
        wordInterval: 300,
        metaPrompt: 'test prompt',
      };

      saveSettings(settings, mockContext);

      expect(mockContext.extensionSettings[EXTENSION_NAME]).toEqual(settings);
      expect(mockSaveDebounced).toHaveBeenCalled();
    });

    it('should update existing settings', () => {
      const mockSaveDebounced = vi.fn();
      const mockContext = {
        extensionSettings: {
          [EXTENSION_NAME]: {
            enabled: true,
            wordInterval: 250,
            metaPrompt: 'old',
          },
        },
        saveSettingsDebounced: mockSaveDebounced,
      };

      const newSettings: AutoIllustratorSettings = {
        enabled: false,
        wordInterval: 400,
        metaPrompt: 'new',
      };

      saveSettings(newSettings, mockContext);

      expect(mockContext.extensionSettings[EXTENSION_NAME]).toEqual(
        newSettings
      );
      expect(mockSaveDebounced).toHaveBeenCalled();
    });
  });
});
