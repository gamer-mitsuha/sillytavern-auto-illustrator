/**
 * Image Generator Module
 * Handles image generation using the SD slash command and replacing prompts with images
 */

import {extractImagePrompts} from './image_extractor';
import type {DeferredImage} from './types';
import {createLogger} from './logger';

const logger = createLogger('Generator');

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
 * @param promptText - The prompt text to search for
 * @param imageUrl - URL of the image to insert
 * @param index - Index of the image
 * @returns Updated text and success status
 */
function insertImageAfterPrompt(
  text: string,
  promptText: string,
  imageUrl: string,
  index: number
): {text: string; success: boolean} {
  const expectedTag = `<img_prompt="${promptText}">`;
  const tagIndex = text.indexOf(expectedTag);

  if (tagIndex === -1) {
    logger.warn('Could not find prompt tag in text:', expectedTag);
    return {text, success: false};
  }

  const actualEndIndex = tagIndex + expectedTag.length;

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
 * @returns URL of generated image or null on failure
 */
export async function generateImage(
  prompt: string,
  context: SillyTavernContext
): Promise<string | null> {
  logger.info('Generating image for prompt:', prompt);

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
    const imageUrl = await sdCommand.callback({quiet: 'true'}, prompt);

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
}

/**
 * Replaces all image prompts in text with actual generated images
 * @param text - Text containing image prompts
 * @param context - SillyTavern context
 * @returns Text with prompts replaced by image tags
 */
export async function replacePromptsWithImages(
  text: string,
  context: SillyTavernContext
): Promise<string> {
  const matches = extractImagePrompts(text);

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
  toastr.info(
    `Generating ${imageCount} image${imageCount > 1 ? 's' : ''}...`,
    'Auto Illustrator'
  );

  // Generate images sequentially to avoid rate limiting
  const batchStartTime = performance.now();
  const imageUrls: (string | null)[] = [];
  for (const match of matches) {
    const imageUrl = await generateImage(match.prompt, context);
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
      `Successfully generated ${successCount} image${successCount > 1 ? 's' : ''}`,
      'Auto Illustrator'
    );
  } else if (successCount > 0) {
    toastr.warning(
      `Generated ${successCount} of ${imageCount} images`,
      'Auto Illustrator'
    );
  } else {
    toastr.error('Failed to generate images', 'Auto Illustrator');
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
        match.prompt,
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
      prompt.prompt,
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
