/**
 * Auto Illustrator Extension for SillyTavern
 * Automatically generates inline images based on story context
 */

import './style.css';
import {updateExtensionPrompt} from './prompt_injector';
import {createMessageHandler} from './message_handler';
import {pruneGeneratedImages} from './chat_history_pruner';
import {ImageGenerationQueue} from './streaming_image_queue';
import {StreamingMonitor} from './streaming_monitor';
import {QueueProcessor} from './queue_processor';
import {insertImageIntoMessage} from './image_generator';
import {
  loadSettings,
  saveSettings,
  getDefaultSettings,
  createSettingsUI,
} from './settings';

// Module state
let context: SillyTavernContext;
let settings: AutoIllustratorSettings;

// Streaming state
let streamingQueue: ImageGenerationQueue | null = null;
let streamingMonitor: StreamingMonitor | null = null;
let queueProcessor: QueueProcessor | null = null;

/**
 * Updates the UI elements with current settings
 */
function updateUI(): void {
  const enabledCheckbox = document.getElementById(
    'auto_illustrator_enabled'
  ) as HTMLInputElement;
  const wordIntervalInput = document.getElementById(
    'auto_illustrator_word_interval'
  ) as HTMLInputElement;
  const metaPromptTextarea = document.getElementById(
    'auto_illustrator_meta_prompt'
  ) as HTMLTextAreaElement;
  const streamingEnabledCheckbox = document.getElementById(
    'auto_illustrator_streaming_enabled'
  ) as HTMLInputElement;
  const streamingPollIntervalInput = document.getElementById(
    'auto_illustrator_streaming_poll_interval'
  ) as HTMLInputElement;
  const maxConcurrentInput = document.getElementById(
    'auto_illustrator_max_concurrent'
  ) as HTMLInputElement;

  if (enabledCheckbox) enabledCheckbox.checked = settings.enabled;
  if (wordIntervalInput)
    wordIntervalInput.value = settings.wordInterval.toString();
  if (metaPromptTextarea) metaPromptTextarea.value = settings.metaPrompt;
  if (streamingEnabledCheckbox)
    streamingEnabledCheckbox.checked = settings.streamingEnabled;
  if (streamingPollIntervalInput)
    streamingPollIntervalInput.value =
      settings.streamingPollInterval.toString();
  if (maxConcurrentInput)
    maxConcurrentInput.value = settings.maxConcurrentGenerations.toString();
}

/**
 * Handles changes to settings from UI
 */
function handleSettingsChange(): void {
  const enabledCheckbox = document.getElementById(
    'auto_illustrator_enabled'
  ) as HTMLInputElement;
  const wordIntervalInput = document.getElementById(
    'auto_illustrator_word_interval'
  ) as HTMLInputElement;
  const metaPromptTextarea = document.getElementById(
    'auto_illustrator_meta_prompt'
  ) as HTMLTextAreaElement;
  const streamingEnabledCheckbox = document.getElementById(
    'auto_illustrator_streaming_enabled'
  ) as HTMLInputElement;
  const streamingPollIntervalInput = document.getElementById(
    'auto_illustrator_streaming_poll_interval'
  ) as HTMLInputElement;
  const maxConcurrentInput = document.getElementById(
    'auto_illustrator_max_concurrent'
  ) as HTMLInputElement;

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

  saveSettings(settings, context);

  // Update the extension prompt based on new settings
  updateExtensionPrompt(context, settings);

  console.log('[Auto Illustrator] Settings updated:', settings);
}

/**
 * Resets settings to defaults
 */
function handleResetSettings(): void {
  settings = getDefaultSettings();
  saveSettings(settings, context);
  updateUI();

  // Update the extension prompt with reset settings
  updateExtensionPrompt(context, settings);

  console.log('[Auto Illustrator] Settings reset to defaults');
}

/**
 * Handles GENERATION_STARTED event for streaming image generation
 */
function handleGenerationStarted(messageId: number): void {
  if (!settings.streamingEnabled || !settings.enabled) {
    console.log(
      '[Auto Illustrator] Streaming disabled, skipping streaming handler'
    );
    return;
  }

  console.log(
    `[Auto Illustrator] GENERATION_STARTED for message ${messageId}, initializing streaming`
  );

  // Clean up any previous streaming state
  if (streamingMonitor) {
    streamingMonitor.stop();
  }
  if (queueProcessor) {
    queueProcessor.stop();
  }

  // Initialize new streaming state
  streamingQueue = new ImageGenerationQueue();
  streamingMonitor = new StreamingMonitor(
    streamingQueue,
    context,
    settings.streamingPollInterval
  );
  queueProcessor = new QueueProcessor(
    streamingQueue,
    context,
    settings.maxConcurrentGenerations
  );

  // Start monitoring and processing
  streamingMonitor.start(messageId);
  queueProcessor.start(messageId, async (prompt, imageUrl, msgId) => {
    // Callback when image is generated - insert into message
    await insertImageIntoMessage(prompt, imageUrl, msgId, context);
    // Trigger processor to check for more work
    queueProcessor?.trigger();
  });

  console.log('[Auto Illustrator] Streaming monitor and processor started');
}

