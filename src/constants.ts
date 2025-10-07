/**
 * Constants Module
 * Centralized configuration values, defaults, and validation ranges
 *
 * This module provides a single source of truth for all settings-related
 * constants to avoid magic numbers scattered throughout the codebase.
 */

/**
 * Extension identifier used for settings storage
 */
export const EXTENSION_NAME = 'auto_illustrator';

/**
 * Word interval configuration
 * Controls approximately how many words should appear between image prompts
 */
export const WORD_INTERVAL = {
  DEFAULT: 250,
  MIN: 50,
  MAX: 1000,
  STEP: 50,
} as const;

/**
 * Streaming poll interval configuration (milliseconds)
 * Controls how frequently the extension checks for new prompts during streaming
 */
export const STREAMING_POLL_INTERVAL = {
  DEFAULT: 300,
  MIN: 100,
  MAX: 1000,
  STEP: 50,
} as const;

/**
 * Max concurrent generations configuration
 * Controls how many images can be generated simultaneously
 */
export const MAX_CONCURRENT_GENERATIONS = {
  DEFAULT: 1,
  MIN: 1,
  MAX: 5,
  STEP: 1,
} as const;

/**
 * Log level options
 */
export const LOG_LEVELS = {
  TRACE: 'trace',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  SILENT: 'silent',
} as const;

/**
 * Default log level
 */
export const DEFAULT_LOG_LEVEL = LOG_LEVELS.INFO;

/**
 * Preset ID constants
 */
export const PRESET_IDS = {
  DEFAULT: 'default',
  NAI_45_FULL: 'nai-4.5-full',
} as const;

/**
 * Manual generation mode configuration
 * Controls whether to replace existing images or append new ones
 */
export const MANUAL_GENERATION_MODE = {
  REPLACE: 'replace',
  APPEND: 'append',
  DEFAULT: 'replace',
} as const;

/**
 * Default settings for the extension
 * These values are used when no saved settings exist or when resetting
 */
export const DEFAULT_SETTINGS = {
  enabled: true,
  streamingEnabled: true,
  wordInterval: WORD_INTERVAL.DEFAULT,
  streamingPollInterval: STREAMING_POLL_INTERVAL.DEFAULT,
  maxConcurrentGenerations: MAX_CONCURRENT_GENERATIONS.DEFAULT,
  logLevel: DEFAULT_LOG_LEVEL,
  currentPresetId: PRESET_IDS.DEFAULT,
  customPresets: [] as MetaPromptPreset[],
  manualGenerationMode: MANUAL_GENERATION_MODE.DEFAULT,
};

/**
 * UI element IDs for settings controls
 */
export const UI_ELEMENT_IDS = {
  ENABLED: 'auto_illustrator_enabled',
  WORD_INTERVAL: 'auto_illustrator_word_interval',
  META_PROMPT: 'auto_illustrator_meta_prompt',
  META_PROMPT_PRESET_SELECT: 'auto_illustrator_preset_select',
  META_PROMPT_PRESET_EDIT: 'auto_illustrator_preset_edit',
  META_PROMPT_PRESET_SAVE: 'auto_illustrator_preset_save',
  META_PROMPT_PRESET_SAVE_AS: 'auto_illustrator_preset_save_as',
  META_PROMPT_PRESET_DELETE: 'auto_illustrator_preset_delete',
  META_PROMPT_PRESET_CANCEL: 'auto_illustrator_preset_cancel',
  PRESET_EDITOR: 'auto_illustrator_preset_editor',
  PRESET_VIEWER: 'auto_illustrator_preset_viewer',
  PRESET_PREVIEW: 'auto_illustrator_preset_preview',
  STREAMING_ENABLED: 'auto_illustrator_streaming_enabled',
  STREAMING_POLL_INTERVAL: 'auto_illustrator_streaming_poll_interval',
  MAX_CONCURRENT: 'auto_illustrator_max_concurrent',
  LOG_LEVEL: 'auto_illustrator_log_level',
  MANUAL_GEN_MODE: 'auto_illustrator_manual_gen_mode',
  RESET_BUTTON: 'auto_illustrator_reset',
} as const;
