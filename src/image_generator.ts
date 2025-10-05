/**
 * Image Generator Module
 * Handles image generation using the SD slash command and replacing prompts with images
 */

import {extractImagePrompts} from './image_extractor';
import {QueuedPrompt} from './streaming_image_queue';

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
  console.log('[Auto Illustrator] Generating image for prompt:', prompt);

  const startTime = performance.now();

  try {
    const sdCommand = context.SlashCommandParser?.commands?.['sd'];
    if (!sdCommand || !sdCommand.callback) {
      console.error('[Auto Illustrator] SD command not available');
      console.log(
        '[Auto Illustrator] Available commands:',
        Object.keys(context.SlashCommandParser?.commands || {})
      );
      return null;
    }

    console.log('[Auto Illustrator] Calling SD command...');
    const imageUrl = await sdCommand.callback({quiet: 'true'}, prompt);

    const duration = performance.now() - startTime;
    console.log(
      `[Auto Illustrator] Generated image URL: ${imageUrl} (took ${duration.toFixed(0)}ms)`
    );

    return imageUrl;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(
      `[Auto Illustrator] Error generating image (after ${duration.toFixed(0)}ms):`,
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

  console.log(
    '[Auto Illustrator] Found',
    matches.length,
    'image prompts to process'
  );

  if (matches.length === 0) {
    return text;
  }

  console.log(
    '[Auto Illustrator] Extracted prompts:',
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
  console.log(
    `[Auto Illustrator] Generated ${successCount} images successfully (total time: ${batchDuration.toFixed(0)}ms, avg: ${(batchDuration / imageCount).toFixed(0)}ms per image)`
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
      // Preserve the original prompt tag and add image on next line
      const imgTag = `<img src="${imageUrl}" title="${match.prompt}" alt="${match.prompt}">`;
      result =
        result.substring(0, match.endIndex) +
        '\n' +
        imgTag +
        result.substring(match.endIndex);
      console.log('[Auto Illustrator] Added image after prompt at index', i);
    } else {
      // Keep the prompt tag even if generation failed
      // This allows users to see what was attempted and enables manual retry
      console.log(
        '[Auto Illustrator] Image generation failed for prompt at index',
        i,
        '- keeping tag'
      );
    }
  }

  return result;
}

/**
 * Result of image insertion into streaming message
 */
export interface ImageInsertionResult {
  success: boolean;
  insertionPoint?: number;
  insertedLength?: number;
}

/**
 * Inserts a single generated image into a message during streaming
 * @param promptInfo - Queued prompt information
 * @param imageUrl - Generated image URL
 * @param messageId - Message ID to update
 * @param context - SillyTavern context
 * @returns Insertion result with position details for queue adjustment
 */
export async function insertImageIntoMessage(
  promptInfo: QueuedPrompt,
  imageUrl: string,
  messageId: number,
  context: SillyTavernContext
): Promise<ImageInsertionResult> {
  console.log(
    `[Auto Illustrator] Inserting image into message ${messageId} at position ${promptInfo.endIndex}`
  );

  try {
    // Get current message
    const message = context.chat?.[messageId];
    if (!message) {
      console.warn(
        '[Auto Illustrator] Message not found for image insertion:',
        messageId
      );
      return {success: false};
    }

    const currentText = message.mes || '';

    // Find the exact prompt tag in the current text
    // Positions should have been adjusted by adjustPositionsAfterInsertion()
    // Search in a region around the stored position to account for minor shifts
    const expectedTag = `<img_prompt="${promptInfo.prompt}">`;
    const searchStart = Math.max(0, promptInfo.startIndex - 100);
    const searchEnd = Math.min(
      currentText.length,
      promptInfo.endIndex + expectedTag.length + 100
    );
    const searchRegion = currentText.substring(searchStart, searchEnd);

    const tagIndex = searchRegion.indexOf(expectedTag);

    if (tagIndex === -1) {
      console.warn(
        '[Auto Illustrator] Could not find prompt tag in search region:',
        expectedTag,
        '\nSearch region:',
        searchRegion.substring(0, 200) + '...'
      );
      return {success: false};
    }

    // Calculate actual position in full text
    const actualStartIndex = searchStart + tagIndex;
    const actualEndIndex = actualStartIndex + expectedTag.length;

    // Check if image already inserted (to prevent duplicates)
    const afterPrompt = currentText.substring(
      actualEndIndex,
      actualEndIndex + 200
    );
    if (afterPrompt.includes(`src="${imageUrl}"`)) {
      console.log(
        '[Auto Illustrator] Image already inserted, skipping:',
        imageUrl
      );
      return {success: false};
    }

    // Insert image tag after the prompt using the stored prompt text
    const imgTag = `<img src="${imageUrl}" title="${promptInfo.prompt}" alt="${promptInfo.prompt}">`;
    const insertedText = '\n' + imgTag;
    const newText =
      currentText.substring(0, actualEndIndex) +
      insertedText +
      currentText.substring(actualEndIndex);

    // Update message
    message.mes = newText;

    console.log(
      `[Auto Illustrator] Inserted image into streaming message (${currentText.length} -> ${newText.length} chars)`
    );

    // Emit MESSAGE_EDITED to trigger UI update
    const MESSAGE_EDITED =
      context.eventTypes?.MESSAGE_EDITED || 'MESSAGE_EDITED';
    context.eventSource.emit(MESSAGE_EDITED, messageId);

    // Return insertion details so caller can adjust queue positions
    return {
      success: true,
      insertionPoint: actualEndIndex,
      insertedLength: insertedText.length,
    };
  } catch (error) {
    console.error('[Auto Illustrator] Error inserting image:', error);
    return {success: false};
  }
}
