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
import type {DeferredImage} from './types';
import {
  loadSettings,
  saveSettings,
  getDefaultSettings,
  createSettingsUI,
} from './settings';
import {createLogger} from './logger';

const logger = createLogger('Main');

// Module state
let context: SillyTavernContext;
let settings: AutoIllustratorSettings;

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

  logger.info('Settings updated:', settings);
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

  logger.info('Settings reset to defaults');
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

  logger.info(
    `First stream token received, starting streaming for message ${messageId}`
  );

  // Clean up any previous streaming state
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
  if (!streamingMonitor || !queueProcessor || !streamingQueue) {
    return;
  }

  logger.info('GENERATION_ENDED, cleaning up streaming');

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
  const STREAM_TOKEN_RECEIVED =
    context.eventTypes?.STREAM_TOKEN_RECEIVED || 'STREAM_TOKEN_RECEIVED';
  const GENERATION_ENDED =
    context.eventTypes?.GENERATION_ENDED || 'GENERATION_ENDED';

  context.eventSource.on(STREAM_TOKEN_RECEIVED, handleFirstStreamToken);
  context.eventSource.on(GENERATION_ENDED, handleGenerationEnded);

  logger.info('Event handlers registered:', {
    MESSAGE_RECEIVED,
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

  logger.info('Extension initialized successfully');

  // Set up extension prompt at the very end after everything is initialized
  // We need to call this when a chat is loaded, not just at init
  const CHAT_CHANGED = context.eventTypes?.CHAT_CHANGED;

  context.eventSource.on(CHAT_CHANGED, () => {
    logger.info('CHAT_CHANGED - reapplying extension prompt');
    updateExtensionPrompt(context, settings);
  });

  // Also set it now for any already-loaded chat
  updateExtensionPrompt(context, settings);
}

// Initialize when extension loads
initialize();
