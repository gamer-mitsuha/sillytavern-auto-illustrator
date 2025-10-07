/**
 * Auto Illustrator Extension for SillyTavern
 * Automatically generates inline images based on story context
 */

import './style.css';
import {createMessageHandler} from './message_handler';
import {pruneGeneratedImages} from './chat_history_pruner';
import {ImageGenerationQueue} from './streaming_image_queue';
import {StreamingMonitor} from './streaming_monitor';
import {QueueProcessor} from './queue_processor';
import type {DeferredImage} from './types';
import {
  loadSettings,
  saveSettings,
  getDefaultSettings,
  createSettingsUI,
} from './settings';
import {createLogger, setLogLevel} from './logger';
import {UI_ELEMENT_IDS} from './constants';
import {
  getPresetById,
  isPresetPredefined,
  isPredefinedPresetName,
} from './meta_prompt_presets';
import {addManualGenerationButton} from './manual_generation';

const logger = createLogger('Main');

// Module state
let context: SillyTavernContext;
let settings: AutoIllustratorSettings;
let isEditingPreset = false; // Track if user is currently editing a preset

// Generation state
let currentGenerationType: string | null = null; // Track generation type for filtering

// Streaming state
let pendingDeferredImages: {images: DeferredImage[]; messageId: number} | null =
  null;
let messageReceivedFired = false; // Track if MESSAGE_RECEIVED has fired
let streamingQueue: ImageGenerationQueue | null = null;
let streamingMonitor: StreamingMonitor | null = null;
let queueProcessor: QueueProcessor | null = null;
let currentStreamingMessageId: number | null = null; // Track which message is being streamed

/**
 * Updates the UI elements with current settings
 */
