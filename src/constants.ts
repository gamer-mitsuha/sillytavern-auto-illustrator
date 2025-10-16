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
  DEFAULT: 'append',
} as const;

/**
 * Minimum generation interval configuration (milliseconds)
 * Enforces a minimum time delay between consecutive image generation requests
 * to prevent rate limiting or overwhelming the image generation API
 */
export const MIN_GENERATION_INTERVAL = {
  DEFAULT: 0,
  MIN: 0,
  MAX: 10000,
  STEP: 100,
} as const;

/**
 * Prompt generation mode configuration
 * Controls how image prompts are generated
 */
export const PROMPT_GENERATION_MODE = {
  REGEX: 'regex', // AI embeds prompts in response (default)
  LLM_POST: 'llm-post', // Separate LLM call after response (experimental)
  DEFAULT: 'regex',
} as const;

/**
 * Max prompts per message configuration
 * Controls cost when using LLM-based prompt generation
 */
export const MAX_PROMPTS_PER_MESSAGE = {
  DEFAULT: 5,
  MIN: 1,
  MAX: 10,
  STEP: 1,
} as const;

/**
 * Default prompt detection patterns
 * Supports multiple tag formats for backward compatibility:
 * - HTML comment format (primary, invisible, passes through DOMPurify)
 * - Underscore format (legacy, from old chats)
 */
export const DEFAULT_PROMPT_DETECTION_PATTERNS = [
  '<!--img-prompt="([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"\\s*-->',
  '<img_prompt="([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"\\s*>',
];

/**
 * Default settings for the extension
 * These values are used when no saved settings exist or when resetting
 */
export const DEFAULT_SETTINGS = {
  enabled: true,
  streamingEnabled: true,
  streamingPollInterval: STREAMING_POLL_INTERVAL.DEFAULT,
  monitorPollingInterval: STREAMING_POLL_INTERVAL.DEFAULT,
  maxConcurrentGenerations: MAX_CONCURRENT_GENERATIONS.DEFAULT,
  minGenerationInterval: MIN_GENERATION_INTERVAL.DEFAULT,
  logLevel: DEFAULT_LOG_LEVEL,
  currentPresetId: PRESET_IDS.DEFAULT,
  customPresets: [] as MetaPromptPreset[],
  manualGenerationMode: MANUAL_GENERATION_MODE.DEFAULT,
  promptDetectionPatterns: DEFAULT_PROMPT_DETECTION_PATTERNS,
  commonStyleTags: '',
  commonStyleTagsPosition: 'prefix' as const,
  showGalleryWidget: true,
  showProgressWidget: true,
  enableClickToRegenerate: true,
  promptGenerationMode: PROMPT_GENERATION_MODE.DEFAULT,
  maxPromptsPerMessage: MAX_PROMPTS_PER_MESSAGE.DEFAULT,
};

/**
 * UI element IDs for settings controls
 */
export const UI_ELEMENT_IDS = {
  ENABLED: 'auto_illustrator_enabled',
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
  MIN_GENERATION_INTERVAL: 'auto_illustrator_min_generation_interval',
  LOG_LEVEL: 'auto_illustrator_log_level',
  MANUAL_GEN_MODE: 'auto_illustrator_manual_gen_mode',
  PROMPT_PATTERNS: 'auto_illustrator_prompt_patterns',
  PROMPT_PATTERNS_RESET: 'auto_illustrator_prompt_patterns_reset',
  PATTERN_VALIDATION_STATUS: 'auto_illustrator_pattern_validation_status',
  COMMON_STYLE_TAGS: 'auto_illustrator_common_style_tags',
  COMMON_STYLE_TAGS_POSITION: 'auto_illustrator_common_style_tags_position',
  SHOW_GALLERY_WIDGET: 'auto_illustrator_show_gallery_widget',
  SHOW_PROGRESS_WIDGET: 'auto_illustrator_show_progress_widget',
  PROMPT_GENERATION_MODE_REGEX: 'auto_illustrator_prompt_gen_mode_regex',
  PROMPT_GENERATION_MODE_LLM: 'auto_illustrator_prompt_gen_mode_llm',
  MAX_PROMPTS_PER_MESSAGE: 'auto_illustrator_max_prompts_per_message',
  RESET_BUTTON: 'auto_illustrator_reset',
} as const;
