/**
 * Auto Illustrator Extension for SillyTavern
 * Automatically generates inline images based on story context
 */

import './style.css';
import {updateExtensionPrompt} from './prompt_injector';
import {createMessageHandler} from './message_handler';
import {
  loadSettings,
  saveSettings,
  getDefaultSettings,
  createSettingsUI,
} from './settings';

// Module state
let context: SillyTavernContext;
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

  console.log('[Auto Illustrator] Event handlers registered:', {
    MESSAGE_RECEIVED,
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
    const resetButton = document.getElementById('auto_illustrator_reset');

    enabledCheckbox?.addEventListener('change', handleSettingsChange);
    wordIntervalInput?.addEventListener('change', handleSettingsChange);
    metaPromptTextarea?.addEventListener('input', handleSettingsChange);
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
