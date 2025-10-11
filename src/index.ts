/**
 * Auto Illustrator Extension for SillyTavern
 * Automatically generates inline images based on story context
 */

import './style.css';
import {createMessageHandler} from './message_handler';
import {pruneGeneratedImages} from './chat_history_pruner';
import {SessionManager} from './session_manager';
import {insertDeferredImages} from './image_generator';
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
} from './constants';
import {
  getPresetById,
  isPresetPredefined,
  isPredefinedPresetName,
} from './meta_prompt_presets';
import {
  addManualGenerationButton,
  addImageClickHandlers,
} from './manual_generation';
import {
  initializeConcurrencyLimiter,
  updateMaxConcurrent,
  updateMinInterval,
} from './image_generator';
import {initializeI18n, t} from './i18n';
import {extractImagePromptsMultiPattern} from './regex';

const logger = createLogger('Main');

// Module state
let context: SillyTavernContext;
let settings: AutoIllustratorSettings;
let isEditingPreset = false; // Track if user is currently editing a preset

// Generation state
export let currentGenerationType: string | null = null; // Track generation type for filtering

// Streaming state - managed by SessionManager
let sessionManager: SessionManager;

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

  // Apply log level
  setLogLevel(settings.logLevel);

  // Update concurrency limiter settings
  updateMaxConcurrent(settings.maxConcurrentGenerations);
  updateMinInterval(settings.minGenerationInterval);

  saveSettings(settings, context);

  // Update validation status after settings change
  updateValidationStatus();

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
 * Handles first streaming token to initialize streaming for the correct message
 * STREAM_TOKEN_RECEIVED fires during streaming, so message definitely exists
 * This is more reliable than GENERATION_STARTED which fires before message creation
 */
function handleFirstStreamToken(): void {
  const messageId = context.chat.length - 1;

  if (!settings.streamingEnabled) {
    logger.debug('Streaming disabled, skipping');
    return;
  }

  if (!settings.enabled) {
    logger.debug('Extension disabled, skipping streaming');
    return;
  }

  const message = context.chat?.[messageId];
  if (!message) {
    logger.error('Message not found:', messageId);
    return;
  }

  if (message.is_user || message.is_system) {
    return;
  }

  // Note: DOM queue will automatically serialize with any manual generation operations

  // Check if already streaming this message
  if (sessionManager.isActive(messageId)) {
    logger.debug('Already streaming this message, ignoring duplicate token');
    return;
  }

  logger.debug(
    `First token received for message ${messageId}, starting streaming`
  );
  currentGenerationType = 'streaming';

  // Start new session (cancels existing if any)
  const session = sessionManager.startSession(messageId, context, settings);

  logger.debug(
    `Streaming monitor and processor started for session ${session.sessionId}`
  );
}

/**
 * Handles MESSAGE_RECEIVED event when in streaming mode
 * Signals that the message has been finalized and deferred images can be inserted
 * @param messageId - ID of the message that was received
 * @param type - Type of generation (e.g., 'normal', 'regenerate', 'swipe')
 */
export function handleMessageReceivedForStreaming(
  messageId: number,
  type: string
): void {
  logger.debug(
    `MESSAGE_RECEIVED event for message ${messageId}, type: ${type}`
  );

  const session = sessionManager.getSession(messageId);
  if (!session) {
    logger.debug(`No active session for message ${messageId}`);
    return;
  }

  logger.debug(`MESSAGE_RECEIVED for message ${messageId}, signaling barrier`);
  session.barrier.arrive('messageReceived');
}

/**
 * Handles GENERATION_ENDED event
 * @param chatLength - Length of chat array when event fired (messageId = chatLength - 1)
 */
