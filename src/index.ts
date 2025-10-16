/**
 * Auto Illustrator Extension for SillyTavern
 * Automatically generates inline images based on story context
 */

import './style.css';
import {
  pruneGeneratedImages,
  pruneGeneratedImagesAndPrompts,
} from './chat_history_pruner';
import {sessionManager} from './session_manager';
// metadata functions imported where needed
import {
  handleStreamTokenStarted,
  handleMessageReceived,
  handleChatChanged,
} from './message_handler';
import {addImageClickHandlers} from './manual_generation';
import {
  loadSettings,
  saveSettings,
  getDefaultSettings,
  createSettingsUI,
} from './settings';
import {createLogger, setLogLevel} from './logger';
import {
  UI_ELEMENT_IDS,
  DEFAULT_PROMPT_DETECTION_PATTERNS,
  STREAMING_POLL_INTERVAL,
  MAX_CONCURRENT_GENERATIONS,
  MIN_GENERATION_INTERVAL,
  MAX_PROMPTS_PER_MESSAGE,
  CONTEXT_MESSAGE_COUNT,
  META_PROMPT_DEPTH,
  DEFAULT_LLM_FREQUENCY_GUIDELINES,
  DEFAULT_LLM_PROMPT_WRITING_GUIDELINES,
  PROMPT_GENERATION_MODE,
} from './constants';
import {
  getPresetById,
  isPresetPredefined,
  isPredefinedPresetName,
} from './meta_prompt_presets';
import {
  initializeConcurrencyLimiter,
  updateMaxConcurrent,
  updateMinInterval,
} from './image_generator';
import {initializeI18n, t} from './i18n';
import {extractImagePromptsMultiPattern} from './regex';
import {progressManager} from './progress_manager';
import {
  initializeProgressWidget,
  clearProgressWidgetState,
} from './progress_widget';
import {initializeGalleryWidget, getGalleryWidget} from './gallery_widget';
import {isIndependentApiMode} from './mode_utils';

const logger = createLogger('Main');

// Module state
let context: SillyTavernContext;
let settings: AutoIllustratorSettings;
let isEditingPreset = false; // Track if user is currently editing a preset

// Generation state
export let currentGenerationType: string | null = null; // Track generation type for filtering

/**
 * Checks if streaming generation is currently active
 * @param messageId - Optional message ID to check. If provided, checks if THIS message is streaming.
 *                    If omitted, checks if ANY message is streaming.
 * @returns True if streaming is in progress
 */
export function isStreamingActive(messageId?: number): boolean {
  return sessionManager?.isActive(messageId) ?? false;
}

/**
 * Checks if a specific message is currently being streamed
 * @param messageId - Message ID to check
 * @returns True if this message is being streamed
 */
export function isMessageBeingStreamed(messageId: number): boolean {
  return sessionManager?.isActive(messageId) ?? false;
}

/**
 * Updates the UI elements with current settings
 */
