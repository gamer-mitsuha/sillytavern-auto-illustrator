/**
 * Image Generator Module
 * Handles image generation using the SD slash command and replacing prompts with images
 */

import Bottleneck from 'bottleneck';
import {extractImagePrompts} from './image_extractor';
import type {DeferredImage} from './types';
import {createLogger} from './logger';
import {t, tCount} from './i18n';
import {progressManager} from './progress_manager';
import {attachRegenerationHandlers} from './manual_generation';
import {saveMetadata} from './metadata';

const logger = createLogger('Generator');

// Global Bottleneck limiter for image generation
let imageLimiter: Bottleneck | null = null;

/**
 * Initializes the global image generation limiter
 * @param maxConcurrent - Maximum concurrent generations
 * @param minInterval - Minimum interval between generations (milliseconds)
 */
export function initializeConcurrencyLimiter(
  maxConcurrent: number,
  minInterval = 0
): void {
  logger.info(
    `Initializing Bottleneck limiter (maxConcurrent: ${maxConcurrent}, minTime: ${minInterval}ms)`
  );

  imageLimiter = new Bottleneck({
    maxConcurrent,
    minTime: minInterval,
    trackDoneStatus: true,
  });

  // Log events for debugging
  imageLimiter.on('depleted', () => {
    logger.debug('Image generation queue depleted (all jobs complete)');
  });

  imageLimiter.on('idle', () => {
    logger.debug('Image generation queue idle (no pending jobs)');
  });

  imageLimiter.on('error', (error: Error) => {
    logger.error('Bottleneck error:', error);
  });
}

/**
 * Updates the maximum concurrent limit
 * @param maxConcurrent - New max concurrent limit
 */
export function updateMaxConcurrent(maxConcurrent: number): void {
  if (!imageLimiter) {
    logger.warn('Image limiter not initialized, initializing now');
    initializeConcurrencyLimiter(maxConcurrent);
    return;
  }

  logger.info(`Updating maxConcurrent: ${maxConcurrent}`);
  imageLimiter.updateSettings({maxConcurrent});
}

/**
 * Updates the minimum generation interval
 * @param minInterval - New minimum interval (milliseconds)
 */
export function updateMinInterval(minInterval: number): void {
  if (!imageLimiter) {
    logger.warn('Image limiter not initialized, initializing now');
    initializeConcurrencyLimiter(1, minInterval);
    return;
  }

  logger.info(`Updating minTime: ${minInterval}ms`);
  imageLimiter.updateSettings({minTime: minInterval});
}

/**
 * Creates an image tag with safe, simple attributes
 * @param imageUrl - URL of the generated image
 * @param index - Index of the image (for identification in title/alt)
 * @returns HTML image tag
 */
function createImageTag(imageUrl: string, index: number): string {
  const label = `AI generated image #${index + 1}`;
  return `<img src="${imageUrl}" title="${label}" alt="${label}">`;
}

/**
 * Inserts an image tag after a prompt tag in text
 * @param text - Text containing the prompt tag
 * @param fullMatch - The full matched tag string (e.g., '<!--img-prompt="..."-->')
 * @param imageUrl - URL of the image to insert
 * @param index - Index of the image
 * @returns Updated text and success status
 */
function insertImageAfterPrompt(
  text: string,
  fullMatch: string,
  imageUrl: string,
  index: number
): {text: string; success: boolean} {
  const tagIndex = text.indexOf(fullMatch);

  if (tagIndex === -1) {
    logger.warn('Could not find prompt tag in text:', fullMatch);
    return {text, success: false};
  }

  const actualEndIndex = tagIndex + fullMatch.length;

  // Check if image already inserted (to prevent duplicates)
  const afterPrompt = text.substring(actualEndIndex, actualEndIndex + 200);
  if (afterPrompt.includes(`src="${imageUrl}"`)) {
    logger.info('Image already inserted, skipping:', imageUrl);
    return {text, success: false};
  }

  // Insert image tag after the prompt
  const imgTag = createImageTag(imageUrl, index);
  const newText =
    text.substring(0, actualEndIndex) +
    '\n' +
    imgTag +
    text.substring(actualEndIndex);

  return {text: newText, success: true};
}