async function handleGenerationEnded(chatLength: number): Promise<void> {
  currentGenerationType = null;

  // GENERATION_ENDED passes chat.length, so messageId is chat.length - 1
  const messageId = chatLength - 1;
  logger.debug(
    `GENERATION_ENDED event (chatLength: ${chatLength}, messageId: ${messageId})`
  );

  const session = sessionManager.getSession(messageId);
  if (!session) {
    logger.debug(`No active session for message ${messageId}`);
    return;
  }

  logger.debug(`GENERATION_ENDED for message ${messageId}, finalizing session`);

  const {sessionId, barrier, monitor, processor, queue} = session;

  // Final scan for any remaining prompts
  monitor.finalScan();

  // Stop monitoring (no more new prompts)
  monitor.stop();

  // Process remaining prompts and signal barrier
  await processor.processRemaining();
  // Note: processor.processRemaining() calls barrier.arrive('genDone')

  // Get deferred images
  const deferredImages = processor.getDeferredImages();
  logger.debug(`${deferredImages.length} images ready for insertion`);

  // Stop processor
  processor.stop();

  // Log stats
  const stats = queue.getStats();
  logger.debug('Final stats:', stats);

  // Wait for barrier and insert deferred images
  if (deferredImages.length > 0) {
    // Don't wrap in scheduleDomOperation - insertDeferredImages does that internally
    // Wrapping would cause deadlock since DOM ops for same message are serialized
    (async () => {
      logger.debug('Waiting for barrier (genDone + messageReceived)...');

      try {
        await barrier.whenReady;
        logger.debug('Barrier resolved, inserting deferred images');

        // Check session still current (not cancelled)
        const currentSession = sessionManager.getSession(messageId);
        logger.debug(
          `Session check for message ${messageId}: current=${currentSession?.sessionId}, expected=${sessionId}`
        );

        if (currentSession?.sessionId !== sessionId) {
          logger.warn(
            `Session changed for message ${messageId}, skipping insertion (current: ${currentSession?.sessionId}, expected: ${sessionId})`
          );
          return;
        }

        // Insert images (this internally uses scheduleDomOperation)
        logger.debug(
          `Inserting ${deferredImages.length} deferred images for message ${messageId}`
        );
        await insertDeferredImages(deferredImages, messageId, context);

        logger.debug('Deferred images inserted successfully');

        // End session after successful insertion
        sessionManager.endSession(messageId);
        logger.debug(
          `Session ended for message ${messageId} after successful insertion`
        );
      } catch (error) {
        logger.error('Barrier failed or insertion error:', error);
        toastr.error('Failed to insert generated images', t('extensionName'));

        // End session even on error
        sessionManager.endSession(messageId);
        logger.debug('Session ended after error');
      }
    })();
  } else {
    // No deferred images, end session immediately
    sessionManager.endSession(messageId);
    logger.debug(`Session ended for message ${messageId} (no deferred images)`);
  }

  // Show notification if failures
  if (stats.FAILED > 0) {
    toastr.warning(
      t('toast.streamingFailed', {count: stats.FAILED}),
      t('extensionName')
    );
  }
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

  // Load settings
  settings = loadSettings(context);
  logger.info('Loaded settings:', settings);

  // Apply log level from settings
  setLogLevel(settings.logLevel);

  // Initialize SessionManager
  sessionManager = new SessionManager();
  logger.info('Initialized SessionManager');

  // Initialize concurrency limiter with settings
  initializeConcurrencyLimiter(
    settings.maxConcurrentGenerations,
    settings.minGenerationInterval
  );
  logger.info(
    `Initialized concurrency limiter: max=${settings.maxConcurrentGenerations}, minInterval=${settings.minGenerationInterval}ms`
  );

  // Create and register message handler
  const messageHandler = createMessageHandler(context, settings);
  const MESSAGE_RECEIVED = context.eventTypes.MESSAGE_RECEIVED;
  context.eventSource.on(MESSAGE_RECEIVED, messageHandler);

  // Add manual generation button to new messages and add click handlers to images
  context.eventSource.on(MESSAGE_RECEIVED, (messageId: number) => {
    // Use setTimeout to ensure DOM is updated
    setTimeout(() => {
      const $mes = $(`.mes[mesid="${messageId}"]`);
      if ($mes.length > 0) {
        addManualGenerationButton($mes, messageId, context, settings);
      }
      // Add click handlers to all images (including newly added ones)
      addImageClickHandlers(context, settings);
    }, 100);
  });

  // Add click handlers when messages are updated (e.g., after deferred image insertion)
  const MESSAGE_UPDATED = context.eventTypes.MESSAGE_UPDATED;
  context.eventSource.on(MESSAGE_UPDATED, () => {
    // Use setTimeout to ensure DOM is fully updated
    setTimeout(() => {
      addImageClickHandlers(context, settings);
    }, 100);
  });

  // Register GENERATION_STARTED to track generation type
  const GENERATION_STARTED = context.eventTypes.GENERATION_STARTED;
  context.eventSource.on(
    GENERATION_STARTED,
    (type: string, _options: unknown, dryRun: boolean) => {
      // Skip dry runs (token counting/preview)
      if (dryRun) {
        logger.debug('Generation started (dry run), skipping type tracking', {
          type,
        });
        return;
      }

      currentGenerationType = type;
      logger.info('Generation started (actual)', {type});
    }
  );

  // Register CHAT_COMPLETION_PROMPT_READY handler for pruning and meta-prompt injection
  const CHAT_COMPLETION_PROMPT_READY =
    context.eventTypes.CHAT_COMPLETION_PROMPT_READY;
  context.eventSource.on(CHAT_COMPLETION_PROMPT_READY, eventData => {
    // Skip if this is a dry run (token counting, not actual generation)
    if (eventData?.dryRun) {
      logger.info('Skipping prompt ready processing for dry run');
      return;
    }

    if (!eventData?.chat) {
      return;
    }

    // Prune generated images from chat history
    pruneGeneratedImages(eventData.chat);

    // Inject meta-prompt as last system message (if enabled and appropriate)
    // If currentGenerationType is null (e.g., timing issue on first message),
    // assume 'normal' type to ensure meta-prompt is injected by default.
    // Only skip for quiet and impersonate types.
    const effectiveType = currentGenerationType || 'normal';
    const shouldInject =
      settings.enabled &&
      settings.metaPrompt &&
      !['quiet', 'impersonate'].includes(effectiveType);

    if (shouldInject) {
      logger.info('Injecting meta-prompt as last system message', {
        currentGenerationType,
        effectiveType,
        metaPromptLength: settings.metaPrompt.length,
      });

      eventData.chat.push({
        role: 'system',
        content: settings.metaPrompt,
      });
    } else {
      logger.info('Skipping meta-prompt injection', {
        enabled: settings.enabled,
        hasMetaPrompt: !!settings.metaPrompt,
        currentGenerationType,
        effectiveType,
        reason: !settings.enabled
          ? 'extension disabled'
          : !settings.metaPrompt
            ? 'no meta-prompt'
            : `generation type is ${effectiveType}`,
      });
    }
  });

  // Register streaming handlers
  const STREAM_TOKEN_RECEIVED = context.eventTypes.STREAM_TOKEN_RECEIVED;
  const GENERATION_ENDED = context.eventTypes.GENERATION_ENDED;

  context.eventSource.on(STREAM_TOKEN_RECEIVED, handleFirstStreamToken);
  context.eventSource.on(GENERATION_ENDED, handleGenerationEnded);

  logger.info('Event handlers registered:', {
    MESSAGE_RECEIVED,
    MESSAGE_UPDATED,
    GENERATION_STARTED,
    CHAT_COMPLETION_PROMPT_READY,
    STREAM_TOKEN_RECEIVED,
    GENERATION_ENDED,
  });

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

    // Cancel all active streaming sessions
    cancelAllSessions();

    // Reload settings from server to ensure sync across devices
    settings = loadSettings(context);
    setLogLevel(settings.logLevel);
    updateMaxConcurrent(settings.maxConcurrentGenerations);
    updateMinInterval(settings.minGenerationInterval);

    // Update UI with refreshed settings
    updateUI();

    // Re-add buttons to all messages when chat changes
    setTimeout(() => {
      addButtonsToExistingMessages();
      // Re-add click handlers to all images
      addImageClickHandlers(context, settings);
    }, 100);
  });

  // Add manual generation buttons to existing messages
  addButtonsToExistingMessages();
  // Add click handlers to existing images
  addImageClickHandlers(context, settings);
}

/**
 * Adds manual generation buttons to all existing messages in the chat
 */
function addButtonsToExistingMessages(): void {
  logger.debug('Adding manual generation buttons to existing messages');

  $('.mes').each((_index: number, element: HTMLElement) => {
    const $mes = $(element);
    const mesId = $mes.attr('mesid');

    if (mesId) {
      const messageId = parseInt(mesId, 10);
      if (!isNaN(messageId)) {
        addManualGenerationButton($mes, messageId, context, settings);
      }
    }
  });
}

// Initialize when extension loads
initialize();