function updateUI(): void {
  const enabledCheckbox = document.getElementById(
    UI_ELEMENT_IDS.ENABLED
  ) as HTMLInputElement;
  const metaPromptTextarea = document.getElementById(
    UI_ELEMENT_IDS.META_PROMPT
  ) as HTMLTextAreaElement;
  const presetSelect = document.getElementById(
    UI_ELEMENT_IDS.META_PROMPT_PRESET_SELECT
  ) as HTMLSelectElement;
  const presetDeleteButton = document.getElementById(
    UI_ELEMENT_IDS.META_PROMPT_PRESET_DELETE
  ) as HTMLButtonElement;
  const presetEditor = document.getElementById(
    UI_ELEMENT_IDS.PRESET_EDITOR
  ) as HTMLDivElement;
  const presetViewer = document.getElementById(
    UI_ELEMENT_IDS.PRESET_VIEWER
  ) as HTMLDivElement;
  const presetPreview = document.getElementById(
    UI_ELEMENT_IDS.PRESET_PREVIEW
  ) as HTMLPreElement;
  const streamingEnabledCheckbox = document.getElementById(
    UI_ELEMENT_IDS.STREAMING_ENABLED
  ) as HTMLInputElement;
  const streamingPollIntervalInput = document.getElementById(
    UI_ELEMENT_IDS.STREAMING_POLL_INTERVAL
  ) as HTMLInputElement;
  const maxConcurrentInput = document.getElementById(
    UI_ELEMENT_IDS.MAX_CONCURRENT
  ) as HTMLInputElement;
  const minGenerationIntervalInput = document.getElementById(
    UI_ELEMENT_IDS.MIN_GENERATION_INTERVAL
  ) as HTMLInputElement;
  const logLevelSelect = document.getElementById(
    UI_ELEMENT_IDS.LOG_LEVEL
  ) as HTMLSelectElement;
  const promptPatternsTextarea = document.getElementById(
    UI_ELEMENT_IDS.PROMPT_PATTERNS
  ) as HTMLTextAreaElement;
  const commonStyleTagsTextarea = document.getElementById(
    UI_ELEMENT_IDS.COMMON_STYLE_TAGS
  ) as HTMLTextAreaElement;
  const commonStyleTagsPositionSelect = document.getElementById(
    UI_ELEMENT_IDS.COMMON_STYLE_TAGS_POSITION
  ) as HTMLSelectElement;
  const manualGenModeSelect = document.getElementById(
    UI_ELEMENT_IDS.MANUAL_GEN_MODE
  ) as HTMLSelectElement;
  const showGalleryWidgetCheckbox = document.getElementById(
    UI_ELEMENT_IDS.SHOW_GALLERY_WIDGET
  ) as HTMLInputElement;
  const showProgressWidgetCheckbox = document.getElementById(
    UI_ELEMENT_IDS.SHOW_PROGRESS_WIDGET
  ) as HTMLInputElement;
  const promptGenModeRegexRadio = document.getElementById(
    UI_ELEMENT_IDS.PROMPT_GENERATION_MODE_SHARED
  ) as HTMLInputElement;
  const promptGenModeLLMRadio = document.getElementById(
    UI_ELEMENT_IDS.PROMPT_GENERATION_MODE_INDEPENDENT
  ) as HTMLInputElement;
  const maxPromptsPerMessageInput = document.getElementById(
    UI_ELEMENT_IDS.MAX_PROMPTS_PER_MESSAGE
  ) as HTMLInputElement;
  const contextMessageCountInput = document.getElementById(
    UI_ELEMENT_IDS.CONTEXT_MESSAGE_COUNT
  ) as HTMLInputElement;
  const metaPromptDepthInput = document.getElementById(
    UI_ELEMENT_IDS.META_PROMPT_DEPTH
  ) as HTMLInputElement;

  // Update basic settings
  if (enabledCheckbox) enabledCheckbox.checked = settings.enabled;
  if (streamingEnabledCheckbox)
    streamingEnabledCheckbox.checked = settings.streamingEnabled;
  if (streamingPollIntervalInput)
    streamingPollIntervalInput.value =
      settings.streamingPollInterval.toString();
  if (maxConcurrentInput)
    maxConcurrentInput.value = settings.maxConcurrentGenerations.toString();
  if (minGenerationIntervalInput)
    minGenerationIntervalInput.value =
      settings.minGenerationInterval.toString();
  if (logLevelSelect) logLevelSelect.value = settings.logLevel;
  if (promptPatternsTextarea)
    promptPatternsTextarea.value = settings.promptDetectionPatterns.join('\n');
  if (commonStyleTagsTextarea)
    commonStyleTagsTextarea.value = settings.commonStyleTags;
  if (commonStyleTagsPositionSelect)
    commonStyleTagsPositionSelect.value = settings.commonStyleTagsPosition;
  if (manualGenModeSelect)
    manualGenModeSelect.value = settings.manualGenerationMode;
  if (showGalleryWidgetCheckbox)
    showGalleryWidgetCheckbox.checked = settings.showGalleryWidget;
  if (showProgressWidgetCheckbox)
    showProgressWidgetCheckbox.checked = settings.showProgressWidget;

  // Update prompt generation mode radio buttons
  if (promptGenModeRegexRadio && promptGenModeLLMRadio) {
    // Support both new names and legacy aliases
    const isIndependent =
      settings.promptGenerationMode === 'independent-api' ||
      settings.promptGenerationMode === 'llm-post';
    if (isIndependent) {
      promptGenModeLLMRadio.checked = true;
      promptGenModeRegexRadio.checked = false;
    } else {
      // Default to shared-api mode for any other value (including 'shared-api', 'regex', and invalid values)
      promptGenModeRegexRadio.checked = true;
      promptGenModeLLMRadio.checked = false;
    }
  }

  // Toggle independent API settings visibility based on current mode
  toggleIndependentApiSettingsVisibility();

  // Update max prompts per message
  if (maxPromptsPerMessageInput) {
    maxPromptsPerMessageInput.value = settings.maxPromptsPerMessage.toString();
  }

  // Update context message count
  if (contextMessageCountInput) {
    contextMessageCountInput.value = settings.contextMessageCount.toString();
  }

  // Update meta prompt depth
  if (metaPromptDepthInput) {
    metaPromptDepthInput.value = settings.metaPromptDepth.toString();
  }

  // Update LLM guidelines textareas
  const llmFrequencyGuidelinesTextarea = document.getElementById(
    UI_ELEMENT_IDS.LLM_FREQUENCY_GUIDELINES
  ) as HTMLTextAreaElement;
  const llmPromptWritingGuidelinesTextarea = document.getElementById(
    UI_ELEMENT_IDS.LLM_PROMPT_WRITING_GUIDELINES
  ) as HTMLTextAreaElement;

  if (llmFrequencyGuidelinesTextarea) {
    llmFrequencyGuidelinesTextarea.value = settings.llmFrequencyGuidelines;
  }

  if (llmPromptWritingGuidelinesTextarea) {
    llmPromptWritingGuidelinesTextarea.value =
      settings.llmPromptWritingGuidelines;
  }

  // Update preset dropdown with custom presets
  if (presetSelect) {
    const customPresetsGroup = presetSelect.querySelector(
      '#custom_presets_group'
    );
    if (customPresetsGroup) {
      customPresetsGroup.innerHTML = '';
      settings.customPresets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.name;
        customPresetsGroup.appendChild(option);
      });
    }
    presetSelect.value = settings.currentPresetId;
  }

  // Update delete button state based on preset type
  if (presetDeleteButton) {
    const isPredefined = isPresetPredefined(settings.currentPresetId);
    presetDeleteButton.disabled = isPredefined;
    presetDeleteButton.title = isPredefined
      ? 'Cannot delete predefined presets'
      : 'Delete custom preset';
  }

  // Update preview area with current preset content
  if (presetPreview) {
    presetPreview.textContent = settings.metaPrompt;
  }

  // Update textarea (used in edit mode)
  if (metaPromptTextarea) {
    metaPromptTextarea.value = settings.metaPrompt;
  }

  // Ensure editor is hidden and viewer is shown (not in edit mode)
  if (presetEditor) presetEditor.style.display = 'none';
  if (presetViewer) presetViewer.style.display = 'block';
  isEditingPreset = false;

  // Update validation status
  updateValidationStatus();
}

/**
 * Validates whether the current prompt detection patterns can find prompts in the meta prompt
 * @returns True if patterns can detect prompts, false otherwise
 */
function validatePromptPatterns(): boolean {
  const metaPrompt = settings.metaPrompt;
  const patterns = settings.promptDetectionPatterns;

  if (!metaPrompt || !patterns || patterns.length === 0) {
    return false;
  }

  try {
    const matches = extractImagePromptsMultiPattern(metaPrompt, patterns);
    return matches.length > 0;
  } catch (error) {
    logger.warn('Error validating prompt patterns:', error);
    return false;
  }
}

/**
 * Updates the validation status UI element
 */
function updateValidationStatus(): void {
  const validationElement = document.getElementById(
    UI_ELEMENT_IDS.PATTERN_VALIDATION_STATUS
  );
  if (!validationElement) return;

  const isValid = validatePromptPatterns();

  // Clear existing classes
  validationElement.className = 'pattern-validation-status';

  if (isValid) {
    validationElement.classList.add('validation-success');
    validationElement.innerHTML = `
      <span class="validation-message">${t('settings.validationSuccess')}</span>
    `;
  } else {
    validationElement.classList.add('validation-warning');
    validationElement.innerHTML = `
      <span class="validation-message">${t('settings.validationWarning')}</span>
      <span class="validation-hint">${t('settings.validationHint')}</span>
    `;
  }
}

/**
 * Clamps a value to the specified range and rounds to nearest step
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @param step - Step size for rounding
 * @returns Clamped and rounded value
 */
function clampValue(
  value: number,
  min: number,
  max: number,
  step: number
): number {
  // Round to nearest step
  const rounded = Math.round(value / step) * step;
  // Clamp to min/max
  return Math.max(min, Math.min(max, rounded));
}

/**
 * Handles changes to settings from UI
 */
