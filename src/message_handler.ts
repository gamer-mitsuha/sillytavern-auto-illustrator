/**
 * Message Handler Module (v2)
 * Unified event handling using SessionManager
 *
 * Updates:
 * - Uses SessionManager for both streaming and regeneration
 * - Removed old streaming detection/coordination logic
 * - Simplified to two events: STREAM_TOKEN_STARTED and MESSAGE_RECEIVED
 */

import {sessionManager} from './session_manager';
import {createLogger} from './logger';
import {generatePromptsForMessage} from './services/prompt_generation_service';
import {insertPromptTagsWithContext} from './prompt_insertion';
import {isIndependentApiMode} from './mode_utils';

const logger = createLogger('MessageHandler');

/**
 * Handles STREAM_TOKEN_STARTED event
 * Starts a streaming session for the message
 *
 * @param messageId - Message ID being streamed
 * @param context - SillyTavern context
 * @param settings - Extension settings
 */
export async function handleStreamTokenStarted(
  messageId: number,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<void> {
  logger.trace(`STREAM_TOKEN_STARTED event for message ${messageId}`);

  // Skip starting streaming session in LLM-post mode
  // Prompts will be generated after message is complete, then session will start
  if (isIndependentApiMode(settings.promptGenerationMode)) {
    logger.debug(
      'Skipping streaming session start in LLM-post mode (will start after prompt generation)',
      {messageId}
    );
    return;
  }

  try {
    // Start streaming session
    await sessionManager.startStreamingSession(messageId, context, settings);

    logger.trace(`Streaming session started for message ${messageId}`);
  } catch (error) {
    logger.error(
      `Error starting streaming session for message ${messageId}:`,
      error
    );
  }
}

/**
 * Handles MESSAGE_RECEIVED event
 * Finalizes streaming session if active, otherwise processes complete message
 *
 * @param messageId - Message ID that was received
 * @param context - SillyTavern context
 * @param settings - Extension settings
 */
export async function handleMessageReceived(
  messageId: number,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<void> {
  logger.debug(`MESSAGE_RECEIVED event for message ${messageId}`);

  const message = context.chat?.[messageId];
  if (!message) {
    logger.warn(`Message ${messageId} not found in chat`);
    return;
  }

  logger.debug('Message details:', {
    is_user: message.is_user,
    is_system: message.is_system,
    name: message.name,
    mes_length: message.mes?.length,
  });

  // Skip user messages
  if (message.is_user) {
    logger.debug('Skipping user message');
    return;
  }

  // Check if we have an active streaming session for this message
  const session = sessionManager.getSession(messageId);

  if (!session) {
    // No active session - this means streaming was disabled in SillyTavern
    // OR we're using LLM-based prompt generation mode
    logger.info(
      `No active session for message ${messageId}, processing as non-streaming message`
    );

    // Check if LLM-based prompt generation is enabled
    if (isIndependentApiMode(settings.promptGenerationMode)) {
      logger.info('LLM-based prompt generation enabled, generating prompts...');

      try {
        // Step 1: Call LLM to generate prompts
        const prompts = await generatePromptsForMessage(
          message.mes,
          context,
          settings
        );

        if (prompts.length === 0) {
          logger.info('LLM returned no prompts, skipping image generation');
          return;
        }

        logger.info(`LLM generated ${prompts.length} prompts`);

        // Step 2: Insert prompt tags into message using context matching
        const tagTemplate = settings.promptDetectionPatterns[0];
        const insertionResult = insertPromptTagsWithContext(
          message.mes,
          prompts,
          tagTemplate
        );

        // Step 2b: Fallback for failed suggestions - append at end
        let finalText = insertionResult.updatedText;
        let totalInserted = insertionResult.insertedCount;

        if (insertionResult.failedSuggestions.length > 0) {
          logger.warn(
            `Failed to insert ${insertionResult.failedSuggestions.length} prompts (context not found), appending at end`
          );

          // Append failed prompts at the end of the message
          const promptTagTemplate = tagTemplate.includes('{PROMPT}')
            ? tagTemplate
            : '<!--img-prompt="{PROMPT}"-->';

          for (const failed of insertionResult.failedSuggestions) {
            const promptTag = promptTagTemplate.replace(
              '{PROMPT}',
              failed.text
            );
            finalText += ` ${promptTag}`;
            totalInserted++;
            logger.debug(
              `Appended failed prompt at end: "${failed.text.substring(0, 50)}..."`
            );
          }
        }

        if (totalInserted === 0) {
          logger.warn('No prompts generated or inserted');
          toastr.warning(
            'Failed to generate image prompts (LLM returned no valid prompts)',
            'Warning'
          );
          return;
        }

        // Step 3: Save updated message with prompt tags
        message.mes = finalText;
        await context.saveChat();
        logger.info(
          `Inserted ${totalInserted} prompt tags into message (${insertionResult.failedSuggestions.length} appended at end)`
        );
      } catch (error) {
        logger.error('LLM prompt generation failed:', error);
        toastr.warning('Failed to generate image prompts', 'Warning');
        return;
      }
    }

    // Process message with prompts (works for both regex and LLM modes)
    try {
      // Start a new streaming session with the complete message
      await sessionManager.startStreamingSession(messageId, context, settings);

      // Immediately finalize to process all prompts at once
      const insertedCount = await sessionManager.finalizeStreamingAndInsert(
        messageId,
        context
      );

      logger.info(
        `Processed non-streaming message ${messageId}: ${insertedCount} images inserted`
      );
    } catch (error) {
      logger.error(
        `Error processing non-streaming message ${messageId}:`,
        error
      );
    }

    return;
  }

  if (session.type !== 'streaming') {
    logger.warn(
      `Message ${messageId} has ${session.type} session, expected streaming`
    );
    return;
  }

  logger.info(
    `Streaming session active for message ${messageId}, finalizing...`
  );

  try {
    // Finalize streaming and insert all deferred images
    const insertedCount = await sessionManager.finalizeStreamingAndInsert(
      messageId,
      context
    );

    logger.info(
      `Finalized streaming session for message ${messageId}: ${insertedCount} images inserted`
    );
  } catch (error) {
    logger.error(
      `Error finalizing streaming session for message ${messageId}:`,
      error
    );
  }
}

/**
 * Creates event handlers for SillyTavern events
 *
 * @param settings - Extension settings
 * @returns Object with event handler functions
 */
export function createEventHandlers(settings: AutoIllustratorSettings): {
  onStreamTokenStarted: (messageId: number) => Promise<void>;
  onMessageReceived: (messageId: number) => Promise<void>;
} {
  return {
    /**
     * Handler for STREAM_TOKEN_STARTED event
     */
    onStreamTokenStarted: async (messageId: number) => {
      const context = SillyTavern.getContext();
      if (!context) {
        logger.warn('Failed to get context for STREAM_TOKEN_STARTED');
        return;
      }

      await handleStreamTokenStarted(messageId, context, settings);
    },

    /**
     * Handler for MESSAGE_RECEIVED event
     */
    onMessageReceived: async (messageId: number) => {
      const context = SillyTavern.getContext();
      if (!context) {
        logger.warn('Failed to get context for MESSAGE_RECEIVED');
        return;
      }

      await handleMessageReceived(messageId, context, settings);
    },
  };
}

/**
 * Handles chat change event
 * Cancels all active sessions when switching chats
 */
export function handleChatChanged(): void {
  logger.info('Chat changed, cancelling all active sessions');

  const activeSessions = sessionManager.getAllSessions();

  if (activeSessions.length === 0) {
    logger.debug('No active sessions to cancel');
    return;
  }

  logger.info(`Cancelling ${activeSessions.length} active sessions`);

  activeSessions.forEach(session => {
    sessionManager.cancelSession(session.messageId);
  });

  logger.info('All sessions cancelled');
}

/**
 * Gets current status of all active sessions (for debugging)
 *
 * @returns Status object with session details
 */
export function getSessionStatus(): ReturnType<
  typeof sessionManager.getStatus
> {
  return sessionManager.getStatus();
}
