/**
 * Settings Module
 * Handles loading, saving, and managing extension settings
 */

import {getDefaultMetaPrompt, getPresetById} from './meta_prompt_presets';
import {
  EXTENSION_NAME,
  DEFAULT_SETTINGS,
  STREAMING_POLL_INTERVAL,
  MAX_CONCURRENT_GENERATIONS,
  MIN_GENERATION_INTERVAL,
  MAX_PROMPTS_PER_MESSAGE,
  CONTEXT_MESSAGE_COUNT,
  META_PROMPT_DEPTH,
  UI_ELEMENT_IDS,
} from './constants';
import {t} from './i18n';

export {EXTENSION_NAME};

/**
 * Gets the default settings for the extension
 * @returns Default settings
 */
export function getDefaultSettings(): AutoIllustratorSettings {
  return {
    ...DEFAULT_SETTINGS,
    metaPrompt: getDefaultMetaPrompt(),
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
  const merged = {
    ...defaults,
    ...saved,
  };

  // Load preset content for current preset ID
  const preset = getPresetById(
    merged.currentPresetId,
    merged.customPresets || []
  );
  merged.metaPrompt = preset.template;

  return merged;
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
          <b>${t('extensionName')}</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <label class="checkbox_label" for="${UI_ELEMENT_IDS.ENABLED}">
              <input id="${UI_ELEMENT_IDS.ENABLED}" type="checkbox" />
              <span>${t('settings.enable')}</span>
            </label>
            <div id="${UI_ELEMENT_IDS.RESET_BUTTON}" class="menu_button menu_button_icon">
              <i class="fa-solid fa-undo"></i>
              <span>${t('settings.resetDefaults')}</span>
            </div>
          </div>

          <div class="preset-management">
            <label>${t('settings.metaPromptPreset')}</label>
            <div class="preset-toolbar">
              <select id="${UI_ELEMENT_IDS.META_PROMPT_PRESET_SELECT}" class="text_pole flex_fill">
                <optgroup label="${t('settings.predefinedPresets')}">
                  <option value="default">Default</option>
                  <option value="nai-4.5-full">NAI 4.5 Full</option>
                </optgroup>
                <optgroup label="${t('settings.customPresets')}" id="custom_presets_group">
                  <!-- populated by JavaScript -->
                </optgroup>
              </select>
              <button id="${UI_ELEMENT_IDS.META_PROMPT_PRESET_EDIT}" class="menu_button menu_button_icon" title="${t('settings.editPreset')}">
                <i class="fa-solid fa-edit"></i>
              </button>
              <button id="${UI_ELEMENT_IDS.META_PROMPT_PRESET_DELETE}" class="menu_button menu_button_icon" title="${t('settings.deletePreset')}">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>

            <div id="${UI_ELEMENT_IDS.PRESET_EDITOR}" style="display:none">
              <label for="${UI_ELEMENT_IDS.META_PROMPT}">
                <span>${t('settings.metaPromptTemplate')}</span>
                <small>${t('settings.editingPresetHint')}</small>
                <textarea id="${UI_ELEMENT_IDS.META_PROMPT}" class="text_pole textarea_compact" rows="10" readonly></textarea>
              </label>
              <div class="preset-edit-actions">
                <button id="${UI_ELEMENT_IDS.META_PROMPT_PRESET_SAVE}" class="menu_button">
                  <i class="fa-solid fa-save"></i> ${t('settings.save')}
                </button>
                <button id="${UI_ELEMENT_IDS.META_PROMPT_PRESET_SAVE_AS}" class="menu_button">
                  <i class="fa-solid fa-copy"></i> ${t('settings.saveAs')}
                </button>
                <button id="${UI_ELEMENT_IDS.META_PROMPT_PRESET_CANCEL}" class="menu_button">
                  <i class="fa-solid fa-times"></i> ${t('settings.cancel')}
                </button>
              </div>
            </div>

            <div id="${UI_ELEMENT_IDS.PRESET_VIEWER}" class="preset-content-preview">
              <label>${t('settings.presetContentPreview')}</label>
              <pre id="${UI_ELEMENT_IDS.PRESET_PREVIEW}" class="preset-preview-text"></pre>
            </div>

            <div id="${UI_ELEMENT_IDS.PATTERN_VALIDATION_STATUS}" class="pattern-validation-status">
              <!-- Validation status will be populated by JavaScript -->
            </div>

            <label for="${UI_ELEMENT_IDS.META_PROMPT_DEPTH}">
              <span>${t('settings.metaPromptDepth')}</span>
              <small>${t('settings.metaPromptDepthDesc')}</small>
              <input id="${UI_ELEMENT_IDS.META_PROMPT_DEPTH}" class="text_pole" type="number" min="${META_PROMPT_DEPTH.MIN}" max="${META_PROMPT_DEPTH.MAX}" step="${META_PROMPT_DEPTH.STEP}" />
            </label>
          </div>

          <hr>

          <label class="checkbox_label" for="${UI_ELEMENT_IDS.STREAMING_ENABLED}">
            <input id="${UI_ELEMENT_IDS.STREAMING_ENABLED}" type="checkbox" />
            <span>${t('settings.streamingEnabled')}</span>
            <small>${t('settings.streamingEnabledDesc')}</small>
          </label>

          <label for="${UI_ELEMENT_IDS.STREAMING_POLL_INTERVAL}">
            <span>${t('settings.streamingPollInterval')}</span>
            <small>${t('settings.streamingPollIntervalDesc')}</small>
            <input id="${UI_ELEMENT_IDS.STREAMING_POLL_INTERVAL}" class="text_pole" type="number" min="${STREAMING_POLL_INTERVAL.MIN}" max="${STREAMING_POLL_INTERVAL.MAX}" step="${STREAMING_POLL_INTERVAL.STEP}" />
          </label>

          <label for="${UI_ELEMENT_IDS.MAX_CONCURRENT}">
            <span>${t('settings.maxConcurrent')}</span>
            <small>${t('settings.maxConcurrentDesc')}</small>
            <input id="${UI_ELEMENT_IDS.MAX_CONCURRENT}" class="text_pole" type="number" min="${MAX_CONCURRENT_GENERATIONS.MIN}" max="${MAX_CONCURRENT_GENERATIONS.MAX}" step="${MAX_CONCURRENT_GENERATIONS.STEP}" />
          </label>

          <label for="${UI_ELEMENT_IDS.MIN_GENERATION_INTERVAL}">
            <span>${t('settings.minGenerationInterval')}</span>
            <small>${t('settings.minGenerationIntervalDesc')}</small>
            <input id="${UI_ELEMENT_IDS.MIN_GENERATION_INTERVAL}" class="text_pole" type="number" min="${MIN_GENERATION_INTERVAL.MIN}" max="${MIN_GENERATION_INTERVAL.MAX}" step="${MIN_GENERATION_INTERVAL.STEP}" />
          </label>

          <label for="${UI_ELEMENT_IDS.PROMPT_PATTERNS}">
            <span>${t('settings.promptPatterns')}</span>
            <small>${t('settings.promptPatternsDesc')}</small>
            <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
              <textarea id="${UI_ELEMENT_IDS.PROMPT_PATTERNS}" class="text_pole textarea_compact" rows="5" style="flex: 1;"></textarea>
              <button id="${UI_ELEMENT_IDS.PROMPT_PATTERNS_RESET}" class="menu_button menu_button_icon" title="${t('settings.promptPatternsReset')}">
                <i class="fa-solid fa-undo"></i>
              </button>
            </div>
          </label>

          <label for="${UI_ELEMENT_IDS.COMMON_STYLE_TAGS}">
            <span>${t('settings.commonStyleTags')}</span>
            <small>${t('settings.commonStyleTagsDesc')}</small>
            <textarea id="${UI_ELEMENT_IDS.COMMON_STYLE_TAGS}" class="text_pole textarea_compact" rows="3" placeholder="${t('settings.commonStyleTagsPlaceholder')}"></textarea>
          </label>

          <label for="${UI_ELEMENT_IDS.COMMON_STYLE_TAGS_POSITION}">
            <span>${t('settings.commonStyleTagsPosition')}</span>
            <select id="${UI_ELEMENT_IDS.COMMON_STYLE_TAGS_POSITION}" class="text_pole">
              <option value="prefix">${t('settings.commonStyleTagsPrefix')}</option>
              <option value="suffix">${t('settings.commonStyleTagsSuffix')}</option>
            </select>
          </label>

          <label for="${UI_ELEMENT_IDS.MANUAL_GEN_MODE}">
            <span>${t('settings.manualGenerationMode')}</span>
            <small>${t('settings.manualGenerationModeDesc')}</small>
            <select id="${UI_ELEMENT_IDS.MANUAL_GEN_MODE}" class="text_pole">
              <option value="append">${t('settings.manualGenerationModeAppend')}</option>
              <option value="replace">${t('settings.manualGenerationModeReplace')}</option>
            </select>
          </label>

          <hr>

          <div>
            <label>
              <span>${t('settings.promptGenerationMode')}</span>
              <small>${t('settings.promptGenerationModeDesc')}</small>
            </label>

            <label class="checkbox_label" for="${UI_ELEMENT_IDS.PROMPT_GENERATION_MODE_SHARED}">
              <input id="${UI_ELEMENT_IDS.PROMPT_GENERATION_MODE_SHARED}" type="radio" name="prompt_generation_mode" value="shared-api" />
              <span>${t('settings.promptGenerationModeShared')}</span>
              <small>${t('settings.promptGenerationModeSharedDesc')}</small>
            </label>

            <label class="checkbox_label" for="${UI_ELEMENT_IDS.PROMPT_GENERATION_MODE_INDEPENDENT}">
              <input id="${UI_ELEMENT_IDS.PROMPT_GENERATION_MODE_INDEPENDENT}" type="radio" name="prompt_generation_mode" value="independent-api" />
              <span>
                ${t('settings.promptGenerationModeIndependent')}
                <i class="fa-solid fa-exclamation-triangle" style="color: orange;" title="${t('toast.warning')}"></i>
              </span>
              <small>${t('settings.promptGenerationModeIndependentDesc')}</small>
            </label>
          </div>

          <div id="${UI_ELEMENT_IDS.INDEPENDENT_API_SETTINGS_CONTAINER}" style="display: none;">
            <label for="${UI_ELEMENT_IDS.MAX_PROMPTS_PER_MESSAGE}">
              <span>${t('settings.maxPromptsPerMessage')}</span>
              <small>${t('settings.maxPromptsPerMessageDesc')}</small>
              <input id="${UI_ELEMENT_IDS.MAX_PROMPTS_PER_MESSAGE}" class="text_pole" type="number" min="${MAX_PROMPTS_PER_MESSAGE.MIN}" max="${MAX_PROMPTS_PER_MESSAGE.MAX}" step="${MAX_PROMPTS_PER_MESSAGE.STEP}" />
            </label>

            <label for="${UI_ELEMENT_IDS.CONTEXT_MESSAGE_COUNT}">
              <span>${t('settings.contextMessageCount')}</span>
              <small>${t('settings.contextMessageCountDesc')}</small>
              <input id="${UI_ELEMENT_IDS.CONTEXT_MESSAGE_COUNT}" class="text_pole" type="number" min="${CONTEXT_MESSAGE_COUNT.MIN}" max="${CONTEXT_MESSAGE_COUNT.MAX}" step="${CONTEXT_MESSAGE_COUNT.STEP}" />
            </label>

            <label for="${UI_ELEMENT_IDS.LLM_FREQUENCY_GUIDELINES}">
              <span>${t('settings.llmFrequencyGuidelines')}</span>
              <small>${t('settings.llmFrequencyGuidelinesDesc')}</small>
              <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
                <textarea id="${UI_ELEMENT_IDS.LLM_FREQUENCY_GUIDELINES}" class="text_pole textarea_compact" rows="4" style="flex: 1; font-family: monospace; font-size: 0.9em;"></textarea>
                <button id="${UI_ELEMENT_IDS.LLM_FREQUENCY_GUIDELINES_RESET}" class="menu_button menu_button_icon" title="${t('settings.resetToDefault')}">
                  <i class="fa-solid fa-undo"></i>
                </button>
              </div>
            </label>

            <label for="${UI_ELEMENT_IDS.LLM_PROMPT_WRITING_GUIDELINES}">
              <span>${t('settings.llmPromptWritingGuidelines')}</span>
              <small>${t('settings.llmPromptWritingGuidelinesDesc')}</small>
              <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
                <textarea id="${UI_ELEMENT_IDS.LLM_PROMPT_WRITING_GUIDELINES}" class="text_pole textarea_compact" rows="15" style="flex: 1; font-family: monospace; font-size: 0.9em;"></textarea>
                <button id="${UI_ELEMENT_IDS.LLM_PROMPT_WRITING_GUIDELINES_RESET}" class="menu_button menu_button_icon" title="${t('settings.resetToDefault')}">
                  <i class="fa-solid fa-undo"></i>
                </button>
              </div>
            </label>
          </div>

          <hr>

          <div style="margin-top: 1rem;">
            <strong>${t('settings.widgetVisibility')}</strong>
          </div>

          <label class="checkbox_label" for="${UI_ELEMENT_IDS.SHOW_PROGRESS_WIDGET}">
            <input id="${UI_ELEMENT_IDS.SHOW_PROGRESS_WIDGET}" type="checkbox" />
            <span>${t('settings.showProgressWidget')}</span>
            <small>${t('settings.showProgressWidgetDesc')}</small>
          </label>

          <label class="checkbox_label" for="${UI_ELEMENT_IDS.SHOW_GALLERY_WIDGET}">
            <input id="${UI_ELEMENT_IDS.SHOW_GALLERY_WIDGET}" type="checkbox" />
            <span>${t('settings.showGalleryWidget')}</span>
            <small>${t('settings.showGalleryWidgetDesc')}</small>
          </label>

          <label for="${UI_ELEMENT_IDS.LOG_LEVEL}">
            <span>${t('settings.logLevel')}</span>
            <small>${t('settings.logLevelDesc')}</small>
            <select id="${UI_ELEMENT_IDS.LOG_LEVEL}" class="text_pole">
              <option value="trace">${t('settings.logLevel.trace')}</option>
              <option value="debug">${t('settings.logLevel.debug')}</option>
              <option value="info">${t('settings.logLevel.info')}</option>
              <option value="warn">${t('settings.logLevel.warn')}</option>
              <option value="error">${t('settings.logLevel.error')}</option>
              <option value="silent">${t('settings.logLevel.silent')}</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  `.trim();
}
