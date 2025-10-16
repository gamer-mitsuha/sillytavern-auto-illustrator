/**
 * Constants Module
 * Centralized configuration values, defaults, and validation ranges
 *
 * This module provides a single source of truth for all settings-related
 * constants to avoid magic numbers scattered throughout the codebase.
 */

import promptWritingGuidelinesSfw from './presets/prompt_writing_guidelines.md';

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
  SHARED_API: 'shared-api', // AI embeds prompts in main response (default)
  INDEPENDENT_API: 'independent-api', // Separate API call after response (experimental)
  // Legacy aliases for backward compatibility
  REGEX: 'shared-api',
  LLM_POST: 'independent-api',
  DEFAULT: 'shared-api',
} as const;

/**
 * Max prompts per message configuration
 * Controls cost when using LLM-based prompt generation
 */
export const MAX_PROMPTS_PER_MESSAGE = {
  DEFAULT: 5,
  MIN: 1,
  MAX: 30,
  STEP: 1,
} as const;

/**
 * Context message count configuration
 * Controls how many previous messages are included as context for LLM prompt generation
 */
export const CONTEXT_MESSAGE_COUNT = {
  DEFAULT: 10,
  MIN: 0,
  MAX: 50,
  STEP: 1,
} as const;

/**
 * Meta prompt depth configuration
 * Controls where the meta prompt is inserted in chat history for shared API mode
 * depth=0: last message (default), depth=1: one before last, etc.
 */
export const META_PROMPT_DEPTH = {
  DEFAULT: 0,
  MIN: 0,
  MAX: 20,
  STEP: 1,
} as const;

/**
 * Default frequency guidelines for LLM prompt generation
 * Tells the LLM when to generate image prompts
 */
export const DEFAULT_LLM_FREQUENCY_GUIDELINES = `Find 0-5 key visual moments in the message that are worth illustrating
   - Aim for approximately one prompt every 250 words or at major scene changes
   - Focus on scenes with clear visual descriptions
   - Prioritize major scene transitions, character introductions, or significant moments
   - Skip if the message has no visual content (pure dialogue, abstract concepts)`;

/**
 * Default prompt writing guidelines for LLM prompt generation
 * Tells the LLM how to structure image generation prompts
 * Loaded from: src/presets/prompt_writing_guidelines.md
 */
export const DEFAULT_LLM_PROMPT_WRITING_GUIDELINES = promptWritingGuidelinesSfw;
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
  metaPromptDepth: META_PROMPT_DEPTH.DEFAULT,
  maxPromptsPerMessage: MAX_PROMPTS_PER_MESSAGE.DEFAULT,
  contextMessageCount: CONTEXT_MESSAGE_COUNT.DEFAULT,
  llmFrequencyGuidelines: DEFAULT_LLM_FREQUENCY_GUIDELINES,
  llmPromptWritingGuidelines: DEFAULT_LLM_PROMPT_WRITING_GUIDELINES,
};

/**
 * UI element IDs for settings controls
 */
export const UI_ELEMENT_IDS = {
  ENABLED: 'auto_illustrator_enabled',
  META_PROMPT: 'auto_illustrator_meta_prompt',
  META_PROMPT_DEPTH: 'auto_illustrator_meta_prompt_depth',
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
  PROMPT_GENERATION_MODE_SHARED: 'auto_illustrator_prompt_gen_mode_shared',
  PROMPT_GENERATION_MODE_INDEPENDENT:
    'auto_illustrator_prompt_gen_mode_independent',
  INDEPENDENT_API_SETTINGS_CONTAINER:
    'auto_illustrator_independent_api_settings_container',
  MAX_PROMPTS_PER_MESSAGE: 'auto_illustrator_max_prompts_per_message',
  CONTEXT_MESSAGE_COUNT: 'auto_illustrator_context_message_count',
  LLM_FREQUENCY_GUIDELINES: 'auto_illustrator_llm_frequency_guidelines',
  LLM_FREQUENCY_GUIDELINES_RESET:
    'auto_illustrator_llm_frequency_guidelines_reset',
  LLM_PROMPT_WRITING_GUIDELINES:
    'auto_illustrator_llm_prompt_writing_guidelines',
  LLM_PROMPT_WRITING_GUIDELINES_RESET:
    'auto_illustrator_llm_prompt_writing_guidelines_reset',
  RESET_BUTTON: 'auto_illustrator_reset',
} as const;
