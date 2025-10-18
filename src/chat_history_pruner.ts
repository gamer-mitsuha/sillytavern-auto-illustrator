/**
 * Chat History Pruner Module
 * Removes generated images and optionally prompt tags from chat history before sending to LLM
 */

import {createLogger} from './logger';
import {extractImagePrompts} from './image_extractor';
import {DEFAULT_PROMPT_DETECTION_PATTERNS} from './constants';
import {removeAllMarkers} from './reconciliation';

const logger = createLogger('Pruner');

/**
 * Prunes generated images from chat history
 * Only removes <img> tags that immediately follow prompt tags in assistant messages
 * Preserves user-uploaded images and all user messages unchanged
 *
 * IMPORTANT: This function modifies the chat array messages in-place by updating their content.
 * It's designed to work with the CHAT_COMPLETION_PROMPT_READY event, which should provide
 * a chat array that is safe to modify before sending to the LLM.
 *
 * @param chat - Array of chat messages to process (messages will be modified in-place)
 * @param patterns - Optional array of regex pattern strings to use for detection
 * @returns Modified chat array (same reference as input)
 */
export function pruneGeneratedImages(
  chat: Array<{role: string; content: string}>,
  patterns: string[] = DEFAULT_PROMPT_DETECTION_PATTERNS
): Array<{role: string; content: string}> {
  logger.info('Pruning generated images from chat history');

  for (const message of chat) {
    // Only process assistant messages
    if (message.role === 'user' || message.role === 'system') {
      continue;
    }

    // Remove idempotency markers FIRST (before processing images)
    // This ensures the image pruning regex can match correctly
    let result = removeAllMarkers(message.content);

    // Extract all prompts with their positions
    const prompts = extractImagePrompts(result, patterns);

    // Process in reverse order to preserve indices
    for (let i = prompts.length - 1; i >= 0; i--) {
      const prompt = prompts[i];
      const afterPrompt = result.substring(prompt.endIndex);

      // Find all consecutive images after this prompt
      // Matches any <img> tag (including both normal images and placeholder images)
      const imgTagRegex = /^\s*<img\s+[^>]*>/g;
      let match;
      let totalLength = 0;

      while ((match = imgTagRegex.exec(afterPrompt)) !== null) {
        if (match.index === totalLength) {
          totalLength += match[0].length;
          imgTagRegex.lastIndex = totalLength;
        } else {
          break;
        }
      }

      // Remove the images (but keep the prompt tag)
      if (totalLength > 0) {
        result =
          result.substring(0, prompt.endIndex) +
          result.substring(prompt.endIndex + totalLength);
      }
    }

    if (message.content !== result) {
      message.content = result;
      logger.info('Pruned generated images from assistant message');
    }
  }

  return chat;
}

/**
 * Prunes BOTH generated images AND prompt tags from chat history
 * Used when LLM-based prompt generation mode is enabled to keep chat history clean
 *
 * This prevents prompt tags from influencing future LLM responses while still
 * preserving them in the actual message HTML for feature compatibility.
 *
 * IMPORTANT: This function modifies the chat array messages in-place by updating their content.
 * It's designed to work with the CHAT_COMPLETION_PROMPT_READY event.
 *
 * @param chat - Array of chat messages to process (messages will be modified in-place)
 * @param patterns - Optional array of regex pattern strings to use for detection
 * @returns Modified chat array (same reference as input)
 */
export function pruneGeneratedImagesAndPrompts(
  chat: Array<{role: string; content: string}>,
  patterns: string[] = DEFAULT_PROMPT_DETECTION_PATTERNS
): Array<{role: string; content: string}> {
  logger.info('Pruning generated images AND prompt tags from chat history');

  for (const message of chat) {
    // Only process assistant messages
    if (message.role === 'user' || message.role === 'system') {
      continue;
    }

    // Remove idempotency markers FIRST (before processing images)
    // This ensures the image pruning regex can match correctly
    let result = removeAllMarkers(message.content);

    // Extract all prompts with their positions
    const prompts = extractImagePrompts(result, patterns);

    // Process in reverse order to preserve indices
    for (let i = prompts.length - 1; i >= 0; i--) {
      const prompt = prompts[i];
      const afterPrompt = result.substring(prompt.endIndex);

      // Find all consecutive images after this prompt
      // Matches any <img> tag (including both normal images and placeholder images)
      const imgTagRegex = /^\s*<img\s+[^>]*>/g;
      let match;
      let totalImageLength = 0;

      while ((match = imgTagRegex.exec(afterPrompt)) !== null) {
        if (match.index === totalImageLength) {
          totalImageLength += match[0].length;
          imgTagRegex.lastIndex = totalImageLength;
        } else {
          break;
        }
      }

      // Remove BOTH the prompt tag AND the images/placeholders
      // Unlike pruneGeneratedImages which keeps the prompt tag,
      // this removes everything from startIndex to endIndex + images
      result =
        result.substring(0, prompt.startIndex) +
        result.substring(prompt.endIndex + totalImageLength);
    }

    if (message.content !== result) {
      message.content = result;
      logger.info('Pruned images and prompt tags from assistant message');
    }
  }

  return chat;
}