function updateUI(): void {
  const enabledCheckbox = document.getElementById(
    UI_ELEMENT_IDS.ENABLED
  ) as HTMLInputElement;
  const wordIntervalInput = document.getElementById(
    UI_ELEMENT_IDS.WORD_INTERVAL
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
  const logLevelSelect = document.getElementById(
    UI_ELEMENT_IDS.LOG_LEVEL
  ) as HTMLSelectElement;

  // Update basic settings
  if (enabledCheckbox) enabledCheckbox.checked = settings.enabled;
  if (wordIntervalInput)
    wordIntervalInput.value = settings.wordInterval.toString();
  if (streamingEnabledCheckbox)
    streamingEnabledCheckbox.checked = settings.streamingEnabled;
  if (streamingPollIntervalInput)
    streamingPollIntervalInput.value =
      settings.streamingPollInterval.toString();
  if (maxConcurrentInput)
    maxConcurrentInput.value = settings.maxConcurrentGenerations.toString();
  if (logLevelSelect) logLevelSelect.value = settings.logLevel;

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
}

/**
 * Handles changes to settings from UI
 */
function handleSettingsChange(): void {
  const enabledCheckbox = document.getElementById(
    UI_ELEMENT_IDS.ENABLED
  ) as HTMLInputElement;
  const wordIntervalInput = document.getElementById(
    UI_ELEMENT_IDS.WORD_INTERVAL
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
  const logLevelSelect = document.getElementById(
    UI_ELEMENT_IDS.LOG_LEVEL
  ) as HTMLSelectElement;

  settings.enabled = enabledCheckbox?.checked ?? settings.enabled;
  settings.wordInterval = wordIntervalInput
    ? parseInt(wordIntervalInput.value)
    : settings.wordInterval;
  settings.metaPrompt = metaPromptTextarea?.value ?? settings.metaPrompt;
  settings.streamingEnabled =
    streamingEnabledCheckbox?.checked ?? settings.streamingEnabled;
  settings.streamingPollInterval = streamingPollIntervalInput
    ? parseInt(streamingPollIntervalInput.value)
    : settings.streamingPollInterval;
  settings.maxConcurrentGenerations = maxConcurrentInput
    ? parseInt(maxConcurrentInput.value)
    : settings.maxConcurrentGenerations;
  settings.logLevel =
    (logLevelSelect?.value as AutoIllustratorSettings['logLevel']) ??
    settings.logLevel;

  // Apply log level
  setLogLevel(settings.logLevel);

  saveSettings(settings, context);

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
    toastr.error(
      'Cannot save changes to predefined presets. Use "Save As" to create a custom preset.',
      'Auto Illustrator'
    );
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
    toastr.error('Preset not found', 'Auto Illustrator');
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
  toastr.success('Preset saved', 'Auto Illustrator');
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
  const name = prompt('Enter name for new preset:');

  if (!name || name.trim() === '') {
    return;
  }

  const trimmedName = name.trim();

  // Check if name is a predefined preset name
  if (isPredefinedPresetName(trimmedName)) {
    toastr.error(
      'Cannot use predefined preset names (Default, NAI 4.5 Full)',
      'Auto Illustrator'
    );
    return;
  }

  // Check if name already exists in custom presets
  const existingPreset = settings.customPresets.find(
    p => p.name === trimmedName
  );

  if (existingPreset) {
    const overwrite = confirm(`Overwrite existing preset '${trimmedName}'?`);
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
  toastr.success(`Preset '${trimmedName}' saved`, 'Auto Illustrator');
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
    toastr.error('Cannot delete predefined presets', 'Auto Illustrator');
    return;
  }

  const preset = settings.customPresets.find(
    p => p.id === settings.currentPresetId
  );
  if (!preset) {
    toastr.error('Preset not found', 'Auto Illustrator');
    return;
  }

  const confirmDelete = confirm(`Delete preset '${preset.name}'?`);
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

  toastr.success(`Preset '${preset.name}' deleted`, 'Auto Illustrator');
  logger.info('Preset deleted:', preset.name);
}

/**
 * Handles first streaming token to initialize streaming for the correct message
 * STREAM_TOKEN_RECEIVED fires during streaming, so message definitely exists
 * This is more reliable than GENERATION_STARTED which fires before message creation
 */
function handleFirstStreamToken(_text: string): void {
  // Only initialize once per stream
  if (streamingMonitor?.isActive()) {
    return;
  }

  if (!settings.streamingEnabled || !settings.enabled) {
    return;
  }

  // Find the last assistant message - this is the one being streamed
  if (!context.chat || context.chat.length === 0) {
    return;
  }

  const messageId = context.chat.length - 1;
  const message = context.chat[messageId];

  // Verify it's an assistant message
  if (message.is_user || message.is_system) {
    return;
  }

  // Don't restart if already monitoring this message
  // This prevents recreating the processor and losing deferred images
  if (streamingMonitor && currentStreamingMessageId === messageId) {
    logger.debug(
      `Already monitoring message ${messageId}, skipping reinitialization`
    );
    return;
  }

  logger.info(
    `First stream token received, starting streaming for message ${messageId}`
  );

  // Clean up any previous streaming state (different message)
  if (streamingMonitor) {
    streamingMonitor.stop();
  }
  if (queueProcessor) {
    queueProcessor.stop();
  }

  // Initialize streaming
  streamingQueue = new ImageGenerationQueue();
  queueProcessor = new QueueProcessor(
    streamingQueue,
    context,
    settings.maxConcurrentGenerations
  );

  streamingMonitor = new StreamingMonitor(
    streamingQueue,
    context,
    settings.streamingPollInterval,
    () => queueProcessor?.trigger()
  );

  currentStreamingMessageId = messageId;
  messageReceivedFired = false; // Reset flag for new streaming session
  pendingDeferredImages = null;

  streamingMonitor.start(messageId);
  // Start processor (images generated during streaming, inserted in batch after completion)
  queueProcessor.start(messageId);

  logger.info('Streaming monitor and processor started');
}

/**
 * Attempts to insert deferred images if both conditions are met:
 * 1. All images have been generated (pendingDeferredImages exists)
 * 2. MESSAGE_RECEIVED has fired (messageReceivedFired is true)
 */
async function tryInsertDeferredImages(): Promise<void> {
  if (pendingDeferredImages && messageReceivedFired) {
    const {images, messageId} = pendingDeferredImages;
    logger.info(
      `Both conditions met, inserting ${images.length} deferred images`
    );

    // Clear flags before insertion
    pendingDeferredImages = null;
    messageReceivedFired = false;

    // Import and call insertDeferredImages
    const {insertDeferredImages} = await import('./image_generator');
    await insertDeferredImages(images, messageId, context);
  }
}

/**
 * Handles GENERATION_ENDED event
 */
async function handleGenerationEnded(): Promise<void> {
  // Clear generation type to prevent stale state
  currentGenerationType = null;
  logger.debug('Generation ended, cleared generation type');

  if (!streamingMonitor || !queueProcessor || !streamingQueue) {
    return;
  }

  logger.info('GENERATION_ENDED, cleaning up streaming');

  // Do one final scan to catch any prompts added at the very end
  streamingMonitor.finalScan();

  // Stop monitoring (no more new prompts)
  streamingMonitor.stop();

  // Process any remaining queued prompts
  await queueProcessor.processRemaining();

  // Get deferred images and message ID before clearing state
  const deferredImages = queueProcessor.getDeferredImages();
  const messageId = currentStreamingMessageId;

  // Log final statistics
  const stats = streamingQueue.getStats();
  logger.info('Final streaming stats:', stats);
  logger.info(
    `Deferred images count: ${deferredImages.length} for message ${messageId}`
  );

  // Stop processor
  queueProcessor.stop();

  // Store deferred images
  if (deferredImages.length > 0 && messageId !== null) {
    pendingDeferredImages = {images: deferredImages, messageId};
    logger.info(
      `${deferredImages.length} images ready, checking if MESSAGE_RECEIVED fired`
    );
  }

  // Clear state
  streamingQueue = null;
  streamingMonitor = null;
  queueProcessor = null;
  currentStreamingMessageId = null;

  // Show notification if there were issues
  const failedCount = stats.FAILED;
  if (failedCount > 0) {
    toastr.warning(
      `${failedCount} image${failedCount > 1 ? 's' : ''} failed to generate during streaming`,
      'Auto Illustrator'
    );
  }

  // Try to insert if MESSAGE_RECEIVED already fired
  await tryInsertDeferredImages();
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

  // Load settings
  settings = loadSettings(context);
  logger.info('Loaded settings:', settings);

  // Apply log level from settings
  setLogLevel(settings.logLevel);

  // Create and register message handler with streaming check
  const isMessageBeingStreamed = (messageId: number) =>
    currentStreamingMessageId === messageId;
  const getPendingDeferredImages = () => {
    // Mark MESSAGE_RECEIVED as fired and try insertion
    logger.info('MESSAGE_RECEIVED callback invoked, setting flag');
    messageReceivedFired = true;
    tryInsertDeferredImages(); // Try to insert if images are ready
    return null; // We don't return pending images anymore
  };
  const messageHandler = createMessageHandler(
    context,
    isMessageBeingStreamed,
    settings,
    getPendingDeferredImages
  );
  const MESSAGE_RECEIVED = context.eventTypes.MESSAGE_RECEIVED;
  context.eventSource.on(MESSAGE_RECEIVED, messageHandler);

  // Add manual generation button to new messages
  context.eventSource.on(MESSAGE_RECEIVED, (messageId: number) => {
    // Use setTimeout to ensure DOM is updated
    setTimeout(() => {
      const $mes = $(`.mes[mesid="${messageId}"]`);
      if ($mes.length > 0) {
        addManualGenerationButton($mes, messageId, context, settings);
      }
    }, 100);
  });

  // Register GENERATION_STARTED to track generation type
  const GENERATION_STARTED = context.eventTypes.GENERATION_STARTED;
  context.eventSource.on(GENERATION_STARTED, (type: string) => {
    currentGenerationType = type;
    logger.debug('Generation started', {type});
  });

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
    // Skip for quiet and impersonate generation types
    if (
      settings.enabled &&
      settings.metaPrompt &&
      currentGenerationType &&
      !['quiet', 'impersonate'].includes(currentGenerationType)
    ) {
      logger.info('Injecting meta-prompt as last system message', {
        generationType: currentGenerationType,
        metaPromptLength: settings.metaPrompt.length,
      });

      eventData.chat.push({
        role: 'system',
        content: settings.metaPrompt,
      });
    } else {
      logger.debug('Skipping meta-prompt injection', {
        enabled: settings.enabled,
        hasMetaPrompt: !!settings.metaPrompt,
        generationType: currentGenerationType,
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
    const wordIntervalInput = document.getElementById(
      UI_ELEMENT_IDS.WORD_INTERVAL
    );
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
    const logLevelSelect = document.getElementById(UI_ELEMENT_IDS.LOG_LEVEL);
    const resetButton = document.getElementById(UI_ELEMENT_IDS.RESET_BUTTON);

    enabledCheckbox?.addEventListener('change', handleSettingsChange);
    wordIntervalInput?.addEventListener('change', handleSettingsChange);
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
    logLevelSelect?.addEventListener('change', handleSettingsChange);
    resetButton?.addEventListener('click', handleResetSettings);

    // Update UI with loaded settings
    updateUI();
  }

  logger.info('Extension initialized successfully');

  // Set up extension prompt at the very end after everything is initialized
  // Register CHAT_CHANGED handler for any future cleanup if needed
  const CHAT_CHANGED = context.eventTypes.CHAT_CHANGED;

  context.eventSource.on(CHAT_CHANGED, () => {
    logger.info('CHAT_CHANGED');
    // Re-add buttons to all messages when chat changes
    setTimeout(() => addButtonsToExistingMessages(), 100);
  });

  // Add manual generation buttons to existing messages
  addButtonsToExistingMessages();
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
