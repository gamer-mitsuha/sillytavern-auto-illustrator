/**
 * Image Generator Module
 * Handles image generation using the SD slash command and replacing prompts with images
 */

import {extractImagePrompts} from './image_extractor';
import type {DeferredImage} from './types';
import {createLogger} from './logger';
import {ConcurrencyLimiter} from './concurrency_limiter';
import {t, tCount} from './i18n';

const logger = createLogger('Generator');

// Global concurrency limiter for image generation
let concurrencyLimiter: ConcurrencyLimiter | null = null;

/**
 * Initializes the concurrency limiter
 * @param maxConcurrent - Maximum concurrent generations
 * @param minInterval - Minimum interval between generations (milliseconds)
 */
export function initializeConcurrencyLimiter(
  maxConcurrent: number,
  minInterval = 0
): void {
  logger.info(
    `Initializing concurrency limiter (max: ${maxConcurrent}, minInterval: ${minInterval}ms)`
  );
  concurrencyLimiter = new ConcurrencyLimiter(maxConcurrent, minInterval);
}

/**
 * Updates the maximum concurrent limit
 * @param maxConcurrent - New max concurrent limit
 */
export function updateMaxConcurrent(maxConcurrent: number): void {
  if (concurrencyLimiter) {
    concurrencyLimiter.setMaxConcurrent(maxConcurrent);
  } else {
    logger.warn('Concurrency limiter not initialized, initializing now');
    initializeConcurrencyLimiter(maxConcurrent);
  }
}

/**
 * Updates the minimum generation interval
 * @param minInterval - New minimum interval (milliseconds)
 */
