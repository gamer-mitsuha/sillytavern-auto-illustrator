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
import {reconcileMessage} from './reconciliation';
import {getMetadata, saveMetadata} from './metadata';
import {renderMessageUpdate} from './utils/message_renderer';
import {attachRegenerationHandlers} from './manual_generation';

const logger = createLogger('MessageHandler');

// Map of messageId -> timeout ID for delayed reconciliations
const delayedReconciliations = new Map<number, NodeJS.Timeout>();

/**
 * Schedules a delayed reconciliation for a message
 * Cancels any existing delayed reconciliation for the same message
 */
function scheduleDelayedReconciliation(
  messageId: number,
  delayMs: number,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): void {
  // Cancel existing delayed reconciliation for this message
  const existing = delayedReconciliations.get(messageId);
  if (existing) {
    clearTimeout(existing);
    logger.debug(
      `Cancelled existing delayed reconciliation for message ${messageId}`
    );
  }

  if (delayMs <= 0) {
    logger.debug('Delayed reconciliation disabled (delay <= 0)');
    return;
  }

  logger.info(
    `Scheduling delayed reconciliation for message ${messageId} in ${delayMs}ms`
  );

  const timeoutId = setTimeout(async () => {
    delayedReconciliations.delete(messageId);

    logger.info(
      `Running delayed final reconciliation for message ${messageId}`
    );

    // Re-fetch context to ensure it's fresh
    const freshContext = SillyTavern.getContext();
    if (!freshContext) {
      logger.warn('Context not available for delayed reconciliation');
      return;
    }

    await reconcileMessageIfNeeded(
      messageId,
      freshContext,
      settings,
      'GENERATION_ENDED:delayed'
    );
  }, delayMs);

  delayedReconciliations.set(messageId, timeoutId);
}

/**
 * Cancels all pending delayed reconciliations
 * Called when chat changes
 */
export function cancelAllDelayedReconciliations(): void {
  if (delayedReconciliations.size === 0) {
    return;
  }

  logger.info(
    `Cancelling ${delayedReconciliations.size} delayed reconciliation(s)`
  );

  for (const timeoutId of delayedReconciliations.values()) {
    clearTimeout(timeoutId);
  }

  delayedReconciliations.clear();
}

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
        await saveMetadata();
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

      // Set up one-time completion listener to auto-finalize when all images are done
      // This ensures images are generated BEFORE we try to insert them
      sessionManager.setupStreamingCompletion(messageId, context, settings);

      logger.info(
        `Started non-streaming session for message ${messageId}, will auto-finalize when images complete`
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

    // Run reconciliation pass to restore any missing images
    // This protects against race conditions where other handlers modified message.mes
    await reconcileMessageIfNeeded(
      messageId,
      context,
      settings,
      'MESSAGE_RECEIVED:streaming'
    );
  } catch (error) {
    logger.error(
      `Error finalizing streaming session for message ${messageId}:`,
      error
    );
  }
}

/**
 * Runs reconciliation on a message if reconciliation is enabled
 * Restores missing images from metadata
 *
 * @param messageId - Message ID to reconcile
 * @param context - SillyTavern context
 * @param settings - Extension settings
 * @param source - Source event/handler that triggered reconciliation (for logging)
 */
async function reconcileMessageIfNeeded(
  messageId: number,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings,
  source: string
): Promise<void> {
  // Check if reconciliation is enabled in settings
  // For now, always run it as it's a safety feature
  // TODO: Add settings toggle if needed

  try {
    logger.debug(
      `[${source}] Starting reconciliation for message ${messageId}`
    );

    const message = context.chat?.[messageId];
    if (!message) {
      logger.debug(
        `[${source}] Message ${messageId} not found, skipping reconciliation`
      );
      return;
    }

    const metadata = getMetadata();
    const messageText = message.mes || '';

    // Run reconciliation
    const {updatedText, result} = reconcileMessage(
      messageId,
      messageText,
      metadata
    );

    // If images were restored, save and update the message
    if (result.restoredCount > 0) {
      logger.info(
        `[${source}] Reconciliation restored ${result.restoredCount} missing images for message ${messageId}`
      );

      message.mes = updatedText;

      // Set up one-time listener to attach handlers after DOM update
      // This ensures click handlers work for reconciled images (including failed placeholders)
      const MESSAGE_UPDATED = context.eventTypes.MESSAGE_UPDATED;
      context.eventSource.once(MESSAGE_UPDATED, () => {
        attachRegenerationHandlers(messageId, context, settings);
        logger.debug(`[${source}] Attached handlers after reconciliation`);
      });

      // Render message with proper event sequence and save
      await renderMessageUpdate(messageId);

      logger.info(
        `[${source}] Reconciliation complete: message saved and events emitted`
      );
    } else if (result.missingCount > 0) {
      logger.warn(
        `[${source}] Reconciliation detected ${result.missingCount} missing images but could not restore them`
      );

      if (result.errors.length > 0) {
        logger.warn(`[${source}] Reconciliation errors:`, result.errors);
      }
    } else {
      logger.debug(
        `[${source}] Reconciliation complete: no missing images detected`
      );
    }
  } catch (error) {
    logger.error(`[${source}] Error during reconciliation:`, error);
  }
}

/**
 * Handles GENERATION_ENDED event
 * Runs immediate reconciliation and schedules delayed final reconciliation
 *
 * @param messageId - Message ID that finished generation
 * @param context - SillyTavern context
 * @param settings - Extension settings
 */
export async function handleGenerationEnded(
  messageId: number,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<void> {
  logger.debug(`GENERATION_ENDED event for message ${messageId}`);

  // SillyTavern bug workaround: GENERATION_ENDED sometimes emits chat.length instead of chat.length - 1
  // Valid message indices are 0 to length-1, so messageId should never equal chat.length
  let adjustedMessageId = messageId;
  if (messageId === context.chat?.length) {
    adjustedMessageId = messageId - 1;
    logger.warn(
      `GENERATION_ENDED messageId ${messageId} equals chat.length, adjusting to ${adjustedMessageId}`
    );
  }

  const message = context.chat?.[adjustedMessageId];
  if (!message) {
    logger.debug(
      `Message ${adjustedMessageId} not found, skipping reconciliation`
    );
    return;
  }

  // Skip user messages
  if (message.is_user) {
    logger.debug('Skipping user message');
    return;
  }

  // Run immediate reconciliation as a first pass
  // This catches most cases where images are missing
  logger.debug(
    `Running immediate reconciliation for message ${adjustedMessageId} (GENERATION_ENDED)`
  );
  await reconcileMessageIfNeeded(
    adjustedMessageId,
    context,
    settings,
    'GENERATION_ENDED:immediate'
  );

  // Schedule delayed final reconciliation to catch late edits from other extensions
  // This is particularly important when images finish generating before streaming ends
  scheduleDelayedReconciliation(
    adjustedMessageId,
    settings.finalReconciliationDelayMs,
    context,
    settings
  );
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
  onGenerationEnded: (messageId: number) => Promise<void>;
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

    /**
     * Handler for GENERATION_ENDED event
     */
    onGenerationEnded: async (messageId: number) => {
      const context = SillyTavern.getContext();
      if (!context) {
        logger.warn('Failed to get context for GENERATION_ENDED');
        return;
      }

      await handleGenerationEnded(messageId, context, settings);
    },
  };
}

/**
 * Handles chat change event
 * Cancels all active sessions and delayed reconciliations when switching chats
 */
export function handleChatChanged(): void {
  logger.info('Chat changed, cancelling all active sessions');

  // Cancel any pending delayed reconciliations
  cancelAllDelayedReconciliations();

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
