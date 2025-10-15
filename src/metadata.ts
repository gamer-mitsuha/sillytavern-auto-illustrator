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
 * Gets the current chat's auto-illustrator metadata
 * Always fetches from SillyTavern context to ensure fresh data
 *
 * This follows the official SillyTavern extension pattern:
 * ```js
 * const { chatMetadata } = SillyTavern.getContext();
 * ```
 *
 * @param context - Optional context (for compatibility, not used)
 * @returns Auto-illustrator metadata for current chat
 * @throws Error if context not available
 */
export function getMetadata(
  _context?: SillyTavernContext
): AutoIllustratorChatMetadata {
  // Always get fresh context to ensure we have latest metadata (including loaded from server)
  const context = SillyTavern.getContext();
  if (!context) {
    throw new Error('Cannot get metadata: SillyTavern context not available');
  }

  if (!context.chatMetadata) {
    context.chatMetadata = {};
  }

  // Create metadata structure if it doesn't exist (new chat or not saved yet)
  if (!context.chatMetadata.auto_illustrator) {
    context.chatMetadata.auto_illustrator = {
      promptRegistry: {
        nodes: {},
        imageToPromptId: {},
        rootPromptIds: [],
      },
    };
    logger.debug('Created new metadata structure for chat');
  }

  return context.chatMetadata.auto_illustrator;
}

/**
 * Saves the current metadata to the server
 * Call this after modifying metadata (e.g., after registering prompts or linking images)
 *
 * Uses the official SillyTavern pattern: context.saveMetadata()
 */
export async function saveMetadata(): Promise<void> {
  const context = SillyTavern.getContext();
  if (!context) {
    logger.warn('Cannot save metadata: context not available');
    return;
  }

  try {
    // Use SillyTavern's saveMetadata() if available, otherwise saveChat()
    if (context.saveMetadata) {
      await context.saveMetadata();
      logger.trace('Metadata saved to server via saveMetadata()');
    } else {
      // Fallback for older SillyTavern versions
      await context.saveChat();
      logger.trace('Metadata saved to server via saveChat()');
    }
  } catch (error) {
    logger.error('Failed to save metadata:', error);
    throw error;
  }
}
