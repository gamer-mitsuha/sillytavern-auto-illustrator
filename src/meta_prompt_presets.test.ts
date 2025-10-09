import {describe, it, expect} from 'vitest';
import {
  getPredefinedPresets,
  getPredefinedPresetById,
  getPresetById,
  isPresetPredefined,
  isPredefinedPresetName,
  getDefaultMetaPrompt,
  PRESET_IDS,
} from './meta_prompt_presets';

describe('meta_prompt_presets', () => {
  describe('getPredefinedPresets', () => {
    it('should return array of predefined presets', () => {
      const presets = getPredefinedPresets();
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBe(2);
    });

    it('should include default and NAI 4.5 Full presets', () => {
      const presets = getPredefinedPresets();
      const ids = presets.map(p => p.id);
      expect(ids).toContain('default');
      expect(ids).toContain('nai-4.5-full');
    });

    it('should have all required fields for each preset', () => {
      const presets = getPredefinedPresets();
      presets.forEach(preset => {
        expect(preset).toHaveProperty('id');
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('template');
        expect(preset).toHaveProperty('predefined');
        expect(preset.predefined).toBe(true);
        expect(typeof preset.id).toBe('string');
        expect(typeof preset.name).toBe('string');
        expect(typeof preset.template).toBe('string');
        expect(preset.template.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getPredefinedPresetById', () => {
    it('should return default preset by ID', () => {
      const preset = getPredefinedPresetById('default');
      expect(preset).toBeDefined();
      expect(preset?.id).toBe('default');
      expect(preset?.name).toBe('Default');
      expect(preset?.predefined).toBe(true);
    });

    it('should return NAI 4.5 Full preset by ID', () => {
      const preset = getPredefinedPresetById('nai-4.5-full');
      expect(preset).toBeDefined();
      expect(preset?.id).toBe('nai-4.5-full');
      expect(preset?.name).toBe('NAI 4.5 Full');
      expect(preset?.predefined).toBe(true);
    });

    it('should return undefined for non-existent preset', () => {
      const preset = getPredefinedPresetById('non-existent');
      expect(preset).toBeUndefined();
    });
  });

  describe('getPresetById', () => {
    it('should return predefined preset when custom presets is empty', () => {
      const preset = getPresetById('default', []);
      expect(preset.id).toBe('default');
      expect(preset.name).toBe('Default');
      expect(preset.predefined).toBe(true);
    });

    it('should return custom preset when it exists', () => {
      const customPresets = [
        {
          id: 'custom-123',
          name: 'My Custom',
          template: 'Custom template',
          predefined: false,
        },
      ];
      const preset = getPresetById('custom-123', customPresets);
      expect(preset.id).toBe('custom-123');
      expect(preset.name).toBe('My Custom');
      expect(preset.predefined).toBe(false);
    });

    it('should prioritize custom preset over predefined with same ID', () => {
      const customPresets = [
        {
          id: 'custom-default',
          name: 'Custom Default',
          template: 'Custom template',
          predefined: false,
        },
      ];
      const preset = getPresetById('custom-default', customPresets);
      expect(preset.name).toBe('Custom Default');
      expect(preset.predefined).toBe(false);
    });

    it('should return default preset as fallback for non-existent ID', () => {
      const preset = getPresetById('non-existent', []);
      expect(preset.id).toBe('default');
      expect(preset.name).toBe('Default');
    });
  });

  describe('isPresetPredefined', () => {
    it('should return true for default preset ID', () => {
      expect(isPresetPredefined('default')).toBe(true);
    });

    it('should return true for NAI 4.5 Full preset ID', () => {
      expect(isPresetPredefined('nai-4.5-full')).toBe(true);
    });

    it('should return false for custom preset ID', () => {
      expect(isPresetPredefined('custom-123')).toBe(false);
    });

    it('should return false for non-existent ID', () => {
      expect(isPresetPredefined('non-existent')).toBe(false);
    });
  });

  describe('isPredefinedPresetName', () => {
    it('should return true for "Default" (case-sensitive)', () => {
      expect(isPredefinedPresetName('Default')).toBe(true);
    });

    it('should return true for "default" (case-insensitive)', () => {
      expect(isPredefinedPresetName('default')).toBe(true);
    });

    it('should return true for "DEFAULT" (case-insensitive)', () => {
      expect(isPredefinedPresetName('DEFAULT')).toBe(true);
    });

    it('should return true for "NAI 4.5 Full" (case-sensitive)', () => {
      expect(isPredefinedPresetName('NAI 4.5 Full')).toBe(true);
    });

    it('should return true for "nai 4.5 full" (case-insensitive)', () => {
      expect(isPredefinedPresetName('nai 4.5 full')).toBe(true);
    });

    it('should return false for custom preset name', () => {
      expect(isPredefinedPresetName('My Custom Preset')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isPredefinedPresetName('')).toBe(false);
    });
  });

  describe('getDefaultMetaPrompt', () => {
    it('should return default meta prompt', () => {
      const prompt = getDefaultMetaPrompt();
      expect(prompt).toContain('250');
      expect(prompt).toContain('<!--img-prompt="');
      expect(prompt).toContain('-->');
    });

    it('should contain expected formatting rules', () => {
      const prompt = getDefaultMetaPrompt();
      expect(prompt).toContain('Universal Image Prompt Generation Guide');
      expect(prompt).toContain('Tag-Based Format');
      expect(prompt).toContain('<!--img-prompt=');
    });
  });

  describe('preset content validation', () => {
    it('default preset should contain word interval placeholder', () => {
      const preset = getPredefinedPresetById('default');
      expect(preset?.template).toContain('250');
      expect(preset?.template).toContain('words');
    });

    it('NAI 4.5 Full preset should contain NAI-specific content', () => {
      const preset = getPredefinedPresetById('nai-4.5-full');
      expect(preset?.template).toContain('NovelAI Diffusion 4.5');
      expect(preset?.template).toContain('NovelAI 4.5 FULL');
      expect(preset?.template).toContain('Danbooru');
    });

    it('NAI 4.5 Full preset should have example prompts', () => {
      const preset = getPredefinedPresetById('nai-4.5-full');
      expect(preset?.template).toContain('Example Prompts');
      expect(preset?.template).toContain('<!--img-prompt=');
    });
  });

  describe('PRESET_IDS constants', () => {
    it('should export DEFAULT preset ID', () => {
      expect(PRESET_IDS.DEFAULT).toBe('default');
    });

    it('should export NAI_45_FULL preset ID', () => {
      expect(PRESET_IDS.NAI_45_FULL).toBe('nai-4.5-full');
    });
  });
});
