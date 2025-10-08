/**
 * Meta Prompt Presets Module
 * Manages predefined and custom meta prompt presets
 */

import defaultTemplate from './presets/default.md';
import nai45FullTemplate from './presets/nai-4.5-full.md';

/**
 * Meta prompt preset interface
 */
export interface MetaPromptPreset {
  id: string;
  name: string;
  template: string;
  predefined: boolean;
}

/**
 * Predefined preset IDs
 */
export const PRESET_IDS = {
  DEFAULT: 'default',
  NAI_45_FULL: 'nai-4.5-full',
} as const;

/**
 * Gets the default meta prompt template
 * @returns The default meta prompt string
 */
function getDefaultTemplate(): string {
  return defaultTemplate.trim();
}

/**
 * Gets the NAI 4.5 Full meta prompt template
 * @returns The NAI 4.5 Full meta prompt string
 */
function getNai45FullTemplate(): string {
  return nai45FullTemplate.trim();
}

/**
 * Predefined presets array
 */
const PREDEFINED_PRESETS: MetaPromptPreset[] = [
  {
    id: PRESET_IDS.DEFAULT,
    name: 'Default',
    template: getDefaultTemplate(),
    predefined: true,
  },
  {
    id: PRESET_IDS.NAI_45_FULL,
    name: 'NAI 4.5 Full',
    template: getNai45FullTemplate(),
    predefined: true,
  },
];

/**
 * Gets all predefined presets
 * @returns Array of predefined presets
 */
export function getPredefinedPresets(): MetaPromptPreset[] {
  return PREDEFINED_PRESETS;
}

/**
 * Gets a predefined preset by ID
 * @param id - Preset ID
 * @returns Predefined preset or undefined if not found
 */
export function getPredefinedPresetById(
  id: string
): MetaPromptPreset | undefined {
  return PREDEFINED_PRESETS.find(preset => preset.id === id);
}

/**
 * Gets a preset by ID, checking both custom and predefined presets
 * @param id - Preset ID
 * @param customPresets - Array of custom presets
 * @returns Preset object, or default preset if not found
 */
export function getPresetById(
  id: string,
  customPresets: MetaPromptPreset[]
): MetaPromptPreset {
  // Check custom presets first
  const customPreset = customPresets.find(preset => preset.id === id);
  if (customPreset) {
    return customPreset;
  }

  // Check predefined presets
  const predefinedPreset = getPredefinedPresetById(id);
  if (predefinedPreset) {
    return predefinedPreset;
  }

  // Return default preset as fallback
  return PREDEFINED_PRESETS[0];
}

/**
 * Checks if a preset ID is predefined
 * @param id - Preset ID to check
 * @returns True if preset is predefined
 */
export function isPresetPredefined(id: string): boolean {
  return PREDEFINED_PRESETS.some(preset => preset.id === id);
}

/**
 * Checks if a preset name belongs to a predefined preset (case-insensitive)
 * @param name - Preset name to check
 * @returns True if name is a predefined preset name
 */
export function isPredefinedPresetName(name: string): boolean {
  const lowerName = name.toLowerCase();
  return PREDEFINED_PRESETS.some(
    preset => preset.name.toLowerCase() === lowerName
  );
}

/**
 * Gets the default meta prompt template (for backwards compatibility)
 * @returns The default meta prompt string
 */
export function getDefaultMetaPrompt(): string {
  return getDefaultTemplate();
}
