/**
 * Prompt Updater
 * Uses LLM to update prompts based on user feedback
 */

import {createLogger} from './logger';
import {t} from './i18n';
import promptUpdateTemplate from './presets/prompt_update.md';
import {
  recordPrompt,
  addPromptVersion,
  getPromptText,
  getCurrentPromptId,
} from './prompt_metadata';
import {DEFAULT_PROMPT_DETECTION_PATTERNS} from './constants';
import type {PromptPosition} from './types';

const logger = createLogger('PromptUpdater');

/**
 * Extracts prompt from LLM response (expects <!--img-prompt="..."--> format)
 */
function extractUpdatedPrompt(llmResponse: string): string | null {
  for (const pattern of DEFAULT_PROMPT_DETECTION_PATTERNS) {
    const regex = new RegExp(pattern, 'i');
    const match = llmResponse.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Updates prompt at a position using LLM feedback
 * @returns New prompt ID or null if update failed
 */
export async function updatePromptForPosition(
  position: PromptPosition,
  userFeedback: string,
  context: SillyTavernContext
): Promise<string | null> {
  logger.info(
    `Updating prompt at position ${position.messageId}_${position.promptIndex} with feedback: "${userFeedback}"`
  );

  // Get current prompt
  const currentPromptId = getCurrentPromptId(position, context);
  if (!currentPromptId) {
    logger.error(
      `No prompt found at position ${position.messageId}_${position.promptIndex}`
    );
    return null;
  }

  const currentPrompt = getPromptText(currentPromptId, context);
  if (!currentPrompt) {
    logger.error(`Prompt text not found for ID: ${currentPromptId}`);
    return null;
  }

  // Check for LLM availability
  if (!context.generateQuietPrompt) {
    logger.error('generateQuietPrompt not available in context');
    throw new Error('LLM generation not available');
  }

  // Build LLM prompt using <!--img-prompt="..."--> format
  const quietPrompt = promptUpdateTemplate
    .replace('{{{currentPrompt}}}', currentPrompt)
    .replace('{{{userFeedback}}}', userFeedback);

  logger.debug('Sending prompt to LLM for update');

  // Call LLM
  let llmResponse: string;
  try {
    llmResponse = await context.generateQuietPrompt({
      quietPrompt,
      quietToLoud: true,
    });
  } catch (error) {
    logger.error('LLM generation failed:', error);
    throw error;
  }

  // Extract updated prompt (expects <!--img-prompt="..."--> format)
  const updatedPrompt = extractUpdatedPrompt(llmResponse);
  if (!updatedPrompt) {
    logger.error('Failed to extract prompt from LLM response:', llmResponse);
    return null;
  }

  logger.info(`LLM generated updated prompt: "${updatedPrompt}"`);

  // Record new prompt and add to history (also updates message text)
  const newPromptId = recordPrompt(updatedPrompt, context);
  await addPromptVersion(position, newPromptId, userFeedback, context);

  return newPromptId;
}
