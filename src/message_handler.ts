/**
 * Message Handler Module
 * Handles MESSAGE_RECEIVED events and orchestrates image generation
 */

import {hasImagePrompts} from './image_extractor';
import {replacePromptsWithImages} from './image_generator';
import {createLogger} from './logger';
import {
  isMessageBeingStreamed,
  handleMessageReceivedForStreaming,
} from './index';

const logger = createLogger('MessageHandler');

/**
 * Processes a message to extract and generate images from prompts
 * @param message - Message text
 * @param messageId - Index of the message in chat array
 * @param context - SillyTavern context
 * @param patterns - Optional array of regex pattern strings to use for detection
 * @param commonTags - Optional common style tags
 * @param tagsPosition - Position for common tags
 */
export async function processMessageImages(
  message: string,
  messageId: number,
  context: SillyTavernContext,
  patterns?: string[],
  commonTags?: string,
  tagsPosition?: 'prefix' | 'suffix'
): Promise<void> {
  // Check if message has image prompts
  if (!hasImagePrompts(message, patterns)) {
    return;
  }

  logger.info('Processing message for images:', messageId);

  try {
    // Generate images and replace prompts
    const processedMessage = await replacePromptsWithImages(
      message,
      context,
      patterns,
      commonTags,
      tagsPosition,
      messageId
    );

    // Update the message in the chat array
    if (context.chat && context.chat[messageId]) {
      context.chat[messageId].mes = processedMessage;
    }
  } catch (error) {
    logger.error('Error processing message:', error);
  }
}

/**
 * Creates a message handler function for MESSAGE_RECEIVED events
 * @param context - SillyTavern context
 * @param settings - Extension settings
 * @returns Message handler function
 */
export function createMessageHandler(
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): (messageId: number) => Promise<void> {
  return async (messageId: number) => {
    logger.info('MESSAGE_RECEIVED event, messageId:', messageId);

    // If streaming is handling this message, just signal and return
    if (isMessageBeingStreamed(messageId)) {
      logger.info('Message being streamed, signaling MESSAGE_RECEIVED');
      handleMessageReceivedForStreaming();
      return;
    }

    // No streaming active - process immediately
    // This handles both disabled streaming AND LLM streaming off (auto-fallback)
    logger.info('No streaming active, processing immediately');

    // Get the message from chat
    const message = context.chat?.[messageId];
    if (!message) {
      logger.info('No message found at index:', messageId);
      return;
    }

    logger.info('Message details:', {
      is_user: message.is_user,
      is_system: message.is_system,
      name: message.name,
      mes_length: message.mes?.length,
    });

    if (message.is_user) {
      logger.info('Skipping user message');
      return;
    }

    logger.info('Message text preview:', message.mes.substring(0, 200));

    // Check if message has image prompts
    if (!hasImagePrompts(message.mes, settings.promptDetectionPatterns)) {
      logger.info('No image prompts found in message');
      return;
    }

    logger.info('Image prompts detected, processing...');

    await processMessageImages(
      message.mes,
      messageId,
      context,
      settings.promptDetectionPatterns,
      settings.commonStyleTags,
      settings.commonStyleTagsPosition
    );

    // Emit MESSAGE_EDITED event first to trigger regex "Run on Edit"
    logger.info('Emitting MESSAGE_EDITED event');
    const MESSAGE_EDITED = context.eventTypes.MESSAGE_EDITED;
    await context.eventSource.emit(MESSAGE_EDITED, messageId);

    // Re-render the message block to display images in DOM
    // This calls messageFormatting() which processes <img> tags into rendered HTML
    context.updateMessageBlock(messageId, message);

    // Emit MESSAGE_UPDATED to notify other extensions
    const MESSAGE_UPDATED = context.eventTypes.MESSAGE_UPDATED;
    await context.eventSource.emit(MESSAGE_UPDATED, messageId);

    // Save the chat to persist the inserted images
    await context.saveChat();
    logger.debug('Chat saved after processing message images');
  };
}
