/**
 * Auto Illustrator Extension for SillyTavern
 * Automatically generates inline images based on story context
 */

import './style.css';
import {injectPrompt} from './prompt_injector';
import {createMessageHandler} from './message_handler';
import {
  loadSettings,
  saveSettings,
  getDefaultSettings,
  createSettingsUI,
} from './settings';

// Module state
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let context: any;
let settings: AutoIllustratorSettings;

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

  if (enabledCheckbox) enabledCheckbox.checked = settings.enabled;
  if (wordIntervalInput)
    wordIntervalInput.value = settings.wordInterval.toString();
  if (metaPromptTextarea) metaPromptTextarea.value = settings.metaPrompt;
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

  settings.enabled = enabledCheckbox?.checked ?? settings.enabled;
  settings.wordInterval = wordIntervalInput
    ? parseInt(wordIntervalInput.value)
    : settings.wordInterval;
  settings.metaPrompt = metaPromptTextarea?.value ?? settings.metaPrompt;

  saveSettings(settings, context);

  console.log('[Auto Illustrator] Settings updated:', settings);
}

/**
 * Resets settings to defaults
 */
function handleResetSettings(): void {
  settings = getDefaultSettings();
  saveSettings(settings, context);
  updateUI();
  console.log('[Auto Illustrator] Settings reset to defaults');
}

/**
 * Initializes the extension
 */
function initialize(): void {
  console.log('[Auto Illustrator] Initializing extension...');

  // Get SillyTavern context
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context = (globalThis as any).SillyTavern.getContext();
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

  // Register message handler
  const messageHandler = createMessageHandler(context);
  console.log('[Auto Illustrator] Registering MESSAGE_RECEIVED event handler');

  // Verify event source and event types exist
  console.log('[Auto Illustrator] EventSource exists:', !!context.eventSource);
  console.log(
    '[Auto Illustrator] EventSource.on exists:',
    typeof context.eventSource?.on
  );
  console.log('[Auto Illustrator] eventTypes exists:', !!context.eventTypes);
  console.log(
    '[Auto Illustrator] MESSAGE_RECEIVED value:',
    context.eventTypes?.MESSAGE_RECEIVED
  );

  // Use event_types.MESSAGE_RECEIVED instead of string literal
  const MESSAGE_RECEIVED =
    context.eventTypes?.MESSAGE_RECEIVED || 'MESSAGE_RECEIVED';
  context.eventSource.on(MESSAGE_RECEIVED, messageHandler);
  console.log(
    '[Auto Illustrator] Event handler registered for event:',
    MESSAGE_RECEIVED
  );

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
    const resetButton = document.getElementById('auto_illustrator_reset');

    enabledCheckbox?.addEventListener('change', handleSettingsChange);
    wordIntervalInput?.addEventListener('change', handleSettingsChange);
    metaPromptTextarea?.addEventListener('input', handleSettingsChange);
    resetButton?.addEventListener('click', handleResetSettings);

    // Update UI with loaded settings
    updateUI();
  }

  console.log('[Auto Illustrator] Extension initialized successfully');
}

/**
 * Global prompt interceptor function called by SillyTavern
 * This is referenced in manifest.json as generate_interceptor
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
/**
 * Generate interceptor for Auto Illustrator.
 * Injects meta-prompt to instruct the LLM to generate image prompts.
 * @param {any[]} chat Chat messages
 * @param {number} _ Context size (unused)
 * @param {function(boolean): void} _abort Abort generation function (unused)
 * @param {string} type Type of the generation
 */
(globalThis as any).autoIllustratorPromptInterceptor = function (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chat: any[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  _abort: any,
  type: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): void {
  // Skip quiet mode and other special types
  if (type === 'quiet' || type === 'continue' || type === 'impersonate') {
    return;
  }

  if (!settings) {
    console.log('[Auto Illustrator] Settings not initialized');
    return;
  }

  if (!settings.enabled) {
    return;
  }

  if (!chat || chat.length === 0) {
    return;
  }

  // Log for debugging
  console.log(
    '[Auto Illustrator] Interceptor called, type:',
    type,
    'chat length:',
    chat.length
  );

  // Inject meta-prompt into chat (modifies in-place)
  injectPrompt(chat, settings);

  console.log('[Auto Illustrator] Meta-prompt injected');
};

// Initialize when extension loads
initialize();
