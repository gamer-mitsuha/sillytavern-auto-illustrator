/**
 * Message Handler Module
 * Handles MESSAGE_RECEIVED events and orchestrates image generation
 */

import {hasImagePrompts} from './image_extractor';
import {replacePromptsWithImages} from './image_generator';

/**
 * Processes a message to extract and generate images from prompts
 * @param message - Message text
 * @param messageId - Index of the message in chat array
 * @param context - SillyTavern context
 */
export async function processMessageImages(
  message: string,
  messageId: number,
  context: SillyTavernContext
): Promise<void> {
  // Check if message has image prompts
  if (!hasImagePrompts(message)) {
    return;
  }

  console.log('[Auto Illustrator] Processing message for images:', messageId);

  try {
    // Generate images and replace prompts
    const processedMessage = await replacePromptsWithImages(message, context);

    // Update the message in the chat array
    if (context.chat && context.chat[messageId]) {
      context.chat[messageId].mes = processedMessage;
    }
  } catch (error) {
    console.error('[Auto Illustrator] Error processing message:', error);
  }
}

/**
 * Creates a message handler function for MESSAGE_RECEIVED events
 * @param context - SillyTavern context
 * @param isMessageBeingStreamed - Function to check if a message is currently being streamed
 * @param settings - Extension settings
 * @returns Message handler function
 */
export function createMessageHandler(
  context: SillyTavernContext,
  isMessageBeingStreamed: (messageId: number) => boolean,
  settings: AutoIllustratorSettings
): (messageId: number) => Promise<void> {
  return async (messageId: number) => {
    console.log(
      '[Auto Illustrator] MESSAGE_RECEIVED event, messageId:',
      messageId
    );

    // Skip if streaming is enabled - streaming handles all image generation
    if (settings.streamingEnabled) {
      console.log(
        '[Auto Illustrator] Skipping MESSAGE_RECEIVED - streaming mode handles image generation'
      );
      return;
    }

    // Skip if this message is currently being processed by streaming
    if (isMessageBeingStreamed(messageId)) {
      console.log(
        '[Auto Illustrator] Skipping MESSAGE_RECEIVED - message is being processed by streaming'
      );
      return;
    }

    // Get the message from chat
    const message = context.chat?.[messageId];
    if (!message) {
      console.log('[Auto Illustrator] No message found at index:', messageId);
      return;
    }

    console.log('[Auto Illustrator] Message details:', {
      is_user: message.is_user,
      is_system: message.is_system,
      name: message.name,
      mes_length: message.mes?.length,
    });

    if (message.is_user) {
      console.log('[Auto Illustrator] Skipping user message');
      return;
    }

    console.log(
      '[Auto Illustrator] Message text preview:',
      message.mes.substring(0, 200)
    );

    // Check if message has image prompts
    if (!hasImagePrompts(message.mes)) {
      console.log('[Auto Illustrator] No image prompts found in message');
      return;
    }

    console.log('[Auto Illustrator] Image prompts detected, processing...');

    await processMessageImages(message.mes, messageId, context);

    // Emit MESSAGE_EDITED event to trigger UI updates and regex processing
    console.log('[Auto Illustrator] Emitting MESSAGE_EDITED event');
    const MESSAGE_EDITED =
      context.eventTypes?.MESSAGE_EDITED || 'MESSAGE_EDITED';
    context.eventSource.emit(MESSAGE_EDITED, messageId);
  };
}
