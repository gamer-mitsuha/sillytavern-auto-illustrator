/**
 * Settings Module
 * Handles loading, saving, and managing extension settings
 */

import {getDefaultMetaPrompt} from './prompt_injector';
import {
  EXTENSION_NAME,
  DEFAULT_SETTINGS,
  WORD_INTERVAL,
  STREAMING_POLL_INTERVAL,
  MAX_CONCURRENT_GENERATIONS,
  UI_ELEMENT_IDS,
} from './constants';

export {EXTENSION_NAME};

/**
 * Gets the default settings for the extension
 * @returns Default settings
 */
export function getDefaultSettings(): AutoIllustratorSettings {
  return {
    ...DEFAULT_SETTINGS,
    metaPrompt: getDefaultMetaPrompt(WORD_INTERVAL.DEFAULT),
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
            <label class="checkbox_label" for="${UI_ELEMENT_IDS.ENABLED}">
              <input id="${UI_ELEMENT_IDS.ENABLED}" type="checkbox" />
              <span>Enable Auto Illustrator</span>
            </label>
            <div id="${UI_ELEMENT_IDS.RESET_BUTTON}" class="menu_button menu_button_icon">
              <i class="fa-solid fa-undo"></i>
              <span>Reset to Defaults</span>
            </div>
          </div>

          <label for="${UI_ELEMENT_IDS.WORD_INTERVAL}">
            <span>Word Interval (approx. words between images)</span>
            <input id="${UI_ELEMENT_IDS.WORD_INTERVAL}" class="text_pole" type="number" min="${WORD_INTERVAL.MIN}" max="${WORD_INTERVAL.MAX}" step="${WORD_INTERVAL.STEP}" />
          </label>

          <label for="${UI_ELEMENT_IDS.META_PROMPT}">
            <span>Meta Prompt Template</span>
            <small>Instructions sent to the LLM for generating image prompts</small>
            <textarea id="${UI_ELEMENT_IDS.META_PROMPT}" class="text_pole textarea_compact" rows="10"></textarea>
          </label>

          <hr>

          <label class="checkbox_label" for="${UI_ELEMENT_IDS.STREAMING_ENABLED}">
            <input id="${UI_ELEMENT_IDS.STREAMING_ENABLED}" type="checkbox" />
            <span>Enable Streaming Image Generation</span>
            <small>Generate images as streaming text arrives (faster perceived latency)</small>
          </label>

          <label for="${UI_ELEMENT_IDS.STREAMING_POLL_INTERVAL}">
            <span>Streaming Poll Interval (ms)</span>
            <small>How often to check for new prompts during streaming (lower = faster detection, more CPU)</small>
            <input id="${UI_ELEMENT_IDS.STREAMING_POLL_INTERVAL}" class="text_pole" type="number" min="${STREAMING_POLL_INTERVAL.MIN}" max="${STREAMING_POLL_INTERVAL.MAX}" step="${STREAMING_POLL_INTERVAL.STEP}" />
          </label>

          <label for="${UI_ELEMENT_IDS.MAX_CONCURRENT}">
            <span>Max Concurrent Generations</span>
            <small>Maximum number of images to generate simultaneously (1 recommended for rate limiting)</small>
            <input id="${UI_ELEMENT_IDS.MAX_CONCURRENT}" class="text_pole" type="number" min="${MAX_CONCURRENT_GENERATIONS.MIN}" max="${MAX_CONCURRENT_GENERATIONS.MAX}" step="${MAX_CONCURRENT_GENERATIONS.STEP}" />
          </label>

          <label for="${UI_ELEMENT_IDS.LOG_LEVEL}">
            <span>Log Level</span>
            <small>Controls logging verbosity (DEBUG shows detailed monitoring, INFO shows key events, WARN/ERROR minimal)</small>
            <select id="${UI_ELEMENT_IDS.LOG_LEVEL}" class="text_pole">
              <option value="trace">TRACE (Most Verbose)</option>
              <option value="debug">DEBUG</option>
              <option value="info">INFO (Default)</option>
              <option value="warn">WARN</option>
              <option value="error">ERROR</option>
              <option value="silent">SILENT (No Logs)</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  `.trim();
}
