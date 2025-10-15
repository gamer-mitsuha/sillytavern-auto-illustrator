/**
 * Metadata Module
 * Centralized management of auto-illustrator chat metadata
 *
 * This module maintains a module-level reference to the current chat's metadata
 * and refreshes it when CHAT_CHANGED event is detected.
 */

import {createLogger} from './logger';
import type {AutoIllustratorChatMetadata} from './types';

const logger = createLogger('Metadata');

/**
 * Module-level variable holding the current chat's auto-illustrator metadata
 * This is refreshed on every CHAT_CHANGED event
 */
let autoIllustratorMetadata: AutoIllustratorChatMetadata | null = null;

/**
 * Initializes or refreshes the metadata from the current context
 * Called on extension load and CHAT_CHANGED events
 */
export function refreshMetadata(): void {
  const context = SillyTavern.getContext();
  if (!context) {
    logger.warn('Cannot refresh metadata: context not available');
    autoIllustratorMetadata = null;
    return;
  }

  // Initialize chatMetadata if it doesn't exist (using camelCase per official docs)
  if (!context.chatMetadata) {
    context.chatMetadata = {};
  }

  if (!context.chatMetadata.auto_illustrator) {
    context.chatMetadata.auto_illustrator = {
      // Only PromptRegistry is needed - PromptManager handles everything
      promptRegistry: {
        nodes: {},
        imageToPromptId: {},
        rootPromptIds: [],
      },
    };
    logger.debug('Initialized auto_illustrator metadata for new chat');
  }

  autoIllustratorMetadata = context.chatMetadata.auto_illustrator;
  logger.debug('Refreshed metadata reference for current chat');
}

/**
 * Gets the current chat's auto-illustrator metadata
 * Returns the cached module-level reference
 *
 * @param context - Optional context (for compatibility, not used)
 * @returns Auto-illustrator metadata for current chat
 * @throws Error if metadata not initialized (call refreshMetadata first)
 */
export function getMetadata(
  _context?: SillyTavernContext
): AutoIllustratorChatMetadata {
  if (!autoIllustratorMetadata) {
    // Try to refresh if not initialized
    refreshMetadata();

    if (!autoIllustratorMetadata) {
      throw new Error(
        'Metadata not initialized. Ensure refreshMetadata() is called on CHAT_CHANGED.'
      );
    }
  }

  return autoIllustratorMetadata;
}

/**
 * Saves the current metadata to the server
 * Call this after modifying metadata (e.g., after registering prompts or linking images)
 */
export async function saveMetadata(): Promise<void> {
  const context = SillyTavern.getContext();
  if (!context) {
    logger.warn('Cannot save metadata: context not available');
    return;
  }

  try {
    // Save the metadata to the server
    await context.saveChat();
    logger.trace('Metadata saved to server');
  } catch (error) {
    logger.error('Failed to save metadata:', error);
    throw error;
  }
}
