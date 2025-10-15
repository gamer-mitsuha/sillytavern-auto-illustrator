/**
 * Prompt Updater (v2)
 * Uses LLM to update prompts based on user feedback
 * Upgraded to use PromptManager tree structure instead of flat PromptMetadata
 */

import {createLogger} from './logger';
import promptUpdateTemplate from './presets/prompt_update.md';
import {
  getPromptForImage,
  refinePrompt,
  replacePromptTextInMessage,
  type PromptNode,
} from './prompt_manager';
import {getMetadata, saveMetadata} from './metadata';
import {DEFAULT_PROMPT_DETECTION_PATTERNS} from './constants';

// Re-export PromptNode type for consumers
export type {PromptNode};

const logger = createLogger('PromptUpdater');

/**
 * Extracts updated prompt from LLM response
 * Expects <!--img-prompt="..."-->  or <img_prompt="..."> format
 *
 * @param llmResponse - Raw LLM response text
 * @returns Extracted prompt text or null if not found
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
 * Generates an updated prompt using LLM feedback (without updating message text)
 *
 * Flow:
 * 1. Find parent prompt for image via PromptManager
 * 2. Call LLM to generate refined prompt based on feedback
 * 3. Create child node in PromptManager tree
 *
 * @param imageUrl - URL of the image whose prompt to update
 * @param userFeedback - User's requested changes
 * @param context - SillyTavern context
 * @param settings - Extension settings
 * @returns New child prompt node, or null if generation failed
 *
 * @example
 * const childNode = await generateUpdatedPrompt(
 *   "/images/test.png",
 *   "make the background more detailed",
 *   context,
 *   settings
 * );
 * if (childNode) {
 *   console.log("New prompt:", childNode.text);
 * }
 */
export async function generateUpdatedPrompt(
  imageUrl: string,
  userFeedback: string,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<PromptNode | null> {
  logger.info(`Updating prompt for image with feedback: "${userFeedback}"`, {
    imageUrl,
  });

  const metadata = getMetadata(context);

  // Find parent prompt for this image
  const parent = getPromptForImage(imageUrl, metadata);
  if (!parent) {
    logger.error('No prompt found for image:', imageUrl);
    return null;
  }

  const currentPrompt = parent.text;
  const parentPromptId = parent.id;
  logger.debug('Current prompt:', currentPrompt);

  // Check for LLM availability
  if (!context.generateRaw) {
    logger.error('generateRaw not available in context');
    throw new Error('LLM generation not available');
  }

  // Build system prompt and user prompt using template
  const systemPrompt =
    'You are a technical assistant helping to update image generation prompts. Output ONLY the updated prompt in HTML comment format. Do NOT write stories, explanations, or continue any roleplay.';

  // Use the template and replace placeholders
  const userPrompt = promptUpdateTemplate
    .replace('{{{currentPrompt}}}', currentPrompt)
    .replace('{{{userFeedback}}}', userFeedback);

  logger.debug('Sending prompt to LLM for update (using generateRaw)');

  // Call LLM with generateRaw (no chat context)
  let llmResponse: string;
  try {
    llmResponse = await context.generateRaw({
      systemPrompt,
      prompt: userPrompt,
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

  // Create child node in PromptManager tree
  const childNode = refinePrompt(
    parentPromptId,
    updatedPrompt,
    userFeedback,
    'ai-refined',
    metadata
  );

  logger.info(`Created child node ${childNode.id} (parent: ${parentPromptId})`);
  logger.info(`Generated updated prompt: "${updatedPrompt}"`);

  return childNode;
}

/**
 * Applies a prompt update to the message text
 *
 * Flow:
 * 1. Find message containing the image
 * 2. Replace prompt text in message (at parent's position, with child's text)
 * 3. Emit events and save chat
 *
 * @param imageUrl - URL of the image
 * @param parentPromptId - ID of the parent prompt node
 * @param childNode - Child node with updated prompt text
 * @param context - SillyTavern context
 * @param settings - Extension settings
 * @returns true if update succeeded, false otherwise
 */
export async function applyPromptUpdate(
  imageUrl: string,
  parentPromptId: string,
  childNode: PromptNode,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<boolean> {
  const metadata = getMetadata(context);

  // Find message containing this image
  const message = context.chat?.find(msg => msg.mes.includes(imageUrl));

  if (!message) {
    logger.error('Message containing image not found');
    return false;
  }

  const messageId = context.chat?.indexOf(message) ?? -1;
  if (messageId === -1) {
    logger.error('Could not determine message ID');
    return false;
  }

  // Replace prompt text in message (at parent's position, with child's text)
  const patterns =
    settings.promptDetectionPatterns || DEFAULT_PROMPT_DETECTION_PATTERNS;
  const updatedText = replacePromptTextInMessage(
    parentPromptId, // Replace at parent's position
    message.mes,
    childNode.text, // Use child's text
    patterns,
    metadata
  );

  // Update message
  message.mes = updatedText;

  // Emit proper event sequence for DOM update
  const MESSAGE_EDITED = context.eventTypes.MESSAGE_EDITED;
  await context.eventSource.emit(MESSAGE_EDITED, messageId);

  context.updateMessageBlock(messageId, message);

  const MESSAGE_UPDATED = context.eventTypes.MESSAGE_UPDATED;
  await context.eventSource.emit(MESSAGE_UPDATED, messageId);

  // Save chat
  await context.saveChat();
  await saveMetadata();

  logger.info('Prompt updated successfully in message', {
    messageId,
    newPrompt: childNode.text,
  });

  return true;
}
