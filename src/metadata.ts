/**
 * Metadata Module
 * Centralized management of auto-illustrator chat metadata
 *
 * This module maintains a cached reference to the current chat's metadata
 * and automatically refreshes it when CHAT_CHANGED event is detected.
 *
 * Key design decisions:
 * - Cache metadata reference for performance (no need to call getContext() repeatedly)
 * - Auto-invalidate cache on CHAT_CHANGED (ensures we always use current chat's data)
 * - context.chatMetadata is a live reference, so cached pointer remains valid during session
 *
 * See docs/CHAT_METADATA_LIFECYCLE.md for detailed explanation
 */

import {createLogger} from './logger';
import type {AutoIllustratorChatMetadata} from './types';

const logger = createLogger('Metadata');

/**
 * Cached reference to current chat's metadata
 * Set only in CHAT_CHANGED event handler
 */
let currentMetadata: AutoIllustratorChatMetadata | null = null;

/**
 * Gets the current chat's auto-illustrator metadata
 * Returns cached reference (must be set by CHAT_CHANGED handler first)
 *
 * @returns Auto-illustrator metadata for current chat
 * @throws Error if metadata not initialized (CHAT_CHANGED hasn't fired yet)
 */
export function getMetadata(): AutoIllustratorChatMetadata {
  if (!currentMetadata) {
    throw new Error(
      'Metadata not initialized. Make sure CHAT_CHANGED event has fired.'
    );
  }

  return currentMetadata;
}

/**
 * Loads and caches metadata from context
 * Called automatically on CHAT_CHANGED event
 * Exported for use by chat_changed_handler
 */
export function loadMetadataFromContext(): void {
  logger.trace('Loading metadata from context (CHAT_CHANGED event)');

  const context = SillyTavern.getContext();
  if (!context) {
    logger.error('Cannot load metadata: context not available');
    currentMetadata = null;
    return;
  }

  // context.chatMetadata is a reference to SillyTavern's global chat_metadata
  // We should NEVER reassign it, only read/modify its properties
  const chatMetadata = context.chatMetadata;

  // Create metadata structure if it doesn't exist (new chat or not saved yet)
  if (!chatMetadata.auto_illustrator) {
    chatMetadata.auto_illustrator = {
      promptRegistry: {
        nodes: {},
        imageToPromptId: {},
        rootPromptIds: [],
      },
    };
    logger.debug('Created new metadata structure for chat');
  }

  // Cache the reference
  currentMetadata = chatMetadata.auto_illustrator;
  logger.trace('Cached metadata reference for current chat');
}

/**
 * Initialize metadata on module load
 * Load metadata for current chat (if any)
 * Note: CHAT_CHANGED event is handled by chat_changed_handler module
 */
(function initializeMetadata() {
  // Load metadata for current chat on extension startup
  try {
    loadMetadataFromContext();
    logger.debug('Initial metadata loaded on module initialization');
  } catch (error) {
    logger.warn('Could not load initial metadata:', error);
  }
})();

/**
 * Saves the current metadata to the server
 * Call this after modifying metadata (e.g., after registering prompts or linking images)
 *
 * Uses debounced save to prevent blocking during streaming operations.
 * The save is delayed by 1 second to batch multiple rapid changes.
 */
export async function saveMetadata(): Promise<void> {
  const context = SillyTavern.getContext();
  if (!context) {
    logger.warn('Cannot save metadata: context not available');
    return;
  }

  try {
    // Prefer debounced save to prevent blocking I/O during streaming
    // This schedules a save after 1s of inactivity (batches rapid changes)
    if (typeof context.saveMetadataDebounced === 'function') {
      context.saveMetadataDebounced();
      logger.debug('Metadata save scheduled (debounced, 1s delay)');
    } else {
      logger.warn(
        'saveMetadataDebounced not available, using immediate save (may cause freeze during streaming)'
      );
      if (context.saveMetadata) {
        // Fallback to immediate save if debounced version not available
        await context.saveMetadata();
        logger.trace('Metadata saved to server via saveMetadata()');
      } else {
        // Fallback for older SillyTavern versions
        await context.saveChat();
        logger.trace('Metadata saved to server via saveChat()');
      }
    }
  } catch (error) {
    logger.error('Failed to save metadata:', error);
    throw error;
  }
}
