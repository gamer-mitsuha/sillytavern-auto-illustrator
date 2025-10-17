/**
 * Centralized CHAT_CHANGED event handler
 *
 * This module owns the single CHAT_CHANGED listener and orchestrates
 * all cleanup/reload operations in the correct order to prevent race conditions.
 *
 * Execution Order:
 * 1. Load fresh metadata from new chat
 * 2. Cancel all active streaming sessions
 * 3. Execute UI/settings operations (clear state, reload settings, update UI)
 * 4. Reload gallery widget for new chat
 */

import {createLogger} from './logger';
import {loadMetadataFromContext} from './metadata';
import {sessionManager} from './session_manager';
import {executeChatChangeOperations} from './chat_change_operations';
import {reloadGalleryForNewChat} from './gallery_widget';

const logger = createLogger('ChatChangedHandler');

// Types are in globals.d.ts (no need to import)
// SillyTavern global is also declared in globals.d.ts

/**
 * Single CHAT_CHANGED handler - executes operations in strict order
 */
function handleChatChanged(): void {
  logger.info('=== CHAT_CHANGED Event Fired ===');

  try {
    // Step 1: Load fresh metadata FIRST (must happen before anything else)
    logger.debug('1. Loading fresh metadata from new chat');
    loadMetadataFromContext();

    // Step 2: Cancel all active streaming sessions
    logger.debug('2. Cancelling all active streaming sessions');
    const activeSessions = sessionManager.getAllSessions();
    if (activeSessions.length > 0) {
      logger.info(`Cancelling ${activeSessions.length} active sessions`);
      activeSessions.forEach(session => {
        sessionManager.cancelSession(session.messageId);
      });
    }

    // Step 3: Execute chat change operations (UI updates, settings reload, etc.)
    logger.debug('3. Executing chat change operations');
    executeChatChangeOperations();

    // Step 4: Reload gallery widget state
    logger.debug('4. Reloading gallery widget for new chat');
    reloadGalleryForNewChat();

    logger.info('=== CHAT_CHANGED Processing Complete ===');
  } catch (error) {
    logger.error('Error during CHAT_CHANGED processing:', error);
  }
}

/**
 * Initialize the CHAT_CHANGED handler
 * Call this once during extension initialization
 */
export function initializeChatChangedHandler(): void {
  const context = SillyTavern.getContext();

  if (!context?.eventSource || !context?.eventTypes?.CHAT_CHANGED) {
    logger.error(
      'Cannot initialize CHAT_CHANGED handler - event system unavailable'
    );
    return;
  }

  // Register the single CHAT_CHANGED listener
  context.eventSource.on(context.eventTypes.CHAT_CHANGED, handleChatChanged);

  logger.info('CHAT_CHANGED handler registered');
}