function handleSettingsChange(): void {
  const enabledCheckbox = document.getElementById(
    UI_ELEMENT_IDS.ENABLED
  ) as HTMLInputElement;
  const metaPromptTextarea = document.getElementById(
    UI_ELEMENT_IDS.META_PROMPT
  ) as HTMLTextAreaElement;
  const streamingEnabledCheckbox = document.getElementById(
    UI_ELEMENT_IDS.STREAMING_ENABLED
  ) as HTMLInputElement;
  const streamingPollIntervalInput = document.getElementById(
    UI_ELEMENT_IDS.STREAMING_POLL_INTERVAL
  ) as HTMLInputElement;
  const maxConcurrentInput = document.getElementById(
    UI_ELEMENT_IDS.MAX_CONCURRENT
  ) as HTMLInputElement;
  const minGenerationIntervalInput = document.getElementById(
    UI_ELEMENT_IDS.MIN_GENERATION_INTERVAL
  ) as HTMLInputElement;
  const logLevelSelect = document.getElementById(
    UI_ELEMENT_IDS.LOG_LEVEL
  ) as HTMLSelectElement;
  const promptPatternsTextarea = document.getElementById(
    UI_ELEMENT_IDS.PROMPT_PATTERNS
  ) as HTMLTextAreaElement;
  const commonStyleTagsTextarea = document.getElementById(
    UI_ELEMENT_IDS.COMMON_STYLE_TAGS
  ) as HTMLTextAreaElement;
  const commonStyleTagsPositionSelect = document.getElementById(
    UI_ELEMENT_IDS.COMMON_STYLE_TAGS_POSITION
  ) as HTMLSelectElement;
  const manualGenModeSelect = document.getElementById(
    UI_ELEMENT_IDS.MANUAL_GEN_MODE
  ) as HTMLSelectElement;
  const showGalleryWidgetCheckbox = document.getElementById(
    UI_ELEMENT_IDS.SHOW_GALLERY_WIDGET
  ) as HTMLInputElement;
  const showProgressWidgetCheckbox = document.getElementById(
    UI_ELEMENT_IDS.SHOW_PROGRESS_WIDGET
  ) as HTMLInputElement;
  const promptGenModeRegexRadio = document.getElementById(
    UI_ELEMENT_IDS.PROMPT_GENERATION_MODE_SHARED
  ) as HTMLInputElement;
  const promptGenModeLLMRadio = document.getElementById(
    UI_ELEMENT_IDS.PROMPT_GENERATION_MODE_INDEPENDENT
  ) as HTMLInputElement;
  const maxPromptsPerMessageInput = document.getElementById(
    UI_ELEMENT_IDS.MAX_PROMPTS_PER_MESSAGE
  ) as HTMLInputElement;
  const contextMessageCountInput = document.getElementById(
    UI_ELEMENT_IDS.CONTEXT_MESSAGE_COUNT
  ) as HTMLInputElement;
  const metaPromptDepthInput = document.getElementById(
    UI_ELEMENT_IDS.META_PROMPT_DEPTH
  ) as HTMLInputElement;
  const llmFrequencyGuidelinesTextarea = document.getElementById(
    UI_ELEMENT_IDS.LLM_FREQUENCY_GUIDELINES
  ) as HTMLTextAreaElement;
  const llmPromptWritingGuidelinesTextarea = document.getElementById(
    UI_ELEMENT_IDS.LLM_PROMPT_WRITING_GUIDELINES
  ) as HTMLTextAreaElement;

  // Track if enabled state or widget visibility changed (requires page reload)
  const wasEnabled = settings.enabled;
  const wasShowGalleryWidget = settings.showGalleryWidget;
  const wasShowProgressWidget = settings.showProgressWidget;
  settings.enabled = enabledCheckbox?.checked ?? settings.enabled;
  settings.metaPrompt = metaPromptTextarea?.value ?? settings.metaPrompt;
  settings.streamingEnabled =
    streamingEnabledCheckbox?.checked ?? settings.streamingEnabled;

  // Validate and clamp numeric settings
  if (streamingPollIntervalInput) {
    const originalValue = parseInt(streamingPollIntervalInput.value);
    const clampedValue = clampValue(
      originalValue,
      STREAMING_POLL_INTERVAL.MIN,
      STREAMING_POLL_INTERVAL.MAX,
      STREAMING_POLL_INTERVAL.STEP
    );
    settings.streamingPollInterval = clampedValue;
    // Update UI to show validated value
    streamingPollIntervalInput.value = clampedValue.toString();

    // Show toast if value was clamped
    if (clampedValue !== originalValue) {
      toastr.warning(
        t('toast.valueAdjusted', {
          original: originalValue,
          clamped: clampedValue,
          min: STREAMING_POLL_INTERVAL.MIN,
          max: STREAMING_POLL_INTERVAL.MAX,
          step: STREAMING_POLL_INTERVAL.STEP,
        }),
        t('extensionName')
      );
    }
  }

  if (maxConcurrentInput) {
    const originalValue = parseInt(maxConcurrentInput.value);
    const clampedValue = clampValue(
      originalValue,
      MAX_CONCURRENT_GENERATIONS.MIN,
      MAX_CONCURRENT_GENERATIONS.MAX,
      MAX_CONCURRENT_GENERATIONS.STEP
    );
    settings.maxConcurrentGenerations = clampedValue;
    // Update UI to show validated value
    maxConcurrentInput.value = clampedValue.toString();

    // Show toast if value was clamped
    if (clampedValue !== originalValue) {
      toastr.warning(
        t('toast.valueAdjustedNoStep', {
          original: originalValue,
          clamped: clampedValue,
          min: MAX_CONCURRENT_GENERATIONS.MIN,
          max: MAX_CONCURRENT_GENERATIONS.MAX,
        }),
        t('extensionName')
      );
    }
  }

  if (minGenerationIntervalInput) {
    const originalValue = parseInt(minGenerationIntervalInput.value);
    const clampedValue = clampValue(
      originalValue,
      MIN_GENERATION_INTERVAL.MIN,
      MIN_GENERATION_INTERVAL.MAX,
      MIN_GENERATION_INTERVAL.STEP
    );
    settings.minGenerationInterval = clampedValue;
    // Update UI to show validated value
    minGenerationIntervalInput.value = clampedValue.toString();

    // Show toast if value was clamped
    if (clampedValue !== originalValue) {
      toastr.warning(
        t('toast.valueAdjusted', {
          original: originalValue,
          clamped: clampedValue,
          min: MIN_GENERATION_INTERVAL.MIN,
          max: MIN_GENERATION_INTERVAL.MAX,
          step: MIN_GENERATION_INTERVAL.STEP,
        }),
        t('extensionName')
      );
    }
  }
  settings.logLevel =
    (logLevelSelect?.value as AutoIllustratorSettings['logLevel']) ??
    settings.logLevel;
  settings.promptDetectionPatterns = promptPatternsTextarea
    ? promptPatternsTextarea.value
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0)
    : settings.promptDetectionPatterns;
  settings.commonStyleTags =
    commonStyleTagsTextarea?.value ?? settings.commonStyleTags;
  settings.commonStyleTagsPosition =
    (commonStyleTagsPositionSelect?.value as 'prefix' | 'suffix') ??
    settings.commonStyleTagsPosition;
  settings.manualGenerationMode =
    (manualGenModeSelect?.value as 'replace' | 'append') ??
    settings.manualGenerationMode;

  // Prompt generation mode (radio buttons)
  if (promptGenModeRegexRadio?.checked) {
    settings.promptGenerationMode = 'shared-api';
  } else if (promptGenModeLLMRadio?.checked) {
    settings.promptGenerationMode = 'independent-api';
  } else {
    // Fallback to default if neither is checked (shouldn't happen, but be defensive)
    settings.promptGenerationMode = PROMPT_GENERATION_MODE.DEFAULT;
  }

  // Max prompts per message with validation
  if (maxPromptsPerMessageInput) {
    const originalValue = parseInt(maxPromptsPerMessageInput.value);
    const clampedValue = clampValue(
      originalValue,
      MAX_PROMPTS_PER_MESSAGE.MIN,
      MAX_PROMPTS_PER_MESSAGE.MAX,
      MAX_PROMPTS_PER_MESSAGE.STEP
    );
    settings.maxPromptsPerMessage = clampedValue;
    // Update UI to show validated value
    maxPromptsPerMessageInput.value = clampedValue.toString();

    // Show toast if value was clamped
    if (clampedValue !== originalValue) {
      toastr.warning(
        t('toast.valueAdjustedNoStep', {
          original: originalValue,
          clamped: clampedValue,
          min: MAX_PROMPTS_PER_MESSAGE.MIN,
          max: MAX_PROMPTS_PER_MESSAGE.MAX,
        }),
        t('extensionName')
      );
    }
  }

  // Context message count with validation
  if (contextMessageCountInput) {
    const originalValue = parseInt(contextMessageCountInput.value);
    const clampedValue = clampValue(
      originalValue,
      CONTEXT_MESSAGE_COUNT.MIN,
      CONTEXT_MESSAGE_COUNT.MAX,
      CONTEXT_MESSAGE_COUNT.STEP
    );
    settings.contextMessageCount = clampedValue;
    // Update UI to show validated value
    contextMessageCountInput.value = clampedValue.toString();

    // Show toast if value was clamped
    if (clampedValue !== originalValue) {
      toastr.warning(
        t('toast.valueAdjustedNoStep', {
          original: originalValue,
          clamped: clampedValue,
          min: CONTEXT_MESSAGE_COUNT.MIN,
          max: CONTEXT_MESSAGE_COUNT.MAX,
        }),
        t('extensionName')
      );
    }
  }

  // Meta prompt depth with validation
  if (metaPromptDepthInput) {
    const originalValue = parseInt(metaPromptDepthInput.value);
    const clampedValue = clampValue(
      originalValue,
      META_PROMPT_DEPTH.MIN,
      META_PROMPT_DEPTH.MAX,
      META_PROMPT_DEPTH.STEP
    );
    settings.metaPromptDepth = clampedValue;
    // Update UI to show validated value
    metaPromptDepthInput.value = clampedValue.toString();

    // Show toast if value was clamped
    if (clampedValue !== originalValue) {
      toastr.warning(
        t('toast.valueAdjustedNoStep', {
          original: originalValue,
          clamped: clampedValue,
          min: META_PROMPT_DEPTH.MIN,
          max: META_PROMPT_DEPTH.MAX,
        }),
        t('extensionName')
      );
    }
  }

  // LLM guidelines (textareas)
  settings.llmFrequencyGuidelines =
    llmFrequencyGuidelinesTextarea?.value ?? settings.llmFrequencyGuidelines;
  settings.llmPromptWritingGuidelines =
    llmPromptWritingGuidelinesTextarea?.value ??
    settings.llmPromptWritingGuidelines;

  settings.showGalleryWidget =
    showGalleryWidgetCheckbox?.checked ?? settings.showGalleryWidget;
  settings.showProgressWidget =
    showProgressWidgetCheckbox?.checked ?? settings.showProgressWidget;

  // Apply log level
  setLogLevel(settings.logLevel);

  // Update concurrency limiter settings
  updateMaxConcurrent(settings.maxConcurrentGenerations);
  updateMinInterval(settings.minGenerationInterval);

  saveSettings(settings, context);

  // Update validation status after settings change
  updateValidationStatus();

  // Notify user if enable state or widget visibility changed
  if (
    wasEnabled !== settings.enabled ||
    wasShowGalleryWidget !== settings.showGalleryWidget ||
    wasShowProgressWidget !== settings.showProgressWidget
  ) {
    toastr.info(t('toast.reloadRequired'), t('extensionName'), {
      timeOut: 5000,
    });
    if (wasEnabled !== settings.enabled) {
      logger.info(
        `Extension ${settings.enabled ? 'enabled' : 'disabled'} - reload required`
      );
    }
    if (wasShowGalleryWidget !== settings.showGalleryWidget) {
      logger.info(
        `Gallery widget ${settings.showGalleryWidget ? 'enabled' : 'disabled'} - reload required`
      );
    }
    if (wasShowProgressWidget !== settings.showProgressWidget) {
      logger.info(
        `Progress widget ${settings.showProgressWidget ? 'enabled' : 'disabled'} - reload required`
      );
    }
  }

  logger.info('Settings updated:', settings);
}