export function updateMinInterval(minInterval: number): void {
  if (concurrencyLimiter) {
    concurrencyLimiter.setMinInterval(minInterval);
  } else {
    logger.warn('Concurrency limiter not initialized, initializing now');
    initializeConcurrencyLimiter(1, minInterval);
  }
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
 * @param prompt - Image generation prompt
 * @param context - SillyTavern context
 * @param commonTags - Optional common style tags to apply
 * @param tagsPosition - Position for common tags ('prefix' or 'suffix')
 * @returns URL of generated image or null on failure
 */
export async function generateImage(
  prompt: string,
  context: SillyTavernContext,
  commonTags?: string,
  tagsPosition?: 'prefix' | 'suffix'
): Promise<string | null> {
  // If limiter not initialized, create with default values
  if (!concurrencyLimiter) {
    logger.warn('Concurrency limiter not initialized, using defaults (1, 0ms)');
    concurrencyLimiter = new ConcurrencyLimiter(1, 0);
  }

  // Wrap the actual generation in the limiter
  return concurrencyLimiter.run(async () => {
    // Apply common tags if provided
    const enhancedPrompt =
      commonTags && tagsPosition
        ? applyCommonTags(prompt, commonTags, tagsPosition)
        : prompt;

    logger.info('Generating image for prompt:', enhancedPrompt);
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

      logger.info('Calling SD command...');
      const imageUrl = await sdCommand.callback(
        {quiet: 'true'},
        enhancedPrompt
      );

      const duration = performance.now() - startTime;
      logger.info(
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
 * Replaces all image prompts in text with actual generated images
 * @param text - Text containing image prompts
 * @param context - SillyTavern context
 * @param patterns - Optional array of regex pattern strings to use for detection
 * @param commonTags - Optional common style tags to apply
 * @param tagsPosition - Position for common tags ('prefix' or 'suffix')
 * @returns Text with prompts replaced by image tags
 */
export async function replacePromptsWithImages(
  text: string,
  context: SillyTavernContext,
  patterns?: string[],
  commonTags?: string,
  tagsPosition?: 'prefix' | 'suffix'
): Promise<string> {
  const matches = extractImagePrompts(text, patterns);

  logger.info('Found', matches.length, 'image prompts to process');

  if (matches.length === 0) {
    return text;
  }

  logger.info(
    'Extracted prompts:',
    matches.map(m => m.prompt)
  );

  // Show notification that image generation is starting
  const imageCount = matches.length;
  toastr.info(tCount(imageCount, 'toast.generatingImages'), t('extensionName'));

  // Generate images sequentially to avoid rate limiting
  const batchStartTime = performance.now();
  const imageUrls: (string | null)[] = [];
  for (const match of matches) {
    const imageUrl = await generateImage(
      match.prompt,
      context,
      commonTags,
      tagsPosition
    );
    imageUrls.push(imageUrl);
  }

  const batchDuration = performance.now() - batchStartTime;
  const successCount = imageUrls.filter(u => u).length;
  logger.info(
    `Generated ${successCount} images successfully (total time: ${batchDuration.toFixed(0)}ms, avg: ${(batchDuration / imageCount).toFixed(0)}ms per image)`
  );

  // Show completion notification
  if (successCount === imageCount) {
    toastr.success(
      tCount(successCount, 'toast.successGenerated'),
      t('extensionName')
    );
  } else if (successCount > 0) {
    toastr.warning(
      t('toast.partialGenerated', {success: successCount, total: imageCount}),
      t('extensionName')
    );
  } else {
    toastr.error(t('toast.failedToGenerate'), t('extensionName'));
  }

  // Replace prompts with images in reverse order to preserve indices
  let result = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const imageUrl = imageUrls[i];

    if (imageUrl) {
      // Use helper to insert image after prompt
      const insertion = insertImageAfterPrompt(
        result,
        match.fullMatch,
        imageUrl,
        i
      );
      if (insertion.success) {
        result = insertion.text;
        logger.info('Added image after prompt at index', i);
      }
    } else {
      // Keep the prompt tag even if generation failed
      // This allows users to see what was attempted and enables manual retry
      logger.info(
        'Image generation failed for prompt at index',
        i,
        '- keeping tag'
      );
    }
  }

  return result;
}

/**
 * Inserts all deferred images into a message after streaming completes
 * Builds complete final text with all images, then sets message.mes once
 * This avoids race conditions with SillyTavern's streaming finalization
 * @param deferredImages - Array of deferred images to insert
 * @param messageId - Message ID to update
 * @param context - SillyTavern context
 * @returns Number of successfully inserted images
 */
export async function insertDeferredImages(
  deferredImages: DeferredImage[],
  messageId: number,
  context: SillyTavernContext
): Promise<number> {
  if (deferredImages.length === 0) {
    return 0;
  }

  logger.info(
    `Batch inserting ${deferredImages.length} deferred images into message ${messageId}`
  );

  // Get current message
  const message = context.chat?.[messageId];
  if (!message) {
    logger.warn('Message not found for batch insertion:', messageId);
    return 0;
  }

  // Read message text ONCE at start
  let finalText = message.mes || '';
  const originalLength = finalText.length;

  // Sort images by position (first to last)
  const sortedImages = [...deferredImages].sort(
    (a, b) => a.prompt.startIndex - b.prompt.startIndex
  );

  let successCount = 0;

  // Insert images in reverse order to preserve positions
  // (inserting from end backwards keeps earlier positions valid)
  for (let i = sortedImages.length - 1; i >= 0; i--) {
    const {prompt, imageUrl} = sortedImages[i];

    // Use helper to insert image
    const insertion = insertImageAfterPrompt(
      finalText,
      prompt.fullMatch,
      imageUrl,
      i
    );

    if (insertion.success) {
      finalText = insertion.text;
      successCount++;
    }
  }

  // Set message.mes ONCE with all images inserted
  message.mes = finalText;

  logger.info(
    `Batch insertion complete: ${successCount}/${deferredImages.length} images inserted (${originalLength} -> ${finalText.length} chars)`
  );

  // Emit MESSAGE_EDITED first to trigger regex "Run on Edit"
  // This allows regex scripts to modify message.mes before rendering
  const MESSAGE_EDITED = context.eventTypes.MESSAGE_EDITED;
  await context.eventSource.emit(MESSAGE_EDITED, messageId);

  // Re-render the message block to display images in DOM
  // This calls messageFormatting() which processes <img> tags into rendered HTML
  // Same approach used by updateMessageBlock in reasoning.js and translate extension
  context.updateMessageBlock(messageId, message);

  // Emit MESSAGE_UPDATED to notify other extensions
  const MESSAGE_UPDATED = context.eventTypes.MESSAGE_UPDATED;
  await context.eventSource.emit(MESSAGE_UPDATED, messageId);

  // Save the chat to persist the inserted images
  await context.saveChat();
  logger.debug('Chat saved after inserting deferred images');

  return successCount;
}
