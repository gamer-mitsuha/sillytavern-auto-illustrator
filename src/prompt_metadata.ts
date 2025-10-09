/**
 * Prompt Metadata Management
 * Handles storage and retrieval of prompt history in chat metadata
 */

import {createLogger} from './logger';
import type {
  AutoIllustratorChatMetadata,
  PromptPositionHistory,
  PromptPosition,
} from './types';

const logger = createLogger('PromptMetadata');

/**
 * Creates position key for storage (messageId_promptIndex)
 */
export function createPositionKey(position: PromptPosition): string {
  return `${position.messageId}_${position.promptIndex}`;
}

/**
 * Parses position key back to PromptPosition
 */
export function parsePositionKey(key: string): PromptPosition {
  const [messageId, promptIndex] = key.split('_').map(Number);
  return {messageId, promptIndex};
}

/**
 * Gets auto-illustrator metadata from chat, initializing if needed
 */
export function getMetadata(
  context: SillyTavernContext
): AutoIllustratorChatMetadata {
  if (!context.chat_metadata.auto_illustrator) {
    context.chat_metadata.auto_illustrator = {
      imageUrlToPromptId: {},
      promptIdToText: {},
      promptPositionHistory: {},
    };
  }
  return context.chat_metadata.auto_illustrator;
}

/**
 * Generates unique prompt ID from content
 * Uses simple hash for now - can be replaced with existing utility if available
 */
export function generatePromptId(promptText: string): string {
  // Simple hash
  let hash = 0;
  for (let i = 0; i < promptText.length; i++) {
    hash = (hash << 5) - hash + promptText.charCodeAt(i);
    hash = hash & hash;
  }
  return `prompt_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
}

/**
 * Records a prompt string and returns its ID (de-duplicated)
 */
export function recordPrompt(
  promptText: string,
  context: SillyTavernContext
): string {
  const metadata = getMetadata(context);
  const promptId = generatePromptId(promptText);

  if (!metadata.promptIdToText[promptId]) {
    metadata.promptIdToText[promptId] = promptText;
    logger.debug(`Recorded new prompt: ${promptId}`);
  }

  return promptId;
}

/**
 * Associates an image URL with the prompt ID used to generate it
 */
export function recordImagePrompt(
  imageUrl: string,
  promptId: string,
  context: SillyTavernContext
): void {
  const metadata = getMetadata(context);
  metadata.imageUrlToPromptId[imageUrl] = promptId;
  logger.debug(`Linked image to prompt: ${promptId}`);
}

/**
 * Initializes prompt position history (called when first detecting prompt in message)
 */
export function initializePromptPosition(
  position: PromptPosition,
  initialPromptId: string,
  context: SillyTavernContext
): void {
  const metadata = getMetadata(context);
  const positionKey = createPositionKey(position);

  if (!metadata.promptPositionHistory[positionKey]) {
    metadata.promptPositionHistory[positionKey] = {
      versions: [
        {
          promptId: initialPromptId,
          feedback: '',
          timestamp: Date.now(),
        },
      ],
    };
    logger.debug(`Initialized position history: ${positionKey}`);
  }
}

/**
 * Replaces the Nth image prompt in message text with new prompt
 * Exported for testing
 */
export function replacePromptAtIndex(
  messageText: string,
  promptIndex: number,
  newPrompt: string
): string {
  const pattern = /<!--img-prompt="([^"]*)"-->/g;
  let count = 0;

  return messageText.replace(pattern, match => {
    const currentIndex = count;
    count++;

    if (currentIndex === promptIndex) {
      return `<!--img-prompt="${newPrompt}"-->`;
    }
    return match;
  });
}

/**
 * Adds new prompt version to position history AND updates message text
 */
export async function addPromptVersion(
  position: PromptPosition,
  newPromptId: string,
  feedback: string,
  context: SillyTavernContext
): Promise<void> {
  const metadata = getMetadata(context);
  const positionKey = createPositionKey(position);

  const history = metadata.promptPositionHistory[positionKey];
  if (!history) {
    throw new Error(`No history found for position: ${positionKey}`);
  }

  // Add to metadata history
  history.versions.push({
    promptId: newPromptId,
    feedback,
    timestamp: Date.now(),
  });

  logger.info(
    `Added prompt version to ${positionKey}: ${newPromptId} (${history.versions.length} versions)`
  );

  // Update message text with new prompt
  const newPromptText = metadata.promptIdToText[newPromptId];
  if (!newPromptText) {
    throw new Error(`Prompt text not found for ID: ${newPromptId}`);
  }

  const message = context.chat[position.messageId];
  if (!message) {
    throw new Error(`Message not found: ${position.messageId}`);
  }

  // Replace the prompt in message text (find Nth occurrence)
  message.mes = replacePromptAtIndex(
    message.mes,
    position.promptIndex,
    newPromptText
  );

  await context.saveChat();
}

/**
 * Gets current prompt ID at a position
 */
export function getCurrentPromptId(
  position: PromptPosition,
  context: SillyTavernContext
): string | null {
  const metadata = getMetadata(context);
  const positionKey = createPositionKey(position);
  const history = metadata.promptPositionHistory[positionKey];

  if (!history || history.versions.length === 0) {
    return null;
  }

  return history.versions[history.versions.length - 1].promptId;
}

/**
 * Gets prompt text by ID
 */
export function getPromptText(
  promptId: string,
  context: SillyTavernContext
): string | null {
  const metadata = getMetadata(context);
  return metadata.promptIdToText[promptId] || null;
}

/**
 * Gets prompt ID for an image URL
 */
export function getImagePromptId(
  imageUrl: string,
  context: SillyTavernContext
): string | null {
  const metadata = getMetadata(context);
  return metadata.imageUrlToPromptId[imageUrl] || null;
}

/**
 * Gets complete history for a position
 */
export function getPositionHistory(
  position: PromptPosition,
  context: SillyTavernContext
): PromptPositionHistory | null {
  const metadata = getMetadata(context);
  const positionKey = createPositionKey(position);
  return metadata.promptPositionHistory[positionKey] || null;
}