/**
 * Resets settings to defaults
 */
function handleResetSettings(): void {
  settings = getDefaultSettings();
  saveSettings(settings, context);
  updateUI();

  logger.info('Settings reset to defaults');
}

/**
 * Resets prompt patterns to defaults
 */
function handlePromptPatternsReset(): void {
  const promptPatternsTextarea = document.getElementById(
    UI_ELEMENT_IDS.PROMPT_PATTERNS
  ) as HTMLTextAreaElement;

  if (promptPatternsTextarea) {
    promptPatternsTextarea.value = DEFAULT_PROMPT_DETECTION_PATTERNS.join('\n');
    // Trigger change event to save the settings
    handleSettingsChange();
  }

  logger.info('Prompt patterns reset to defaults');
}

/**
 * Handles LLM frequency guidelines reset to defaults
 */
function handleLLMFrequencyGuidelinesReset(): void {
  const llmFrequencyGuidelinesTextarea = document.getElementById(
    UI_ELEMENT_IDS.LLM_FREQUENCY_GUIDELINES
  ) as HTMLTextAreaElement;

  if (llmFrequencyGuidelinesTextarea) {
    llmFrequencyGuidelinesTextarea.value = DEFAULT_LLM_FREQUENCY_GUIDELINES;
    // Trigger change event to save the settings
    handleSettingsChange();
    toastr.success('Frequency guidelines reset to default', t('extensionName'));
  }

  logger.info('LLM frequency guidelines reset to defaults');
}