/**
 * Generates an image using the SD slash command
 * All image generation goes through the global rate limiter
 * @param prompt - Image generation prompt
 * @param context - SillyTavern context
 * @param commonTags - Optional common style tags to apply
 * @param tagsPosition - Position for common tags ('prefix' or 'suffix')
 * @param signal - Optional AbortSignal for cancellation
 * @returns URL of generated image or null on failure
 */
export async function generateImage(
  prompt: string,
  context: SillyTavernContext,
  commonTags?: string,
  tagsPosition?: 'prefix' | 'suffix',
  signal?: AbortSignal
): Promise<string | null> {
  // If limiter not initialized, create with default values
  if (!imageLimiter) {
    logger.warn('Image limiter not initialized, using defaults (1, 0ms)');
    imageLimiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 0,
      trackDoneStatus: true,
    });
  }

  // Check if aborted before even scheduling
  if (signal?.aborted) {
    logger.info('Generation aborted before scheduling:', prompt);
    return null;
  }

  // Schedule through Bottleneck (use unique ID to avoid collisions)
  const jobId = `${prompt}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  return imageLimiter.schedule({id: jobId}, async () => {
    // Check again after acquiring slot
    if (signal?.aborted) {
      logger.debug('Generation aborted after scheduling:', prompt);
      return null;
    }

    // Apply common tags if provided
    const enhancedPrompt =
      commonTags && tagsPosition
        ? applyCommonTags(prompt, commonTags, tagsPosition)
        : prompt;

    logger.debug('Generating image for prompt:', enhancedPrompt);
    if (commonTags && enhancedPrompt !== prompt) {
      logger.debug(`Original prompt: "${prompt}"`);
      logger.debug(`Enhanced with common tags: "${enhancedPrompt}"`);
    }

    const startTime = performance.now();

    try {
      const sdCommand = context.SlashCommandParser?.commands?.['sd'];
      if (!sdCommand || !sdCommand.callback) {
        logger.error('SD command not available');
        logger.info(
          'Available commands:',
          Object.keys(context.SlashCommandParser?.commands || {})
        );
        return null;
      }

      logger.debug('Calling SD command...');
      const imageUrl = await sdCommand.callback(
        {quiet: 'true'},
        enhancedPrompt
      );

      const duration = performance.now() - startTime;
      logger.debug(
        `Generated image URL: ${imageUrl} (took ${duration.toFixed(0)}ms)`
      );

      return imageUrl;
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error(
        `Error generating image (after ${duration.toFixed(0)}ms):`,
        error
      );
      return null;
    }
  });
}

/**
 * Parses a comma-separated string of tags into an array
 * @param tagsString - Comma-separated tags string
 * @returns Array of trimmed tag strings
 */
export function parseCommonTags(tagsString: string): string[] {
  if (!tagsString || tagsString.trim() === '') {
    return [];
  }

  return tagsString
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);
}

/**
 * Deduplicates tags in a case-insensitive manner
 * Preserves the original case of the first occurrence
 * @param tags - Array of tag strings
 * @returns Deduplicated array of tags
 */
export function deduplicateTags(tags: string[]): string[] {
  const seen = new Map<string, string>();

  for (const tag of tags) {
    const lowerTag = tag.toLowerCase();
    if (!seen.has(lowerTag)) {
      seen.set(lowerTag, tag);
    }
  }

  return Array.from(seen.values());
}

/**
 * Validates common tags input
 * @param tags - Comma-separated tags string
 * @returns Validation result with error message if invalid
 */
export function validateCommonTags(tags: string): {
  valid: boolean;
  error?: string;
} {
  if (!tags || tags.trim() === '') {
    return {valid: true}; // Empty is valid
  }

  // Check for invalid characters (no special HTML/JS chars)
  const invalidChars = /[<>{}[\]\\]/;
  if (invalidChars.test(tags)) {
    return {
      valid: false,
      error: 'Invalid characters detected. Avoid using < > { } [ ] \\',
    };
  }

  return {valid: true};
}

/**
 * Applies common style tags to a prompt based on position setting
 * Deduplicates tags to avoid repetition
 * @param prompt - Original image generation prompt
 * @param commonTags - Comma-separated common tags
 * @param position - Where to add tags ('prefix' or 'suffix')
 * @returns Enhanced prompt with common tags applied
 */
export function applyCommonTags(
  prompt: string,
  commonTags: string,
  position: 'prefix' | 'suffix'
): string {
  // If no common tags, return original prompt
  if (!commonTags || commonTags.trim() === '') {
    return prompt;
  }

  // Parse both prompt and common tags
  const promptTags = parseCommonTags(prompt);
  const styleTags = parseCommonTags(commonTags);

  // Combine based on position
  const combined =
    position === 'prefix'
      ? [...styleTags, ...promptTags]
      : [...promptTags, ...styleTags];

  // Deduplicate and join
  const deduplicated = deduplicateTags(combined);
  return deduplicated.join(', ');
}

/**
 * Unified batch insertion for both streaming and regeneration modes
 * Handles new images (streaming) and regenerated images atomically
 *
 * Uses regex for prompt detection
 * Uses prompt_manager for image associations
 *
 * @param deferredImages - Images to insert (streaming or regeneration)
 * @param messageId - Message ID to update
 * @param context - SillyTavern context
 * @param metadata - Auto-illustrator chat metadata
 * @returns Number of successfully inserted images
 */
export async function insertDeferredImages(
  deferredImages: DeferredImage[],
  messageId: number,
  context: SillyTavernContext,
  metadata: import('./types').AutoIllustratorChatMetadata
): Promise<number> {
  if (deferredImages.length === 0) {
    logger.debug(`No deferred images to insert for message ${messageId}`);
    return 0;
  }

  logger.info(
    `Batch inserting ${deferredImages.length} deferred images into message ${messageId}`
  );

  // Get current message
  const message = context.chat?.[messageId];
  if (!message) {
    logger.warn(`Message ${messageId} not found, skipping insertion`);
    return 0;
  }

  // Read message text ONCE at start
  let updatedText = message.mes || '';
  const originalLength = updatedText.length;

  // Get settings for click handler attachment
  const settings = context.extensionSettings?.auto_illustrator;

  let successCount = 0;

  // Import required module
  const {linkImageToPrompt} = await import('./prompt_manager');

  // Process each deferred image
  for (const deferred of deferredImages) {
    const queuedPrompt = deferred.prompt;

    try {
      // REGENERATION MODE: targetImageUrl present
      if (queuedPrompt.targetImageUrl) {
        const mode = queuedPrompt.insertionMode || 'replace-image';
        const targetUrl = queuedPrompt.targetImageUrl;
        const promptPreview = deferred.promptPreview || queuedPrompt.prompt;

        // Create title with "AI generated image" prefix for CSS selector compatibility
        const imageTitle = `AI generated image: ${promptPreview}`;

        // Create new image tag with escaped attributes
        const newImgTag = `<img src="${escapeHtmlAttribute(deferred.imageUrl)}" alt="${escapeHtmlAttribute(promptPreview)}" title="${escapeHtmlAttribute(imageTitle)}">`;

        logger.debug(
          `Regeneration mode: ${mode} for ${targetUrl.substring(0, 50)}...`
        );

        if (mode === 'replace-image') {
          // Replace existing <img> tag
          const escapedTargetUrl = escapeRegexSpecialChars(targetUrl);
          const imgPattern = new RegExp(
            `<img[^>]*src="${escapedTargetUrl}"[^>]*>`,
            'g'
          );

          const beforeReplace = updatedText.length;
          updatedText = updatedText.replace(imgPattern, newImgTag);

          if (
            updatedText.length !== beforeReplace ||
            !imgPattern.test(message.mes)
          ) {
            logger.debug(`Replaced image: ${targetUrl.substring(0, 50)}...`);
            successCount++;
          } else {
            logger.warn(
              `Failed to find/replace image: ${targetUrl.substring(0, 50)}...`
            );
          }
        } else if (mode === 'append-after-image') {
          // Insert after existing <img> tag
          const escapedTargetUrl = escapeRegexSpecialChars(targetUrl);
          const imgPattern = new RegExp(
            `(<img[^>]*src="${escapedTargetUrl}"[^>]*>)`,
            'g'
          );

          const beforeAppend = updatedText.length;
          updatedText = updatedText.replace(imgPattern, `$1\n${newImgTag}`);

          if (updatedText.length > beforeAppend) {
            logger.debug(
              `Appended after image: ${targetUrl.substring(0, 50)}...`
            );
            successCount++;
          } else {
            logger.warn(
              `Failed to find image for append: ${targetUrl.substring(0, 50)}...`
            );
          }
        }

        // Link new image to prompt (updates or replaces old association)
        if (queuedPrompt.targetPromptId) {
          logger.info('=== DEBUG: Linking regenerated image ===');
          logger.info(`Image URL (raw): ${deferred.imageUrl}`);
          logger.info(`Prompt ID: ${queuedPrompt.targetPromptId}`);

          linkImageToPrompt(
            queuedPrompt.targetPromptId,
            deferred.imageUrl,
            metadata
          );
          logger.debug(
            `Linked regenerated image to prompt: ${queuedPrompt.targetPromptId}`
          );
        }
      } else {
        // NEW IMAGE MODE (streaming): append after prompt tag
        const promptPreview = deferred.promptPreview || queuedPrompt.prompt;

        // Find insertion position using the stored fullMatch string
        // This is more reliable than re-extracting with regex, especially
        // if the message text was modified by SillyTavern or other extensions
        const fullMatch = queuedPrompt.fullMatch;
        const matchPosition = updatedText.indexOf(fullMatch);

        if (matchPosition >= 0) {
          // Found the exact prompt tag that was queued
          const insertPosition = matchPosition + fullMatch.length;

          // Create title with "AI generated image" prefix for CSS selector compatibility
          const imageTitle = `AI generated image: ${promptPreview}`;

          // Create new image tag
          const newImgTag = `\n<img src="${escapeHtmlAttribute(deferred.imageUrl)}" alt="${escapeHtmlAttribute(promptPreview)}" title="${escapeHtmlAttribute(imageTitle)}">`;

          // Insert after prompt tag
          updatedText =
            updatedText.substring(0, insertPosition) +
            newImgTag +
            updatedText.substring(insertPosition);

          successCount++;

          logger.debug(
            `Inserted new image after prompt at position ${insertPosition}`
          );

          // Link image to prompt using prompt_manager
          logger.info('=== DEBUG: Linking new streaming image ===');
          logger.info(`Image URL (raw): ${deferred.imageUrl}`);
          logger.info(`Prompt ID: ${deferred.promptId}`);

          linkImageToPrompt(deferred.promptId, deferred.imageUrl, metadata);
          logger.debug(`Linked new image to prompt: ${deferred.promptId}`);
        } else {
          logger.warn(
            'Could not find prompt tag for insertion (tag may have been removed or modified)'
          );
          logger.warn(`Looking for: ${fullMatch.substring(0, 100)}...`);
          logger.warn(
            `Prompt text: "${queuedPrompt.prompt.substring(0, 50)}..."`
          );
          logger.warn(
            'This can happen if the message was modified by SillyTavern or other extensions after streaming ended'
          );
        }
      }
    } catch (error) {
      logger.error(
        `Error inserting image for prompt "${queuedPrompt.prompt.substring(0, 50)}...":`,
        error
      );
    }
  }

  // Single atomic write
  message.mes = updatedText;

  logger.info(
    `Batch insertion complete: ${successCount}/${deferredImages.length} images inserted (${originalLength} → ${updatedText.length} chars)`
  );

  // Emit MESSAGE_EDITED first to trigger regex "Run on Edit"
  const MESSAGE_EDITED = context.eventTypes.MESSAGE_EDITED;
  await context.eventSource.emit(MESSAGE_EDITED, messageId);

  // Re-render the message block to display images in DOM
  context.updateMessageBlock(messageId, message);

  // Attach click handlers to newly inserted images
  if (settings) {
    attachRegenerationHandlers(messageId, context, settings);
    logger.debug('Attached click handlers to newly inserted images');
  }

  // Emit MESSAGE_UPDATED to notify other extensions
  const MESSAGE_UPDATED = context.eventTypes.MESSAGE_UPDATED;
  await context.eventSource.emit(MESSAGE_UPDATED, messageId);

  // Save metadata to persist PromptRegistry (image-prompt associations)
  await saveMetadata();
  logger.debug('Metadata saved (PromptRegistry persisted)');

  // Save the chat to persist the inserted images
  await context.saveChat();
  logger.debug('Chat saved after inserting deferred images');

  return successCount;
}

/**
 * Escapes HTML attribute values to prevent injection
 * @param str - String to escape
 * @returns Escaped string safe for HTML attributes
 */
function escapeHtmlAttribute(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escapes special regex characters for use in RegExp constructor
 * @param str - String to escape
 * @returns Escaped string safe for regex
 */
function escapeRegexSpecialChars(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
