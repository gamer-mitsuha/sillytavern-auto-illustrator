/**
 * Message Renderer Utility
 *
 * Provides a standardized way to render message updates with proper event sequence
 * to ensure consistency across the extension.
 */

import {createLogger} from '../logger';
import {saveMetadata} from '../metadata';

const logger = createLogger('MessageRenderer');

/**
 * Options for renderMessageUpdate function
 */
export interface RenderMessageUpdateOptions {
  /**
   * Skip saving metadata and chat.
   * Use this for optimization when save is not needed (e.g., when no changes were made).
   * Default: false
   */
  skipSave?: boolean;
}

/**
 * Renders message updates with proper event sequence:
 * 1. Emit MESSAGE_EDITED (triggers regex "Run on Edit" and other processing)
 * 2. Call updateMessageBlock() (render the message in DOM)
 * 3. Emit MESSAGE_UPDATED (notify other extensions that message is updated)
 * 4. Save metadata (persists changes to disk, includes chat save)
 *
 * This function ensures a consistent rendering pattern across the extension,
 * preventing bugs from missing events or incorrect save sequences.
 *
 * @param messageId - The message index to render
 * @param options - Optional configuration
 * @param options.skipSave - Set to true to skip saving (optimization when no changes made)
 *
 * @throws Error if context is not available
 *
 * @example
 * ```typescript
 * // Standard usage: render and save
 * await renderMessageUpdate(messageId);
 *
 * // Optimization: render without saving
 * await renderMessageUpdate(messageId, { skipSave: true });
 * ```
 */
export async function renderMessageUpdate(
  messageId: number,
  options?: RenderMessageUpdateOptions
): Promise<void> {
  const skipSave = options?.skipSave ?? false;

  // Fetch fresh context from SillyTavern
  const context = SillyTavern.getContext();
  if (!context) {
    const errorMsg =
      'Cannot render message update: SillyTavern context not available';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Get the message to render
  const message = context.chat?.[messageId];
  if (!message) {
    const errorMsg = `Cannot render message update: message ${messageId} not found in chat`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  try {
    // Step 1: Emit MESSAGE_EDITED to trigger regex "Run on Edit" and other processing
    const MESSAGE_EDITED = context.eventTypes.MESSAGE_EDITED;
    await context.eventSource.emit(MESSAGE_EDITED, messageId);
    logger.debug(`Emitted MESSAGE_EDITED for message ${messageId}`);

    // Step 2: Update DOM to display the rendered message
    context.updateMessageBlock(messageId, message);
    logger.debug(`Updated message block for message ${messageId}`);

    // Step 3: Emit MESSAGE_UPDATED to notify other extensions
    const MESSAGE_UPDATED = context.eventTypes.MESSAGE_UPDATED;
    await context.eventSource.emit(MESSAGE_UPDATED, messageId);
    logger.debug(`Emitted MESSAGE_UPDATED for message ${messageId}`);

    // Step 4: Save metadata (which includes chat save) unless skipSave is true
    if (!skipSave) {
      await saveMetadata();
      logger.debug(`Saved metadata for message ${messageId}`);
    } else {
      logger.debug(
        `Skipped metadata save for message ${messageId} (skipSave: true)`
      );
    }

    logger.info(
      `Message ${messageId} rendered successfully (skipSave: ${skipSave})`
    );
  } catch (error) {
    logger.error(`Failed to render message ${messageId}:`, error);
    throw error;
  }
}