/**
 * Handles LLM prompt writing guidelines reset to defaults
 */
function handleLLMPromptWritingGuidelinesReset(): void {
  const llmPromptWritingGuidelinesTextarea = document.getElementById(
    UI_ELEMENT_IDS.LLM_PROMPT_WRITING_GUIDELINES
  ) as HTMLTextAreaElement;

  if (llmPromptWritingGuidelinesTextarea) {
    llmPromptWritingGuidelinesTextarea.value =
      DEFAULT_LLM_PROMPT_WRITING_GUIDELINES;
    // Trigger change event to save the settings
    handleSettingsChange();
    toastr.success(
      'Prompt writing guidelines reset to default',
      t('extensionName')
    );
  }

  logger.info('LLM prompt writing guidelines reset to defaults');
}

/**
 * Toggles visibility of LLM-specific settings based on prompt generation mode
 */
function toggleIndependentApiSettingsVisibility(): void {
  const llmSettingsContainer = document.getElementById(
    UI_ELEMENT_IDS.INDEPENDENT_API_SETTINGS_CONTAINER
  );
  const promptGenModeLLMRadio = document.getElementById(
    UI_ELEMENT_IDS.PROMPT_GENERATION_MODE_INDEPENDENT
  ) as HTMLInputElement;

  if (llmSettingsContainer && promptGenModeLLMRadio) {
    llmSettingsContainer.style.display = promptGenModeLLMRadio.checked
      ? 'block'
      : 'none';
  }
}

/**
 * Handles preset selection change
 */
function handlePresetChange(): void {
  // Exit edit mode if active
  if (isEditingPreset) {
    handlePresetCancel();
  }

  const presetSelect = document.getElementById(
    UI_ELEMENT_IDS.META_PROMPT_PRESET_SELECT
  ) as HTMLSelectElement;
  if (!presetSelect) return;

  const selectedId = presetSelect.value;
  const preset = getPresetById(selectedId, settings.customPresets);

  settings.currentPresetId = selectedId;
  settings.metaPrompt = preset.template;
  saveSettings(settings, context);
  updateUI();

  logger.info('Preset changed:', {id: selectedId, name: preset.name});
}

/**
 * Handles entering edit mode for current preset
 */
function handlePresetEdit(): void {
  const presetEditor = document.getElementById(
    UI_ELEMENT_IDS.PRESET_EDITOR
  ) as HTMLDivElement;
  const presetViewer = document.getElementById(
    UI_ELEMENT_IDS.PRESET_VIEWER
  ) as HTMLDivElement;
  const metaPromptTextarea = document.getElementById(
    UI_ELEMENT_IDS.META_PROMPT
  ) as HTMLTextAreaElement;
  const presetSaveButton = document.getElementById(
    UI_ELEMENT_IDS.META_PROMPT_PRESET_SAVE
  ) as HTMLButtonElement;

  if (!presetEditor || !presetViewer || !metaPromptTextarea) return;

  // Show editor, hide viewer
  presetViewer.style.display = 'none';
  presetEditor.style.display = 'block';

  // Make textarea editable and populate with current content
  metaPromptTextarea.removeAttribute('readonly');
  metaPromptTextarea.value = settings.metaPrompt;

  // Update save button state (disabled for predefined presets)
  if (presetSaveButton) {
    const isPredefined = isPresetPredefined(settings.currentPresetId);
    presetSaveButton.disabled = isPredefined;
    presetSaveButton.title = isPredefined
      ? 'Cannot save changes to predefined presets (use Save As)'
      : 'Save changes to this preset';
  }

  isEditingPreset = true;
  logger.info('Entered preset edit mode');
}

/**
 * Handles saving changes to current custom preset
 */
function handlePresetSave(): void {
  if (isPresetPredefined(settings.currentPresetId)) {
    toastr.error(t('settings.cannotDeletePredefined'), t('extensionName'));
    return;
  }

  const metaPromptTextarea = document.getElementById(
    UI_ELEMENT_IDS.META_PROMPT
  ) as HTMLTextAreaElement;
  if (!metaPromptTextarea) return;

  const content = metaPromptTextarea.value;

  // Find and update the custom preset
  const presetIndex = settings.customPresets.findIndex(
    p => p.id === settings.currentPresetId
  );
  if (presetIndex === -1) {
    toastr.error(t('toast.presetNotFound'), t('extensionName'));
    return;
  }

  settings.customPresets[presetIndex].template = content;
  settings.metaPrompt = content;
  saveSettings(settings, context);

  // Exit edit mode
  const presetEditor = document.getElementById(
    UI_ELEMENT_IDS.PRESET_EDITOR
  ) as HTMLDivElement;
  const presetViewer = document.getElementById(
    UI_ELEMENT_IDS.PRESET_VIEWER
  ) as HTMLDivElement;
  if (presetEditor) presetEditor.style.display = 'none';
  if (presetViewer) presetViewer.style.display = 'block';
  isEditingPreset = false;

  updateUI();
  toastr.success(t('toast.presetSaved'), t('extensionName'));
  logger.info('Preset saved:', settings.customPresets[presetIndex].name);
}

/**
 * Handles saving current content as a new preset or overwriting existing
 */
function handlePresetSaveAs(): void {
  const metaPromptTextarea = document.getElementById(
    UI_ELEMENT_IDS.META_PROMPT
  ) as HTMLTextAreaElement;
  if (!metaPromptTextarea) return;

  const content = metaPromptTextarea.value;
  const name = prompt(t('prompt.enterPresetName'));

  if (!name || name.trim() === '') {
    return;
  }

  const trimmedName = name.trim();

  // Check if name is a predefined preset name
  if (isPredefinedPresetName(trimmedName)) {
    toastr.error(t('toast.cannotUsePredefinedNames'), t('extensionName'));
    return;
  }

  // Check if name already exists in custom presets
  const existingPreset = settings.customPresets.find(
    p => p.name === trimmedName
  );

  if (existingPreset) {
    const overwrite = confirm(t('prompt.overwritePreset', {name: trimmedName}));
    if (!overwrite) {
      return;
    }

    // Overwrite existing preset
    existingPreset.template = content;
    settings.currentPresetId = existingPreset.id;
    settings.metaPrompt = content;
  } else {
    // Create new preset
    const newPreset: MetaPromptPreset = {
      id: `custom-${Date.now()}`,
      name: trimmedName,
      template: content,
      predefined: false,
    };

    settings.customPresets.push(newPreset);
    settings.currentPresetId = newPreset.id;
    settings.metaPrompt = content;
  }

  saveSettings(settings, context);

  // Exit edit mode
  const presetEditor = document.getElementById(
    UI_ELEMENT_IDS.PRESET_EDITOR
  ) as HTMLDivElement;
  const presetViewer = document.getElementById(
    UI_ELEMENT_IDS.PRESET_VIEWER
  ) as HTMLDivElement;
  if (presetEditor) presetEditor.style.display = 'none';
  if (presetViewer) presetViewer.style.display = 'block';
  isEditingPreset = false;

  updateUI();
  toastr.success(
    t('toast.presetSavedNamed', {name: trimmedName}),
    t('extensionName')
  );
  logger.info('Preset saved as:', trimmedName);
}

