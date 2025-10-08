/**
 * Message Handler Module
 * Handles MESSAGE_RECEIVED events and orchestrates image generation
 */

import {hasImagePrompts} from './image_extractor';
import {replacePromptsWithImages} from './image_generator';
import {createLogger} from './logger';

const logger = createLogger('MessageHandler');

/**
 * Processes a message to extract and generate images from prompts
 * @param message - Message text
 * @param messageId - Index of the message in chat array
 * @param context - SillyTavern context
 * @param patterns - Optional array of regex pattern strings to use for detection
 */
export async function processMessageImages(
  message: string,
  messageId: number,
  context: SillyTavernContext,
  patterns?: string[]
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
      patterns
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
 * @param isMessageBeingStreamed - Function to check if a message is currently being streamed
 * @param settings - Extension settings
 * @param getPendingDeferredImages - Function to get and clear pending deferred images
 * @returns Message handler function
 */
export function createMessageHandler(
  context: SillyTavernContext,
  isMessageBeingStreamed: (messageId: number) => boolean,
  settings: AutoIllustratorSettings,
  getPendingDeferredImages?: () => {
    images: Array<{prompt: string; imageUrl: string}>;
    messageId: number;
  } | null
): (messageId: number) => Promise<void> {
  return async (messageId: number) => {
    logger.info('MESSAGE_RECEIVED event, messageId:', messageId);

    // If streaming is enabled, mark MESSAGE_RECEIVED as fired and try insertion
    if (settings.streamingEnabled && getPendingDeferredImages) {
      logger.info('MESSAGE_RECEIVED fired for streaming message, marking flag');
      // Call the callback to signal MESSAGE_RECEIVED fired
      getPendingDeferredImages();
      return;
    }

    // Skip if streaming is enabled - streaming handles all image generation
    if (settings.streamingEnabled) {
      logger.info(
        'Skipping MESSAGE_RECEIVED - streaming mode handles image generation'
      );
      return;
    }

    // Skip if this message is currently being processed by streaming
    if (isMessageBeingStreamed(messageId)) {
      logger.info(
        'Skipping MESSAGE_RECEIVED - message is being processed by streaming'
      );
      return;
    }

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
      settings.promptDetectionPatterns
    );

    // Emit MESSAGE_EDITED event to trigger UI updates and regex processing
    logger.info('Emitting MESSAGE_EDITED event');
    const MESSAGE_EDITED = context.eventTypes.MESSAGE_EDITED;
    context.eventSource.emit(MESSAGE_EDITED, messageId);

    // Save the chat to persist the inserted images
    await context.saveChat();
    logger.debug('Chat saved after processing message images');
  };
}
