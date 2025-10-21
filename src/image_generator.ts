/**
 * Image Generator Module
 * Handles image generation using the SD slash command and replacing prompts with images
 */

import Bottleneck from 'bottleneck';
import type {DeferredImage} from './types';
import {createLogger} from './logger';
import {attachRegenerationHandlers} from './manual_generation';
import {renderMessageUpdate} from './utils/message_renderer';
import {
  checkIdempotency,
  createImageTag,
  microDelay,
  validateMessageState,
  DEFAULT_RECONCILIATION_CONFIG,
  type ReconciliationConfig,
} from './reconciliation';
import {htmlEncode} from './utils/dom_utils';

const logger = createLogger('Generator');

// Reconciliation configuration (can be updated via settings if needed)
let reconciliationConfig: ReconciliationConfig = {
  ...DEFAULT_RECONCILIATION_CONFIG,
};

/**
 * Updates reconciliation configuration
 * @param config - Partial configuration to update
 */
export function updateReconciliationConfig(
  config: Partial<ReconciliationConfig>
): void {
  reconciliationConfig = {...reconciliationConfig, ...config};
  logger.info('Reconciliation config updated:', reconciliationConfig);
}

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

// Old createImageTag and insertImageAfterPrompt functions removed
// Now using the shared createImageTag function from reconciliation.ts

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
 * Includes idempotency checks, validation, and reconciliation support
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
  metadata: import('./types').AutoIllustratorChatMetadata,
  settings: AutoIllustratorSettings
): Promise<number> {
  if (deferredImages.length === 0) {
    logger.debug(`No deferred images to insert for message ${messageId}`);
    return 0;
  }

  logger.info(
    `Batch inserting ${deferredImages.length} deferred images into message ${messageId}`
  );

  // Apply micro-delay to allow other post-processors to finish
  if (
    reconciliationConfig.enableMarkers &&
    reconciliationConfig.insertionDelayMs > 0
  ) {
    logger.debug(
      `Applying ${reconciliationConfig.insertionDelayMs}ms micro-delay before insertion`
    );
    await microDelay(reconciliationConfig.insertionDelayMs);
  }

  // Get current message
  const message = context.chat?.[messageId];
  if (!message) {
    logger.warn(`Message ${messageId} not found, skipping insertion`);
    return 0;
  }

  // Read message text ONCE at start (after micro-delay)
  let updatedText = message.mes || '';
  const originalLength = updatedText.length;

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

        // Create new image tag using shared function (no marker since we're replacing)
        // Note: createImageTag returns with newlines, but we trim them for replacement
        const newImgTagWithNewlines = createImageTag(
          deferred.imageUrl,
          queuedPrompt.prompt,
          deferred.promptId,
          false, // Don't include marker - it already exists from original insertion
          deferred.isFailed || false,
          settings.imageDisplayWidth // Use current width setting
        );
        // Extract just the img tag without surrounding newlines for clean replacement
        const newImgTag = newImgTagWithNewlines.trim();

        logger.debug(
          `Regeneration mode: ${mode} for ${targetUrl.substring(0, 50)}...`
        );

        if (mode === 'replace-image') {
          // Replace existing <img> tag
          // IMPORTANT: Message text has HTML-encoded URLs (e.g., &amp;), so we need to encode targetUrl
          const encodedTargetUrl = htmlEncode(targetUrl);
          const escapedTargetUrl = escapeRegexSpecialChars(encodedTargetUrl);
          const imgPattern = new RegExp(
            `<img[^>]*src="${escapedTargetUrl}"[^>]*>`,
            'g'
          );

          const beforeReplace = updatedText.length;
          updatedText = updatedText.replace(imgPattern, newImgTag);

          if (updatedText.length !== beforeReplace) {
            logger.debug(`Replaced image: ${targetUrl.substring(0, 50)}...`);
            successCount++;
          } else {
            logger.warn(
              `Failed to find/replace image: ${targetUrl.substring(0, 50)}...`
            );
            logger.debug(
              `Looking for encoded URL: ${encodedTargetUrl.substring(0, 100)}...`
            );
            logger.debug(`Message text length: ${updatedText.length}`);
            logger.debug(
              `Message contains target URL (raw): ${updatedText.includes(targetUrl)}`
            );
            logger.debug(
              `Message contains target URL (encoded): ${updatedText.includes(encodedTargetUrl)}`
            );
          }
        } else if (mode === 'append-after-image') {
          // Insert after existing <img> tag
          // IMPORTANT: Message text has HTML-encoded URLs (e.g., &amp;), so we need to encode targetUrl
          const encodedTargetUrl = htmlEncode(targetUrl);
          const escapedTargetUrl = escapeRegexSpecialChars(encodedTargetUrl);
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
            logger.debug(
              `Looking for encoded URL: ${encodedTargetUrl.substring(0, 100)}...`
            );
            logger.debug(`Message text length: ${updatedText.length}`);
            logger.debug(
              `Message contains target URL (raw): ${updatedText.includes(targetUrl)}`
            );
            logger.debug(
              `Message contains target URL (encoded): ${updatedText.includes(encodedTargetUrl)}`
            );
          }
        }

        // Link new image to prompt (updates or replaces old association)
        if (queuedPrompt.targetPromptId) {
          logger.info('=== DEBUG: Linking regenerated image ===');
          logger.info(`Image URL (raw): ${deferred.imageUrl}`);
          logger.info(`Prompt ID: ${queuedPrompt.targetPromptId}`);

          await linkImageToPrompt(
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

        // Idempotency check: skip if already inserted
        if (reconciliationConfig.enableMarkers) {
          const idempotencyCheck = checkIdempotency(
            updatedText,
            deferred.promptId,
            deferred.imageUrl
          );

          if (idempotencyCheck.alreadyInserted) {
            logger.debug(
              `Skipping duplicate insertion for prompt ${deferred.promptId}`
            );
            continue; // Skip this image
          }
        }

        // Message validation: check if message modified since detection
        if (reconciliationConfig.enableValidation && queuedPrompt.messageHash) {
          const validation = validateMessageState(
            '', // We don't have original text stored, just check hash
            updatedText
          );

          // Log warning if significant changes detected
          if (validation.modified) {
            logger.warn(
              `Message ${messageId} appears modified since prompt detection (${validation.changePercent}% change)`
            );
            logger.warn(
              'Proceeding with insertion, but position may be incorrect'
            );
          }
        }

        // Find insertion position using the stored fullMatch string
        // This is more reliable than re-extracting with regex, especially
        // if the message text was modified by SillyTavern or other extensions
        const fullMatch = queuedPrompt.fullMatch;
        const matchPosition = updatedText.indexOf(fullMatch);

        if (matchPosition >= 0) {
          // Found the exact prompt tag that was queued
          const insertPosition = matchPosition + fullMatch.length;

          // Create image tag using shared function
          // Works for both normal images and failed placeholders (both use img tags)
          const contentToInsert = createImageTag(
            deferred.imageUrl,
            queuedPrompt.prompt,
            deferred.promptId,
            reconciliationConfig.enableMarkers,
            deferred.isFailed || false, // Pass isFailed flag for placeholder styling
            settings.imageDisplayWidth // Pass display width from settings
          );

          // Insert after prompt tag
          updatedText =
            updatedText.substring(0, insertPosition) +
            contentToInsert +
            updatedText.substring(insertPosition);

          successCount++;

          const imageType = deferred.isFailed
            ? 'failed placeholder'
            : 'new image';
          logger.debug(
            `Inserted ${imageType} after prompt at position ${insertPosition}${reconciliationConfig.enableMarkers ? ' (with marker)' : ''}`
          );

          // Link image to prompt using prompt_manager
          logger.info(`=== DEBUG: Linking ${imageType} ===`);
          logger.info(`Image URL: ${deferred.imageUrl}`);
          logger.info(`Prompt ID: ${deferred.promptId}`);

          await linkImageToPrompt(
            deferred.promptId,
            deferred.imageUrl,
            metadata
          );
          logger.debug(`Linked ${imageType} to prompt: ${deferred.promptId}`);
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

  // Set up one-time listener BEFORE rendering to ensure DOM is ready
  // This prevents race condition where querySelector returns null if DOM not updated yet
  if (settings) {
    const MESSAGE_UPDATED = context.eventTypes.MESSAGE_UPDATED;
    context.eventSource.once(MESSAGE_UPDATED, () => {
      attachRegenerationHandlers(messageId, context, settings);
      logger.debug('Attached click handlers after DOM update');
    });
  }

  // Render message with proper event sequence and save
  // This will emit MESSAGE_UPDATED when DOM is updated, triggering handler attachment
  await renderMessageUpdate(messageId);

  // Post-insertion verification: check that images survived
  if (reconciliationConfig.enableMarkers && successCount > 0) {
    const finalMessage = context.chat?.[messageId];
    if (finalMessage) {
      const finalText = finalMessage.mes || '';
      let verifiedCount = 0;

      for (const deferred of deferredImages) {
        const idempotencyCheck = checkIdempotency(
          finalText,
          deferred.promptId,
          deferred.imageUrl
        );

        if (idempotencyCheck.alreadyInserted) {
          verifiedCount++;
        } else {
          logger.warn(
            `Post-insertion verification failed: image missing for prompt ${deferred.promptId}`
          );
          logger.warn(
            'Image may have been removed by another handler after insertion'
          );
        }
      }

      if (verifiedCount < successCount) {
        logger.error(
          `Post-insertion verification: only ${verifiedCount}/${successCount} images verified`
        );
        logger.error(
          'Some images were removed after insertion - consider running reconciliation'
        );
      } else {
        logger.debug(
          `Post-insertion verification: all ${successCount} images verified`
        );
      }
    }
  }

  return successCount;
}

/**
 * Escapes special regex characters for use in RegExp constructor
 * @param str - String to escape
 * @returns Escaped string safe for regex
 */
function escapeRegexSpecialChars(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
