/**
 * Settings Module
 * Handles loading, saving, and managing extension settings
 */

import {getDefaultMetaPrompt} from './prompt_injector';

export const EXTENSION_NAME = 'auto_illustrator';

/**
 * Gets the default settings for the extension
 * @returns Default settings
 */
export function getDefaultSettings(): AutoIllustratorSettings {
  return {
    enabled: true,
    wordInterval: 250,
    metaPrompt: getDefaultMetaPrompt(250),
    streamingEnabled: true,
    streamingPollInterval: 300,
    maxConcurrentGenerations: 1,
  };
}

/**
 * Loads settings from SillyTavern context
 * @param context - SillyTavern context
 * @returns Loaded settings merged with defaults
 */
export function loadSettings(
  context: SillyTavernContext
): AutoIllustratorSettings {
  const defaults = getDefaultSettings();
  const saved = context.extensionSettings[EXTENSION_NAME];

  if (!saved) {
    return defaults;
  }

  // Merge saved settings with defaults to handle missing fields
  return {
    ...defaults,
    ...saved,
  };
}

/**
 * Saves settings to SillyTavern context
 * @param settings - Settings to save
 * @param context - SillyTavern context
 */
export function saveSettings(
  settings: AutoIllustratorSettings,
  context: SillyTavernContext
): void {
  context.extensionSettings[EXTENSION_NAME] = settings;
  context.saveSettingsDebounced();
}

/**
 * Creates the settings UI HTML
 * @returns HTML string for settings panel
 */
export function createSettingsUI(): string {
  return `
    <div class="auto-illustrator-settings">
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>Auto Illustrator</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <label class="checkbox_label" for="auto_illustrator_enabled">
              <input id="auto_illustrator_enabled" type="checkbox" />
              <span>Enable Auto Illustrator</span>
            </label>
            <div id="auto_illustrator_reset" class="menu_button menu_button_icon">
              <i class="fa-solid fa-undo"></i>
              <span>Reset to Defaults</span>
            </div>
          </div>

          <label for="auto_illustrator_word_interval">
            <span>Word Interval (approx. words between images)</span>
            <input id="auto_illustrator_word_interval" class="text_pole" type="number" min="50" max="1000" step="50" />
          </label>

          <label for="auto_illustrator_meta_prompt">
            <span>Meta Prompt Template</span>
            <small>Instructions sent to the LLM for generating image prompts</small>
            <textarea id="auto_illustrator_meta_prompt" class="text_pole textarea_compact" rows="10"></textarea>
          </label>

          <hr>

          <label class="checkbox_label" for="auto_illustrator_streaming_enabled">
            <input id="auto_illustrator_streaming_enabled" type="checkbox" />
            <span>Enable Streaming Image Generation</span>
            <small>Generate images as streaming text arrives (faster perceived latency)</small>
          </label>

          <label for="auto_illustrator_streaming_poll_interval">
            <span>Streaming Poll Interval (ms)</span>
            <small>How often to check for new prompts during streaming (lower = faster detection, more CPU)</small>
            <input id="auto_illustrator_streaming_poll_interval" class="text_pole" type="number" min="100" max="1000" step="50" />
          </label>

          <label for="auto_illustrator_max_concurrent">
            <span>Max Concurrent Generations</span>
            <small>Maximum number of images to generate simultaneously (1 recommended for rate limiting)</small>
            <input id="auto_illustrator_max_concurrent" class="text_pole" type="number" min="1" max="5" step="1" />
          </label>
        </div>
      </div>
    </div>
  `.trim();
}