/**
 * Handles GENERATION_ENDED event
 */
async function handleGenerationEnded(): Promise<void> {
  if (!streamingMonitor || !queueProcessor || !streamingQueue) {
    return;
  }

  console.log('[Auto Illustrator] GENERATION_ENDED, cleaning up streaming');

  // Stop monitoring (no more new prompts)
  streamingMonitor.stop();

  // Process any remaining queued prompts
  await queueProcessor.processRemaining();

  // Stop processor
  queueProcessor.stop();

  // Log final statistics
  const stats = streamingQueue.getStats();
  console.log('[Auto Illustrator] Final streaming stats:', stats);

  // Show notification if there were issues
  const failedCount = stats.FAILED;
  if (failedCount > 0) {
    toastr.warning(
      `${failedCount} image${failedCount > 1 ? 's' : ''} failed to generate during streaming`,
      'Auto Illustrator'
    );
  }

  // Clear state
  streamingQueue = null;
  streamingMonitor = null;
  queueProcessor = null;
}

/**
 * Initializes the extension
 */
function initialize(): void {
  console.log('[Auto Illustrator] Initializing extension...');

  // Get SillyTavern context
  try {
    context = SillyTavern.getContext();
    console.log('[Auto Illustrator] Got SillyTavern context');
  } catch (error) {
    console.error(
      '[Auto Illustrator] Failed to get SillyTavern context:',
      error
    );
    return;
  }

  // Load settings
  settings = loadSettings(context);
  console.log('[Auto Illustrator] Loaded settings:', settings);

  // Create and register message handler
  const messageHandler = createMessageHandler(context);
  const MESSAGE_RECEIVED =
    context.eventTypes?.MESSAGE_RECEIVED || 'MESSAGE_RECEIVED';
  context.eventSource.on(MESSAGE_RECEIVED, messageHandler);

  // Register chat history pruner to remove generated images before sending to LLM
  const CHAT_COMPLETION_PROMPT_READY =
    context.eventTypes?.CHAT_COMPLETION_PROMPT_READY ||
    'CHAT_COMPLETION_PROMPT_READY';
  context.eventSource.on(CHAT_COMPLETION_PROMPT_READY, eventData => {
    if (eventData?.chat) {
      pruneGeneratedImages(eventData.chat);
    }
  });

  // Register streaming handlers
  const GENERATION_STARTED =
    context.eventTypes?.GENERATION_STARTED || 'GENERATION_STARTED';
  const GENERATION_ENDED =
    context.eventTypes?.GENERATION_ENDED || 'GENERATION_ENDED';

  context.eventSource.on(GENERATION_STARTED, handleGenerationStarted);
  context.eventSource.on(GENERATION_ENDED, handleGenerationEnded);

  console.log('[Auto Illustrator] Event handlers registered:', {
    MESSAGE_RECEIVED,
    CHAT_COMPLETION_PROMPT_READY,
    GENERATION_STARTED,
    GENERATION_ENDED,
  });

  // Inject settings UI
  const settingsContainer = document.getElementById('extensions_settings2');
  if (settingsContainer) {
    const settingsHTML = createSettingsUI();
    settingsContainer.insertAdjacentHTML('beforeend', settingsHTML);

    // Attach event listeners
    const enabledCheckbox = document.getElementById('auto_illustrator_enabled');
    const wordIntervalInput = document.getElementById(
      'auto_illustrator_word_interval'
    );
    const metaPromptTextarea = document.getElementById(
      'auto_illustrator_meta_prompt'
    );
    const streamingEnabledCheckbox = document.getElementById(
      'auto_illustrator_streaming_enabled'
    );
    const streamingPollIntervalInput = document.getElementById(
      'auto_illustrator_streaming_poll_interval'
    );
    const maxConcurrentInput = document.getElementById(
      'auto_illustrator_max_concurrent'
    );
    const resetButton = document.getElementById('auto_illustrator_reset');

    enabledCheckbox?.addEventListener('change', handleSettingsChange);
    wordIntervalInput?.addEventListener('change', handleSettingsChange);
    metaPromptTextarea?.addEventListener('input', handleSettingsChange);
    streamingEnabledCheckbox?.addEventListener('change', handleSettingsChange);
    streamingPollIntervalInput?.addEventListener(
      'change',
      handleSettingsChange
    );
    maxConcurrentInput?.addEventListener('change', handleSettingsChange);
    resetButton?.addEventListener('click', handleResetSettings);

    // Update UI with loaded settings
    updateUI();
  }

  console.log('[Auto Illustrator] Extension initialized successfully');

  // Set up extension prompt at the very end after everything is initialized
  // We need to call this when a chat is loaded, not just at init
  const CHAT_CHANGED = context.eventTypes?.CHAT_CHANGED;

  context.eventSource.on(CHAT_CHANGED, () => {
    console.log(
      '[Auto Illustrator] CHAT_CHANGED - reapplying extension prompt'
    );
    updateExtensionPrompt(context, settings);
  });

  // Also set it now for any already-loaded chat
  updateExtensionPrompt(context, settings);
}

// Initialize when extension loads
initialize();