/**
 * Handles canceling preset edit
 */
function handlePresetCancel(): void {
  const presetEditor = document.getElementById(
    UI_ELEMENT_IDS.PRESET_EDITOR
  ) as HTMLDivElement;
  const presetViewer = document.getElementById(
    UI_ELEMENT_IDS.PRESET_VIEWER
  ) as HTMLDivElement;
  const metaPromptTextarea = document.getElementById(
    UI_ELEMENT_IDS.META_PROMPT
  ) as HTMLTextAreaElement;

  if (!presetEditor || !presetViewer || !metaPromptTextarea) return;

  // Hide editor, show viewer
  presetEditor.style.display = 'none';
  presetViewer.style.display = 'block';

  // Reset textarea to readonly and restore content
  metaPromptTextarea.setAttribute('readonly', 'readonly');
  metaPromptTextarea.value = settings.metaPrompt;

  isEditingPreset = false;
  logger.info('Cancelled preset edit');
}

/**
 * Handles deleting a custom preset
 */
function handlePresetDelete(): void {
  if (isPresetPredefined(settings.currentPresetId)) {
    toastr.error(t('toast.cannotDeletePredefined'), t('extensionName'));
    return;
  }

  const preset = settings.customPresets.find(
    p => p.id === settings.currentPresetId
  );
  if (!preset) {
    toastr.error(t('toast.presetNotFound'), t('extensionName'));
    return;
  }

  const confirmDelete = confirm(
    t('prompt.deletePresetConfirm', {name: preset.name})
  );
  if (!confirmDelete) {
    return;
  }

  // Remove preset from array
  settings.customPresets = settings.customPresets.filter(
    p => p.id !== settings.currentPresetId
  );

  // Switch to default preset
  settings.currentPresetId = 'default';
  const defaultPreset = getPresetById('default', settings.customPresets);
  settings.metaPrompt = defaultPreset.template;

  saveSettings(settings, context);
  updateUI();

  toastr.success(
    t('toast.presetDeleted', {name: preset.name}),
    t('extensionName')
  );
  logger.info('Preset deleted:', preset.name);
}

/**
 * Cancels all active streaming sessions
 * Used when chat is cleared or reset
 */
function cancelAllSessions(): void {
  const sessions = sessionManager.getAllSessions();
  if (sessions.length === 0) {
    return;
  }

  logger.info(`Cancelling ${sessions.length} active streaming sessions`);

  for (const session of sessions) {
    sessionManager.cancelSession(session.messageId);
  }
}

/**
 * Registers all event handlers for the extension
 * Only called when extension is enabled
 */
function registerEventHandlers(): void {
  logger.info('Registering event handlers...');

  // Register streaming handlers using v2 message handlers
  const STREAM_TOKEN_RECEIVED = context.eventTypes.STREAM_TOKEN_RECEIVED;
  context.eventSource.on(STREAM_TOKEN_RECEIVED, () => {
    if (!settings.streamingEnabled || !settings.enabled) {
      return;
    }
    // STREAM_TOKEN_RECEIVED doesn't provide messageId - get it from chat
    const messageId = context.chat.length - 1;
    if (messageId < 0) {
      logger.warn('No messages in chat, cannot start streaming session');
      return;
    }
    handleStreamTokenStarted(messageId, context, settings);
  });

  const MESSAGE_RECEIVED = context.eventTypes.MESSAGE_RECEIVED;
  context.eventSource.on(MESSAGE_RECEIVED, (messageId: number) => {
    // Handle streaming finalization or non-streaming message processing
    handleMessageReceived(messageId, context, settings);

    // Add image click handlers after message is received
    setTimeout(() => {
      addImageClickHandlers(settings);
    }, 100);
  });

  // Add click handlers when messages are updated
  const MESSAGE_UPDATED = context.eventTypes.MESSAGE_UPDATED;
  context.eventSource.on(MESSAGE_UPDATED, () => {
    setTimeout(() => {
      addImageClickHandlers(settings);
    }, 100);
  });

  // Track generation type to filter out quiet/impersonate modes
  const GENERATION_STARTED = context.eventTypes.GENERATION_STARTED;
  context.eventSource.on(
    GENERATION_STARTED,
    (type: string, _options: unknown, dryRun: boolean) => {
      if (dryRun) {
        logger.trace('Generation started (dry run), skipping type tracking', {
          type,
        });
        return;
      }
      currentGenerationType = type;
      logger.info('Generation started', {type});
    }
  );

  // Chat history pruning and meta-prompt injection
  const CHAT_COMPLETION_PROMPT_READY =
    context.eventTypes.CHAT_COMPLETION_PROMPT_READY;
  context.eventSource.on(CHAT_COMPLETION_PROMPT_READY, (eventData: any) => {
    if (eventData?.dryRun) {
      logger.trace('Skipping prompt ready processing for dry run');
      return;
    }

    if (!eventData?.chat) {
      return;
    }

    // Prune generated images (and optionally prompt tags) from chat history
    // Mode depends on promptGenerationMode setting
    if (isIndependentApiMode(settings.promptGenerationMode)) {
      // Independent API mode: Remove both images and prompt tags (keep history clean)
      pruneGeneratedImagesAndPrompts(
        eventData.chat,
        settings.promptDetectionPatterns
      );
      logger.debug('Applied independent-API-mode pruning (images + prompts)');
    } else {
      // Shared API mode: Remove images only (keep prompt tags for AI context)
      pruneGeneratedImages(eventData.chat, settings.promptDetectionPatterns);
      logger.debug('Applied shared-API-mode pruning (images only)');
    }

    // Inject meta-prompt (filter out quiet/impersonate modes and independent-API mode)
    // Require explicit generation type - skip injection if type is undefined/null
    const shouldInject =
      settings.enabled &&
      settings.metaPrompt &&
      settings.metaPrompt.length > 0 &&
      currentGenerationType !== undefined &&
      currentGenerationType !== null &&
      !['quiet', 'impersonate'].includes(currentGenerationType) &&
      !isIndependentApiMode(settings.promptGenerationMode);

    if (shouldInject) {
      // Calculate insertion position based on metaPromptDepth
      // depth=0 means last position (default), depth=1 means one before last, etc.
      const depth = settings.metaPromptDepth || 0;
      const insertPosition = Math.max(0, eventData.chat.length - depth);

      logger.info('Injecting meta-prompt as system message', {
        generationType: currentGenerationType,
        depth,
        insertPosition,
        chatLength: eventData.chat.length,
      });

      eventData.chat.splice(insertPosition, 0, {
        role: 'system',
        content: settings.metaPrompt,
      });
    } else {
      logger.info('Skipping meta-prompt injection', {
        enabled: settings.enabled,
        hasMetaPrompt: !!settings.metaPrompt,
        generationType: currentGenerationType,
        promptGenerationMode: settings.promptGenerationMode,
        reason: !settings.enabled
          ? 'extension disabled'
          : !settings.metaPrompt
            ? 'no meta-prompt'
            : currentGenerationType === undefined ||
                currentGenerationType === null
              ? 'no generation type specified'
              : ['quiet', 'impersonate'].includes(currentGenerationType)
                ? `filtered generation type: ${currentGenerationType}`
                : isIndependentApiMode(settings.promptGenerationMode)
                  ? 'Independent API mode enabled'
                  : 'unknown',
      });
    }
  });

  // Handle chat changes
  const CHAT_CHANGED = context.eventTypes.CHAT_CHANGED;
  context.eventSource.on(CHAT_CHANGED, () => {
    handleChatChanged();
  });

  logger.info('Event handlers registered:', {
    STREAM_TOKEN_RECEIVED,
    MESSAGE_RECEIVED,
    MESSAGE_UPDATED,
    GENERATION_STARTED,
    CHAT_COMPLETION_PROMPT_READY,
    CHAT_CHANGED,
  });
}

