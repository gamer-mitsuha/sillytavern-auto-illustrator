/**
 * Chat Change Operations Module
 *
 * Contains UI and settings operations that need to be executed when chat changes.
 * Extracted from index.ts to avoid circular dependencies with chat_changed_handler.
 */

import {createLogger, setLogLevel} from './logger';
import {loadSettings} from './settings';
import {clearProgressWidgetState} from './progress_widget';
import {getStreamingPreviewWidget} from './index';
import {addImageClickHandlers} from './manual_generation';

// Types are in globals.d.ts (no need to import)

const logger = createLogger('ChatChangeOps');

// Module-level state (shared with index.ts)
let currentSettings: AutoIllustratorSettings | null = null;
let currentContext: SillyTavernContext | null = null;

// References to functions that need to be called
let updateMaxConcurrentFn: ((max: number) => void) | null = null;
let updateMinIntervalFn: ((interval: number) => void) | null = null;
let updateUIFn: (() => void) | null = null;

/**
 * Initialize the module with current context and settings
 * Called once during extension initialization
 */
export function initializeChatChangeOperations(
  context: SillyTavernContext,
  settings: AutoIllustratorSettings,
  updateMaxConcurrent: (max: number) => void,
  updateMinInterval: (interval: number) => void,
  updateUI: () => void
): void {
  currentContext = context;
  currentSettings = settings;
  updateMaxConcurrentFn = updateMaxConcurrent;
  updateMinIntervalFn = updateMinInterval;
  updateUIFn = updateUI;

  logger.debug('Chat change operations module initialized');
}

/**
 * Get current settings (for external access)
 */
export function getCurrentSettings(): AutoIllustratorSettings | null {
  return currentSettings;
}

/**
 * Update current settings (called when settings are reloaded)
 */
export function updateCurrentSettings(settings: AutoIllustratorSettings): void {
  currentSettings = settings;
}

/**
 * Execute all chat change operations
 * Called by chat_changed_handler after metadata is loaded and sessions are cancelled
 */
export function executeChatChangeOperations(): void {
  if (!currentContext) {
    logger.error(
      'Cannot execute chat change operations: context not initialized'
    );
    return;
  }

  logger.debug('Executing chat change operations');

  try {
    // Step 1: Clear progress widget state for new chat
    logger.trace('Clearing progress widget state');
    clearProgressWidgetState();

    // Clear streaming preview widget state
    const previewWidget = getStreamingPreviewWidget();
    if (previewWidget) {
      logger.trace('Clearing streaming preview widget state');
      previewWidget.clearState();
    }

    // Step 2: Reload settings from server to ensure sync across devices
    logger.trace('Reloading settings from server');
    const newSettings = loadSettings(currentContext);
    currentSettings = newSettings;

    // Step 3: Apply settings
    logger.trace('Applying settings');
    setLogLevel(newSettings.logLevel);

    if (updateMaxConcurrentFn) {
      updateMaxConcurrentFn(newSettings.maxConcurrentGenerations);
    }

    if (updateMinIntervalFn) {
      updateMinIntervalFn(newSettings.minGenerationInterval);
    }

    // Step 4: Update UI with refreshed settings
    logger.trace('Updating UI');
    if (updateUIFn) {
      updateUIFn();
    }

    // Step 5: Re-add click handlers to all images when chat changes
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      logger.trace('Re-adding image click handlers');
      addImageClickHandlers(newSettings);
    }, 100);

    logger.debug('Chat change operations completed successfully');
  } catch (error) {
    logger.error('Error during chat change operations:', error);
    throw error;
  }
}