/**
 * Initializes the extension
 */
function initialize(): void {
  logger.info('Initializing extension...');

  // Get SillyTavern context
  try {
    context = SillyTavern.getContext();
    logger.info('Got SillyTavern context');
  } catch (error) {
    logger.error('Failed to get SillyTavern context:', error);
    return;
  }

  // Initialize i18n
  initializeI18n(context);
  logger.info('Initialized i18n');

  // Metadata is initialized lazily on first use via getMetadata()
  logger.info('Extension initialized, metadata will be loaded on first use');

  // Load settings
  settings = loadSettings(context);
  logger.info('Loaded settings:', settings);

  // Apply log level from settings
  setLogLevel(settings.logLevel);

  // Conditionally initialize extension components based on settings.enabled
  if (settings.enabled) {
    // SessionManager is already a singleton, no initialization needed
    logger.info('SessionManager ready (singleton)');

    // Initialize progress widget if enabled (connects to progressManager via events)
    if (settings.showProgressWidget) {
      initializeProgressWidget(progressManager);
      logger.info('Initialized ProgressWidget with event subscriptions');
    } else {
      logger.info('Progress widget disabled - skipping initialization');
    }

    // Initialize gallery widget if enabled (connects to progressManager via events)
    if (settings.showGalleryWidget) {
      initializeGalleryWidget(progressManager);
      logger.info('Initialized GalleryWidget');

      // Show gallery widget on initialization to scan for existing images
      const gallery = getGalleryWidget();
      if (gallery) {
        gallery.show();
        logger.debug('Gallery widget shown on initialization');
      }
    } else {
      logger.info('Gallery widget disabled - skipping initialization');
    }
  } else {
    logger.info(
      'Extension is disabled - skipping SessionManager and widget initialization'
    );
  }

  // Initialize concurrency limiter with settings
  initializeConcurrencyLimiter(
    settings.maxConcurrentGenerations,
    settings.minGenerationInterval
  );
  logger.info(
    `Initialized concurrency limiter: max=${settings.maxConcurrentGenerations}, minInterval=${settings.minGenerationInterval}ms`
  );

  // Conditionally register event handlers based on settings.enabled
  if (settings.enabled) {
    registerEventHandlers();
    logger.info('Extension is enabled - event handlers registered');
  } else {
    logger.info('Extension is disabled - skipping event handler registration');
  }

  // Inject settings UI
  const settingsContainer = document.getElementById('extensions_settings2');
  if (settingsContainer) {
    const settingsHTML = createSettingsUI();
    settingsContainer.insertAdjacentHTML('beforeend', settingsHTML);

    // Attach event listeners
    const enabledCheckbox = document.getElementById(UI_ELEMENT_IDS.ENABLED);
    const presetSelect = document.getElementById(
      UI_ELEMENT_IDS.META_PROMPT_PRESET_SELECT
    );
    const presetEditButton = document.getElementById(
      UI_ELEMENT_IDS.META_PROMPT_PRESET_EDIT
    );
    const presetSaveButton = document.getElementById(
      UI_ELEMENT_IDS.META_PROMPT_PRESET_SAVE
    );
    const presetSaveAsButton = document.getElementById(
      UI_ELEMENT_IDS.META_PROMPT_PRESET_SAVE_AS
    );
    const presetDeleteButton = document.getElementById(
      UI_ELEMENT_IDS.META_PROMPT_PRESET_DELETE
    );
    const presetCancelButton = document.getElementById(
      UI_ELEMENT_IDS.META_PROMPT_PRESET_CANCEL
    );
    const streamingEnabledCheckbox = document.getElementById(
      UI_ELEMENT_IDS.STREAMING_ENABLED
    );
    const streamingPollIntervalInput = document.getElementById(
      UI_ELEMENT_IDS.STREAMING_POLL_INTERVAL
    );
    const maxConcurrentInput = document.getElementById(
      UI_ELEMENT_IDS.MAX_CONCURRENT
    );
    const minGenerationIntervalInput = document.getElementById(
      UI_ELEMENT_IDS.MIN_GENERATION_INTERVAL
    );
    const logLevelSelect = document.getElementById(UI_ELEMENT_IDS.LOG_LEVEL);
    const promptPatternsTextarea = document.getElementById(
      UI_ELEMENT_IDS.PROMPT_PATTERNS
    );
    const promptPatternsResetButton = document.getElementById(
      UI_ELEMENT_IDS.PROMPT_PATTERNS_RESET
    );
    const commonStyleTagsTextarea = document.getElementById(
      UI_ELEMENT_IDS.COMMON_STYLE_TAGS
    );
    const commonStyleTagsPositionSelect = document.getElementById(
      UI_ELEMENT_IDS.COMMON_STYLE_TAGS_POSITION
    );
    const manualGenModeSelect = document.getElementById(
      UI_ELEMENT_IDS.MANUAL_GEN_MODE
    );
    const promptGenModeRegexRadio = document.getElementById(
      UI_ELEMENT_IDS.PROMPT_GENERATION_MODE_SHARED
    ) as HTMLInputElement;
    const promptGenModeLLMRadio = document.getElementById(
      UI_ELEMENT_IDS.PROMPT_GENERATION_MODE_INDEPENDENT
    ) as HTMLInputElement;
    const maxPromptsPerMessageInput = document.getElementById(
      UI_ELEMENT_IDS.MAX_PROMPTS_PER_MESSAGE
    ) as HTMLInputElement;
    const contextMessageCountInput = document.getElementById(
      UI_ELEMENT_IDS.CONTEXT_MESSAGE_COUNT
    ) as HTMLInputElement;
    const metaPromptDepthInput = document.getElementById(
      UI_ELEMENT_IDS.META_PROMPT_DEPTH
    ) as HTMLInputElement;
    const llmFrequencyGuidelinesTextarea = document.getElementById(
      UI_ELEMENT_IDS.LLM_FREQUENCY_GUIDELINES
    ) as HTMLTextAreaElement;
    const llmFrequencyGuidelinesResetButton = document.getElementById(
      UI_ELEMENT_IDS.LLM_FREQUENCY_GUIDELINES_RESET
    );
    const llmPromptWritingGuidelinesTextarea = document.getElementById(
      UI_ELEMENT_IDS.LLM_PROMPT_WRITING_GUIDELINES
    ) as HTMLTextAreaElement;
    const llmPromptWritingGuidelinesResetButton = document.getElementById(
      UI_ELEMENT_IDS.LLM_PROMPT_WRITING_GUIDELINES_RESET
    );
    const resetButton = document.getElementById(UI_ELEMENT_IDS.RESET_BUTTON);

    enabledCheckbox?.addEventListener('change', handleSettingsChange);
    presetSelect?.addEventListener('change', handlePresetChange);
    presetEditButton?.addEventListener('click', handlePresetEdit);
    presetSaveButton?.addEventListener('click', handlePresetSave);
    presetSaveAsButton?.addEventListener('click', handlePresetSaveAs);
    presetDeleteButton?.addEventListener('click', handlePresetDelete);
    presetCancelButton?.addEventListener('click', handlePresetCancel);
    streamingEnabledCheckbox?.addEventListener('change', handleSettingsChange);
    streamingPollIntervalInput?.addEventListener(
      'change',
      handleSettingsChange
    );
    maxConcurrentInput?.addEventListener('change', handleSettingsChange);
    minGenerationIntervalInput?.addEventListener(
      'change',
      handleSettingsChange
    );
    logLevelSelect?.addEventListener('change', handleSettingsChange);
    promptPatternsTextarea?.addEventListener('change', handleSettingsChange);
    promptPatternsResetButton?.addEventListener(
      'click',
      handlePromptPatternsReset
    );
    commonStyleTagsTextarea?.addEventListener('change', handleSettingsChange);
    commonStyleTagsPositionSelect?.addEventListener(
      'change',
      handleSettingsChange
    );
    manualGenModeSelect?.addEventListener('change', handleSettingsChange);
    promptGenModeRegexRadio?.addEventListener('change', () => {
      toggleIndependentApiSettingsVisibility();
      handleSettingsChange();
    });
    promptGenModeLLMRadio?.addEventListener('change', () => {
      toggleIndependentApiSettingsVisibility();
      handleSettingsChange();
    });
    maxPromptsPerMessageInput?.addEventListener('change', handleSettingsChange);
    contextMessageCountInput?.addEventListener('change', handleSettingsChange);
    metaPromptDepthInput?.addEventListener('change', handleSettingsChange);
    llmFrequencyGuidelinesTextarea?.addEventListener(
      'change',
      handleSettingsChange
    );
    llmFrequencyGuidelinesResetButton?.addEventListener(
      'click',
      handleLLMFrequencyGuidelinesReset
    );
    llmPromptWritingGuidelinesTextarea?.addEventListener(
      'change',
      handleSettingsChange
    );
    llmPromptWritingGuidelinesResetButton?.addEventListener(
      'click',
      handleLLMPromptWritingGuidelinesReset
    );

    const showGalleryWidgetCheckbox = document.getElementById(
      UI_ELEMENT_IDS.SHOW_GALLERY_WIDGET
    ) as HTMLInputElement;
    const showProgressWidgetCheckbox = document.getElementById(
      UI_ELEMENT_IDS.SHOW_PROGRESS_WIDGET
    ) as HTMLInputElement;
    showGalleryWidgetCheckbox?.addEventListener('change', handleSettingsChange);
    showProgressWidgetCheckbox?.addEventListener(
      'change',
      handleSettingsChange
    );

    resetButton?.addEventListener('click', handleResetSettings);

    // Update UI with loaded settings
    updateUI();
  }

  logger.info('Extension initialized successfully');

  // Set up extension prompt at the very end after everything is initialized
  // Register CHAT_CHANGED handler for any future cleanup if needed
  const CHAT_CHANGED = context.eventTypes.CHAT_CHANGED;

  context.eventSource.on(CHAT_CHANGED, () => {
    logger.info(
      'CHAT_CHANGED - cancelling all sessions and reloading settings'
    );

    // Metadata will be loaded fresh on next getMetadata() call
    // No need to explicitly refresh - getMetadata() always gets latest context

    // Cancel all active streaming sessions
    cancelAllSessions();

    // Clear progress widget state for new chat
    clearProgressWidgetState();

    // Reload settings from server to ensure sync across devices
    settings = loadSettings(context);
    setLogLevel(settings.logLevel);
    updateMaxConcurrent(settings.maxConcurrentGenerations);
    updateMinInterval(settings.minGenerationInterval);

    // Update UI with refreshed settings
    updateUI();

    // Re-add click handlers to all images when chat changes
    setTimeout(() => {
      addImageClickHandlers(settings);
    }, 100);
  });

  // Add click handlers to existing images
  addImageClickHandlers(settings);
}

// Initialize when extension loads
initialize();

// Expose gallery toggle function globally for easy access
// Users can call window.toggleImageGallery() from console
(window as any).toggleImageGallery = () => {
  const gallery = getGalleryWidget();
  if (gallery) {
    gallery.toggleVisibility();
    logger.info('Gallery visibility toggled via global function');
  } else {
    logger.warn('Gallery widget not initialized');
  }
};

// Expose gallery show function
(window as any).showImageGallery = () => {
  const gallery = getGalleryWidget();
  if (gallery) {
    gallery.show();
    logger.info('Gallery shown via global function');
  } else {
    logger.warn('Gallery widget not initialized');
  }
};

// Expose gallery hide function
(window as any).hideImageGallery = () => {
  const gallery = getGalleryWidget();
  if (gallery) {
    gallery.hide();
    logger.info('Gallery hidden via global function');
  } else {
    logger.warn('Gallery widget not initialized');
  }
};
