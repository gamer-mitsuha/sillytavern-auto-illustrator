/**
 * Manual Generation Module
 * Handles manual image generation for existing img_prompt tags
 *
 * TODO: Address technical debt identified in external code review:
 * 1. Use settings.promptDetectionPatterns instead of default patterns for consistency
 *    (currently addManualGenerationButton uses hasImagePrompts without custom patterns)
 * 2. Add HTML attribute escaping for img tag title/src attributes to prevent
 *    attribute injection in edge cases (e.g., prompt contains quotes)
 */

import {extractImagePrompts, hasImagePrompts} from './image_extractor';
import {generateImage} from './image_generator';
import type {
  ManualGenerationMode,
  ImagePromptMatch,
  PromptPosition,
} from './types';
import {createLogger} from './logger';
import {t, tCount} from './i18n';
import {isStreamingActive} from './index';
import {
  getCurrentPromptId,
  getPromptText,
  recordPrompt,
  initializePromptPosition,
} from './prompt_metadata';
import {updatePromptForPosition} from './prompt_updater';
import {progressManager} from './progress_manager';
import {scheduleDomOperation} from './dom_queue';

const logger = createLogger('ManualGen');

/**
 * Escapes HTML attribute values to prevent XSS and rendering issues
 * @param str - String to escape
 * @returns Escaped string safe for HTML attributes
 */
export function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Checks if a prompt already has an image after it
 * @param text - Message text
 * @param promptText - The prompt to check
 * @param patterns - Optional array of regex pattern strings to use for detection
 * @returns True if image exists after this prompt
 */
export function hasExistingImage(
  text: string,
  promptText: string,
  patterns?: string[]
): boolean {
  // Find the prompt using multi-pattern detection
  const prompts = extractImagePrompts(text, patterns);
  const matchingPrompt = prompts.find(p => p.prompt === promptText);

  if (!matchingPrompt) {
    return false;
  }

  // Check if there's an img tag immediately after the prompt
  const afterPrompt = text.substring(
    matchingPrompt.endIndex,
    matchingPrompt.endIndex + 200
  );

  return afterPrompt.trimStart().startsWith('<img');
}

/**
 * Removes existing images that follow img_prompt tags
 * @param text - Message text
 * @param patterns - Optional array of regex pattern strings to use for detection
 * @returns Text with existing images removed
 */
export function removeExistingImages(
  text: string,
  patterns?: string[]
): string {
  // Extract all prompts with their positions
  const prompts = extractImagePrompts(text, patterns);

  // Process in reverse order to preserve indices
  let result = text;
  for (let i = prompts.length - 1; i >= 0; i--) {
    const prompt = prompts[i];
    const afterPrompt = result.substring(prompt.endIndex);

    // Find all consecutive images after this prompt
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

  return result;
}

/**
 * Core function that generates and inserts a single image
 * This is the shared logic used by both batch generation and individual regeneration
 * @param messageId - Message index in chat array
 * @param promptText - The prompt text to generate from
 * @param promptMatch - The prompt match with position information
 * @param mode - Generation mode (replace or append)
 * @param context - SillyTavern context
 * @param settings - Extension settings
 * @param imageIndexForTitle - Image number for title (1-based)
 * @param existingImageSrc - Optional: if provided, replaces this specific image in replace mode
 * @param isRegeneration - If true, adds "(Regenerated N)" suffix to title
 * @returns True if image was successfully generated and inserted
 */
async function generateAndInsertSingleImage(
  messageId: number,
  promptText: string,
  promptMatch: ImagePromptMatch,
  mode: ManualGenerationMode,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings,
  imageIndexForTitle: number,
  existingImageSrc?: string,
  isRegeneration?: boolean
): Promise<boolean> {
  try {
    // Generate image
    const imageUrl = await generateImage(
      promptText,
      context,
      settings.commonStyleTags,
      settings.commonStyleTagsPosition
    );

    if (!imageUrl) {
      return false;
    }

    // Re-read message after generation to get latest state
    const message = context.chat?.[messageId];
    if (!message) {
      logger.error('Message not found after generation:', messageId);
      return false;
    }

    let text = message.mes || '';

    // Find the prompt tag in current text
    const prompts = extractImagePrompts(text, settings.promptDetectionPatterns);
    const currentPromptMatch = prompts.find(p => p.prompt === promptText);

    if (!currentPromptMatch) {
      logger.error('Prompt tag not found in text after generation');
      return false;
    }

    const promptTag = currentPromptMatch.fullMatch;
    const promptIndex = currentPromptMatch.startIndex;
    let insertPos = promptIndex + promptTag.length;

    // In replace mode with specific image, remove that image first
    if (mode === 'replace' && existingImageSrc) {
      const afterPrompt = text.substring(insertPos);
      const escapedSrc = existingImageSrc.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );
      const imgPattern = new RegExp(
        `\\s*<img\\s+src="${escapedSrc}"[^>]*>`,
        ''
      );
      const imgMatch = afterPrompt.match(imgPattern);

      if (imgMatch && imgMatch.index !== undefined) {
        const imgStart = insertPos + imgMatch.index;
        const imgEnd = imgStart + imgMatch[0].length;
        text = text.substring(0, imgStart) + text.substring(imgEnd);
        insertPos = imgStart;
        logger.debug('Removed existing image for replacement');
      }
    } else if (mode === 'append' || (mode === 'replace' && !existingImageSrc)) {
      // In append mode or replace without specific image, find position after existing images
      const afterPrompt = text.substring(insertPos);
      const imgTagRegex = /\s*<img\s+[^>]*>/g;
      let lastMatchEnd = 0;
      let match;

      while ((match = imgTagRegex.exec(afterPrompt)) !== null) {
        if (
          match.index === lastMatchEnd ||
          afterPrompt.substring(lastMatchEnd, match.index).trim() === ''
        ) {
          lastMatchEnd = imgTagRegex.lastIndex;
        } else {
          break;
        }
      }

      if (lastMatchEnd > 0) {
        insertPos += lastMatchEnd;
      }
    }

    // Create image tag with appropriate title
    let imageTitle = `AI generated image #${imageIndexForTitle}`;
    if (isRegeneration) {
      // Count existing regenerations for this image index
      const regenCount = countRegeneratedImages(
        text,
        promptText,
        imageIndexForTitle,
        settings.promptDetectionPatterns
      );
      const nextRegenNumber = regenCount + 1;
      imageTitle = `AI generated image #${imageIndexForTitle} (Regenerated ${nextRegenNumber})`;
    }
    const imageTag = `\n<img src="${escapeHtmlAttr(imageUrl)}" title="${escapeHtmlAttr(imageTitle)}" alt="${escapeHtmlAttr(imageTitle)}">`;

    // Insert image
    text = text.substring(0, insertPos) + imageTag + text.substring(insertPos);
    message.mes = text;

    // Emit proper event sequence for DOM update
    const MESSAGE_EDITED = context.eventTypes.MESSAGE_EDITED;
    await context.eventSource.emit(MESSAGE_EDITED, messageId);

    context.updateMessageBlock(messageId, message);

    const MESSAGE_UPDATED = context.eventTypes.MESSAGE_UPDATED;
    await context.eventSource.emit(MESSAGE_UPDATED, messageId);

    // Save chat
    await context.saveChat();

    return true;
  } catch (error) {
    logger.error('Error generating and inserting image:', error);
    return false;
  }
}

/**
 * Generates images for all prompts in a message
 * Operations are serialized per-message via DOM queue
 * @param messageId - Message index in chat array
 * @param mode - Generation mode (replace or append)
 * @param context - SillyTavern context
 * @param settings - Extension settings
 * @returns Number of successfully generated images
 */
export async function generateImagesForMessage(
  messageId: number,
  mode: ManualGenerationMode,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<number> {
  try {
    // Check if streaming is active for this message
    if (isStreamingActive(messageId)) {
      logger.warn(
        `Cannot generate images for message ${messageId}: streaming is active`
      );
      toastr.warning(
        t('toast.cannotGenerateMessageStreaming'),
        t('extensionName')
      );
      return 0;
    }

    logger.info(`Generating images for message ${messageId} in ${mode} mode`);

    const message = context.chat?.[messageId];
    if (!message) {
      logger.warn('Message not found:', messageId);
      toastr.error(t('toast.messageNotFound'), t('extensionName'));
      return 0;
    }

    let text = message.mes;

    // Extract prompts before any modifications to check if there are any
    const initialPrompts = extractImagePrompts(
      text,
      settings.promptDetectionPatterns
    );
    if (initialPrompts.length === 0) {
      logger.info('No prompts found in message');
      toastr.info(t('toast.noPromptsFound'), t('extensionName'));
      return 0;
    }

    logger.info(`Found ${initialPrompts.length} prompts`);

    // In replace mode, remove existing images first
    if (mode === 'replace') {
      const originalLength = text.length;
      text = removeExistingImages(text, settings.promptDetectionPatterns);
      message.mes = text;
      logger.info(
        `Replace mode: removed existing images (${originalLength} -> ${text.length} chars)`
      );
    } else {
      logger.info('Append mode: will append new images after existing ones');
    }

    // Re-extract prompts AFTER text modifications to get correct positions
    const promptsToGenerate = extractImagePrompts(
      text,
      settings.promptDetectionPatterns
    );

    // Show start notification
    toastr.info(
      tCount(promptsToGenerate.length, 'toast.generatingImages'),
      t('extensionName')
    );

    // Register batch generation tasks
    progressManager.registerTask(messageId, promptsToGenerate.length);

    const startTime = performance.now();
    let successCount = 0;

    // Generate and insert images one at a time (progressive display)
    for (let i = 0; i < promptsToGenerate.length; i++) {
      const prompt = promptsToGenerate[i];
      logger.info(`Generating image ${i + 1}/${promptsToGenerate.length}`);

      // Use shared helper function wrapped in DOM queue operation
      const success = await scheduleDomOperation(
        messageId,
        async () => {
          return await generateAndInsertSingleImage(
            messageId,
            prompt.prompt,
            prompt,
            mode,
            context,
            settings,
            i + 1 // 1-based image number for title
          );
        },
        `batch image generation ${i + 1}/${promptsToGenerate.length}`
      );

      if (success) {
        successCount++;
        progressManager.completeTask(messageId);
      } else {
        progressManager.failTask(messageId);
      }
    }

    const duration = performance.now() - startTime;
    logger.info(
      `Generated ${successCount}/${promptsToGenerate.length} images (${duration.toFixed(0)}ms total)`
    );

    // Clear progress tracking now that batch is complete
    progressManager.clear(messageId);

    // Show completion notification
    if (successCount === promptsToGenerate.length) {
      toastr.success(
        tCount(successCount, 'toast.successGenerated'),
        t('extensionName')
      );
    } else if (successCount > 0) {
      toastr.warning(
        t('toast.partialGenerated', {
          success: successCount,
          total: promptsToGenerate.length,
        }),
        t('extensionName')
      );
    } else {
      toastr.error(t('toast.failedToGenerate'), t('extensionName'));
    }

    return successCount;
  } catch (error) {
    logger.error('Error during manual image generation:', error);
    toastr.error(t('toast.failedToGenerate'), t('extensionName'));
    // Clear progress tracking on error
    progressManager.clear(messageId);
    return 0;
  }
}

/**
 * Shows confirmation dialog and handles image generation
 * @param messageId - Message index in chat array
 * @param context - SillyTavern context
 * @param settings - Extension settings
 */
export async function showGenerationDialog(
  messageId: number,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<void> {
  // Check if streaming is active for this message
  if (isStreamingActive(messageId)) {
    toastr.warning(
      t('toast.cannotGenerateMessageStreaming'),
      t('extensionName')
    );
    return;
  }

  // Check if dialog already exists and close it (mobile behavior)
  const existingDialog = $('#auto_illustrator_manual_gen_dialog');
  if (existingDialog.length > 0) {
    logger.debug('Dialog already open, closing it');
    $('.auto-illustrator-dialog-backdrop').remove();
    existingDialog.remove();
    return;
  }

  const message = context.chat?.[messageId];
  if (!message) {
    logger.warn('Message not found:', messageId);
    return;
  }

  const prompts = extractImagePrompts(
    message.mes,
    settings.promptDetectionPatterns
  );
  if (prompts.length === 0) {
    toastr.info(t('toast.noPromptsFound'), t('extensionName'));
    return;
  }

  // Build dialog message
  const dialogMessage =
    tCount(prompts.length, 'dialog.foundPrompts') +
    '\n\n' +
    t('dialog.howToGenerate');

  // Show confirmation dialog with mode selection
  const mode = await new Promise<ManualGenerationMode | null>(resolve => {
    // Create backdrop
    const backdrop = $('<div>').addClass('auto-illustrator-dialog-backdrop');

    const dialog = $('<div>')
      .attr('id', 'auto_illustrator_manual_gen_dialog')
      .addClass('auto-illustrator-dialog');

    dialog.append($('<p>').text(dialogMessage));

    const modeGroup = $('<div>').addClass('auto-illustrator-mode-group');

    const replaceOption = $('<label>')
      .addClass('auto-illustrator-mode-option')
      .append(
        $('<input>')
          .attr('type', 'radio')
          .attr('name', 'generation_mode')
          .val('replace')
          .prop('checked', settings.manualGenerationMode === 'replace')
      )
      .append(
        $('<span>').html(
          `<strong>${t('dialog.replace')}</strong> ${t('dialog.replaceDesc')}`
        )
      );

    const appendOption = $('<label>')
      .addClass('auto-illustrator-mode-option')
      .append(
        $('<input>')
          .attr('type', 'radio')
          .attr('name', 'generation_mode')
          .val('append')
          .prop('checked', settings.manualGenerationMode === 'append')
      )
      .append(
        $('<span>').html(
          `<strong>${t('dialog.append')}</strong> ${t('dialog.appendDesc')}`
        )
      );

    modeGroup.append(appendOption).append(replaceOption);
    dialog.append(modeGroup);

    const buttons = $('<div>').addClass('auto-illustrator-dialog-buttons');

    const generateBtn = $('<button>')
      .text(t('dialog.generate'))
      .addClass('menu_button')
      .on('click', () => {
        const selectedMode = dialog
          .find('input[name="generation_mode"]:checked')
          .val() as ManualGenerationMode;
        backdrop.remove();
        dialog.remove();
        resolve(selectedMode);
      });

    const cancelBtn = $('<button>')
      .text(t('dialog.cancel'))
      .addClass('menu_button')
      .on('click', () => {
        backdrop.remove();
        dialog.remove();
        resolve(null);
      });

    buttons.append(generateBtn).append(cancelBtn);
    dialog.append(buttons);

    // Append backdrop and dialog to body
    $('body').append(backdrop).append(dialog);

    // Close on backdrop click
    backdrop.on('click', () => {
      backdrop.remove();
      dialog.remove();
      resolve(null);
    });
  });

  if (!mode) {
    logger.info('Generation cancelled by user');
    return;
  }

  // Generate images
  await generateImagesForMessage(messageId, mode, context, settings);
}

/**
 * Finds the prompt text for a given image in a message
 * @param text - Message text
 * @param imageSrc - Source URL of the image
 * @param patterns - Optional array of regex pattern strings to use for detection
 * @returns Prompt text or null if not found
 */
export function findPromptForImage(
  text: string,
  imageSrc: string,
  patterns?: string[]
): string | null {
  // Find the image tag in the text
  const imgPattern = new RegExp(
    `<img\\s+src="${imageSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`,
    'g'
  );
  const imgMatch = imgPattern.exec(text);

  if (!imgMatch) {
    logger.warn('Image not found in message text:', imageSrc);
    return null;
  }

  const imgIndex = imgMatch.index;

  // Search backwards from the image position to find the closest img_prompt tag
  const textBeforeImg = text.substring(0, imgIndex);

  // Use extractImagePrompts to find all prompts before the image
  const prompts = extractImagePrompts(textBeforeImg, patterns);

  if (prompts.length === 0) {
    logger.warn('No prompt found before image');
    return null;
  }

  // Return the last (closest) prompt
  return prompts[prompts.length - 1].prompt;
}

/**
 * Finds the prompt position for a given image in a message
 * @param messageId - Message ID
 * @param imageSrc - Source URL of the image
 * @param text - Message text
 * @param patterns - Optional array of regex pattern strings to use for detection
 * @returns PromptPosition or null if not found
 */
function findPromptPositionForImage(
  messageId: number,
  imageSrc: string,
  text: string,
  patterns?: string[]
): PromptPosition | null {
  // Find the image tag in the text
  const imgPattern = new RegExp(
    `<img\\s+src="${imageSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`,
    'g'
  );
  const imgMatch = imgPattern.exec(text);

  if (!imgMatch) {
    logger.warn('Image not found in message text:', imageSrc);
    return null;
  }

  const imgIndex = imgMatch.index;

  // Search backwards from the image position to find the closest img_prompt tag
  const textBeforeImg = text.substring(0, imgIndex);

  // Use extractImagePrompts to find all prompts before the image
  const promptsBeforeImg = extractImagePrompts(textBeforeImg, patterns);

  if (promptsBeforeImg.length === 0) {
    logger.warn('No prompt found before image');
    return null;
  }

  // The last prompt before the image is the one we want
  const targetPrompt = promptsBeforeImg[promptsBeforeImg.length - 1].prompt;

  // Now find the index of this prompt in the full message
  const allPrompts = extractImagePrompts(text, patterns);
  const promptIndex = allPrompts.findIndex(p => p.prompt === targetPrompt);

  if (promptIndex === -1) {
    logger.warn('Could not find prompt index in full message');
    return null;
  }

  return {messageId, promptIndex};
}

/**
 * Finds the index (1-based) of a specific image after a prompt
 * @param text - Message text
 * @param promptText - The prompt text
 * @param imageSrc - Source URL of the image to find
 * @param patterns - Optional array of regex pattern strings to use for detection
 * @returns 1-based index of the image, or null if not found
 */
function findImageIndexInPrompt(
  text: string,
  promptText: string,
  imageSrc: string,
  patterns?: string[]
): number | null {
  // Find the prompt tag using multi-pattern detection
  const prompts = extractImagePrompts(text, patterns);
  const matchingPrompt = prompts.find(p => p.prompt === promptText);

  if (!matchingPrompt) {
    return null;
  }

  const promptTag = matchingPrompt.fullMatch;
  const promptIndex = matchingPrompt.startIndex;
  const afterPrompt = text.substring(promptIndex + promptTag.length);
  const imgTagRegex = /\s*<img\s+[^>]*>/g;
  let index = 0;
  let lastMatchEnd = 0;
  let match;

  // Find consecutive images after the prompt
  while ((match = imgTagRegex.exec(afterPrompt)) !== null) {
    if (
      match.index === lastMatchEnd ||
      afterPrompt.substring(lastMatchEnd, match.index).trim() === ''
    ) {
      index++;
      lastMatchEnd = imgTagRegex.lastIndex;

      // Check if this image matches the src we're looking for
      if (match[0].includes(`src="${imageSrc}"`)) {
        return index;
      }
    } else {
      break;
    }
  }

  return null;
}

/**
 * Counts existing regenerated images for a specific image index
 * @param text - Message text
 * @param promptText - The prompt text
 * @param imageIndex - The 1-based index of the image
 * @param patterns - Optional array of regex pattern strings to use for detection
 * @returns Highest regeneration number found (0 if none exist)
 */
function countRegeneratedImages(
  text: string,
  promptText: string,
  imageIndex: number,
  patterns?: string[]
): number {
  // Find the prompt tag using multi-pattern detection
  const prompts = extractImagePrompts(text, patterns);
  const matchingPrompt = prompts.find(p => p.prompt === promptText);

  if (!matchingPrompt) {
    return 0;
  }

  const promptTag = matchingPrompt.fullMatch;
  const promptIndex = matchingPrompt.startIndex;
  const afterPrompt = text.substring(promptIndex + promptTag.length);
  const imgTagRegex = /\s*<img\s+[^>]*>/g;
  let maxRegenNumber = 0;
  let lastMatchEnd = 0;
  let match;

  // Pattern to match "AI generated image #N (Regenerated M)"
  const regenPattern = new RegExp(
    `AI generated image #${imageIndex} \\(Regenerated (\\d+)\\)`
  );

  // Find consecutive images after the prompt
  while ((match = imgTagRegex.exec(afterPrompt)) !== null) {
    if (
      match.index === lastMatchEnd ||
      afterPrompt.substring(lastMatchEnd, match.index).trim() === ''
    ) {
      lastMatchEnd = imgTagRegex.lastIndex;

      // Check if this is a regenerated image for our index
      const regenMatch = match[0].match(regenPattern);
      if (regenMatch) {
        const regenNumber = parseInt(regenMatch[1], 10);
        if (regenNumber > maxRegenNumber) {
          maxRegenNumber = regenNumber;
        }
      }
    } else {
      break;
    }
  }

  return maxRegenNumber;
}

/**
 * Regenerates a specific image in a message
 * Operations are serialized per-message via DOM queue
 * @param messageId - Message ID
 * @param imageSrc - Source URL of image to regenerate
 * @param mode - Replace or append
 * @param context - SillyTavern context
 * @param settings - Extension settings
 * @returns Number of images generated (0 or 1)
 */
export async function regenerateImage(
  messageId: number,
  imageSrc: string,
  mode: ManualGenerationMode,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<number> {
  // Register this regeneration request BEFORE scheduling
  // This ensures the counter is incremented even before DOM queue processing starts
  progressManager.registerTask(messageId, 1);
  logger.debug(`Registered regeneration task for message ${messageId}`);

  // Wrap in scheduleDomOperation to serialize with other message operations
  return scheduleDomOperation(
    messageId,
    async () => {
      try {
        // Check if streaming is active for this message
        if (isStreamingActive(messageId)) {
          logger.warn(
            `Cannot regenerate image for message ${messageId}: streaming is active`
          );
          toastr.warning(
            t('toast.cannotGenerateMessageStreaming'),
            t('extensionName')
          );
          // Cancel this task since we can't proceed
          progressManager.decrementTotal(messageId, 1);
          return 0;
        }

        // Initial message check
        const message = context.chat?.[messageId];
        if (!message) {
          logger.error('Message not found:', messageId);
          toastr.error(t('toast.messageNotFound'), t('extensionName'));
          progressManager.failTask(messageId);
          if (progressManager.isComplete(messageId)) {
            progressManager.clear(messageId);
          }
          return 0;
        }

        // Find the prompt for this image (using current message state)
        const promptText = findPromptForImage(
          message.mes || '',
          imageSrc,
          settings.promptDetectionPatterns
        );
        if (!promptText) {
          toastr.error(t('toast.promptNotFoundForImage'), t('extensionName'));
          progressManager.failTask(messageId);
          if (progressManager.isComplete(messageId)) {
            progressManager.clear(messageId);
          }
          return 0;
        }

        logger.info(
          `Regenerating image for prompt: "${promptText}" (mode: ${mode})`
        );

        // Determine which image index we're regenerating
        const imageIndex = findImageIndexInPrompt(
          message.mes || '',
          promptText,
          imageSrc,
          settings.promptDetectionPatterns
        );
        if (!imageIndex) {
          logger.error('Could not determine image index for regeneration');
          toastr.error(t('toast.failedToDetermineIndex'), t('extensionName'));
          progressManager.failTask(messageId);
          if (progressManager.isComplete(messageId)) {
            progressManager.clear(messageId);
          }
          return 0;
        }

        // Find the prompt match for passing to shared function
        const prompts = extractImagePrompts(
          message.mes || '',
          settings.promptDetectionPatterns
        );
        const matchingPrompt = prompts.find(p => p.prompt === promptText);
        if (!matchingPrompt) {
          logger.error('Prompt tag not found in text');
          toastr.error(t('toast.failedToFindPromptTag'), t('extensionName'));
          progressManager.failTask(messageId);
          if (progressManager.isComplete(messageId)) {
            progressManager.clear(messageId);
          }
          return 0;
        }

        // Generate and insert image using shared function
        toastr.info(t('toast.generatingNewImage'), t('extensionName'));
        const success = await generateAndInsertSingleImage(
          messageId,
          promptText,
          matchingPrompt,
          mode,
          context,
          settings,
          imageIndex, // Use the actual image index from the clicked image
          imageSrc, // Pass the existing image src for replace mode
          true // isRegeneration = true
        );

        if (!success) {
          toastr.error(t('toast.failedToGenerateImage'), t('extensionName'));
          progressManager.failTask(messageId);
          if (progressManager.isComplete(messageId)) {
            progressManager.clear(messageId);
          }
          return 0;
        }

        toastr.success(t('toast.imageRegenerated'), t('extensionName'));
        logger.info('Image regenerated successfully');
        progressManager.completeTask(messageId);

        // Only clear if all tasks are complete
        if (progressManager.isComplete(messageId)) {
          progressManager.clear(messageId);
        }

        // Re-attach click handlers to all images (including the new one)
        setTimeout(() => {
          addImageClickHandlers(context, settings);
        }, 100);

        return 1;
      } catch (error) {
        logger.error('Error during image regeneration:', error);
        toastr.error(t('toast.failedToGenerateImage'), t('extensionName'));
        progressManager.failTask(messageId);
        if (progressManager.isComplete(messageId)) {
          progressManager.clear(messageId);
        }
        return 0;
      }
    },
    'image regeneration'
  );
}

/**
 * Shows prompt update dialog for an image and handles the update
 * Operations are serialized per-message via DOM queue
 * @param messageId - Message ID
 * @param imageSrc - Source URL of image
 * @param context - SillyTavern context
 * @param settings - Extension settings
 */
async function showPromptUpdateDialog(
  messageId: number,
  imageSrc: string,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<void> {
  // Check if streaming is active for this message
  if (isStreamingActive(messageId)) {
    toastr.warning(t('toast.cannotManualWhileStreaming'), t('extensionName'));
    return;
  }

  // Wrap in scheduleDomOperation to serialize with other message operations
  const selectedMode = await scheduleDomOperation(
    messageId,
    async () => {
      return await showPromptUpdateDialogImpl(
        messageId,
        imageSrc,
        context,
        settings
      );
    },
    'prompt update dialog'
  );

  // If user chose to regenerate, regenerate the image
  // (regenerateImage also uses scheduleDomOperation, so it will be queued)
  if (selectedMode) {
    logger.info('Regenerating after prompt update', {mode: selectedMode});
    await regenerateImage(messageId, imageSrc, selectedMode, context, settings);
  }
}

/**
 * Internal implementation of prompt update dialog
 * @returns selected regeneration mode, or null if user cancelled
 */
async function showPromptUpdateDialogImpl(
  messageId: number,
  imageSrc: string,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<ManualGenerationMode | null> {
  // Check if dialog already exists and close it (mobile behavior)
  const existingDialog = $('#auto_illustrator_prompt_update_dialog');
  if (existingDialog.length > 0) {
    logger.debug('Dialog already open, closing it');
    $('.auto-illustrator-dialog-backdrop').remove();
    existingDialog.remove();
    return null;
  }

  const message = context.chat?.[messageId];
  if (!message) {
    logger.error('Message not found:', messageId);
    toastr.error(t('toast.messageNotFound'), t('extensionName'));
    return null;
  }

  logger.debug('showPromptUpdateDialogImpl called', {
    messageId,
    imageSrc,
    messageText: message.mes.substring(0, 200),
  });

  // Find prompt position for this image
  const position = findPromptPositionForImage(
    messageId,
    imageSrc,
    message.mes,
    settings.promptDetectionPatterns
  );

  if (!position) {
    logger.error('Could not find prompt position for image', {
      imageSrc,
      messageId,
    });
    toastr.error(t('toast.promptNotFoundForImage'), t('extensionName'));
    return null;
  }

  logger.debug('Found prompt position', position);

  // Get current prompt text
  const currentPromptId = getCurrentPromptId(position, context);
  const currentPromptMaybe = currentPromptId
    ? getPromptText(currentPromptId, context)
    : findPromptForImage(
        message.mes,
        imageSrc,
        settings.promptDetectionPatterns
      );

  if (!currentPromptMaybe) {
    toastr.error(t('toast.promptNotFoundForImage'), t('extensionName'));
    return null;
  }

  const currentPrompt: string = currentPromptMaybe;

  logger.debug('Current prompt extracted', {currentPrompt, currentPromptId});

  // Initialize prompt metadata if it doesn't exist (for legacy images)
  if (!currentPromptId) {
    logger.info('Initializing metadata for legacy prompt', {
      position,
      promptText: currentPrompt,
    });
    const newPromptId = recordPrompt(currentPrompt, context);
    // Initialize position history with this prompt as version 0
    initializePromptPosition(position, newPromptId, context);
  }

  // Show dialog to get user feedback
  const userFeedback = await new Promise<string | null>(resolve => {
    // Create backdrop
    const backdrop = $('<div>').addClass('auto-illustrator-dialog-backdrop');

    const dialog = $('<div>')
      .attr('id', 'auto_illustrator_prompt_update_dialog')
      .addClass('auto-illustrator-dialog');

    dialog.append($('<h3>').text(t('dialog.updatePromptTitle')));

    // Show current prompt (read-only)
    dialog.append($('<label>').text(t('dialog.currentPrompt')));
    const currentPromptDisplay = $('<div>')
      .addClass('auto-illustrator-current-prompt')
      .text(currentPrompt);
    dialog.append(currentPromptDisplay);

    // User feedback textarea
    dialog.append($('<label>').text(t('dialog.userFeedback')));
    const feedbackTextarea = $('<textarea>')
      .addClass('auto-illustrator-feedback-textarea')
      .attr('placeholder', t('dialog.feedbackPlaceholder'))
      .attr('rows', '4');
    dialog.append(feedbackTextarea);

    const buttons = $('<div>').addClass('auto-illustrator-dialog-buttons');

    const updateBtn = $('<button>')
      .text(t('dialog.updateWithAI'))
      .addClass('menu_button')
      .on('click', () => {
        const feedback = feedbackTextarea.val() as string;
        if (!feedback || feedback.trim() === '') {
          toastr.warning(t('toast.feedbackRequired'), t('extensionName'));
          return;
        }
        backdrop.remove();
        dialog.remove();
        resolve(feedback.trim());
      });

    const cancelBtn = $('<button>')
      .text(t('dialog.cancel'))
      .addClass('menu_button')
      .on('click', () => {
        backdrop.remove();
        dialog.remove();
        resolve(null);
      });

    buttons.append(updateBtn).append(cancelBtn);
    dialog.append(buttons);

    // Append backdrop and dialog to body
    $('body').append(backdrop).append(dialog);

    // Close on backdrop click
    backdrop.on('click', () => {
      backdrop.remove();
      dialog.remove();
      resolve(null);
    });

    // Focus on textarea
    feedbackTextarea.focus();
  });

  if (!userFeedback) {
    logger.info('Prompt update cancelled by user');
    return null;
  }

  // Update prompt using LLM
  try {
    toastr.info(t('toast.updatingPromptWithAI'), t('extensionName'));

    const newPromptId = await updatePromptForPosition(
      position,
      userFeedback,
      context
    );

    if (!newPromptId) {
      logger.error('Failed to update prompt - LLM returned null');
      toastr.error(t('toast.failedToUpdatePrompt'), t('extensionName'));
      return null;
    }

    // Get the actual prompt text from the ID
    const newPromptText = getPromptText(newPromptId, context);
    if (!newPromptText) {
      logger.error('Failed to get prompt text for new prompt ID');
      toastr.error(t('toast.failedToUpdatePrompt'), t('extensionName'));
      return null;
    }

    logger.info(`Prompt updated: "${currentPrompt}" -> "${newPromptText}"`);

    // Replace the old prompt in the message with the new one
    const prompts = extractImagePrompts(
      message.mes,
      settings.promptDetectionPatterns
    );
    const promptMatch = prompts[position.promptIndex];

    if (!promptMatch) {
      logger.error('Could not find prompt match in message');
      toastr.error(t('toast.failedToUpdatePrompt'), t('extensionName'));
      return null;
    }

    // Replace the prompt content in the tag
    let newText = message.mes;
    const oldTag = promptMatch.fullMatch;
    // Escape special regex characters in currentPrompt for safe replacement
    const escapedPrompt = currentPrompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const newTag = oldTag.replace(
      new RegExp(escapedPrompt, 'g'),
      newPromptText
    );

    newText = newText.replace(oldTag, newTag);
    message.mes = newText;

    // Emit proper event sequence for DOM update
    const MESSAGE_EDITED = context.eventTypes.MESSAGE_EDITED;
    await context.eventSource.emit(MESSAGE_EDITED, messageId);

    context.updateMessageBlock(messageId, message);

    const MESSAGE_UPDATED = context.eventTypes.MESSAGE_UPDATED;
    await context.eventSource.emit(MESSAGE_UPDATED, messageId);

    // Save chat
    await context.saveChat();

    toastr.success(t('toast.promptUpdated'), t('extensionName'));

    // Ask user if they want to regenerate and how
    const selectedMode = await new Promise<ManualGenerationMode | null>(
      resolve => {
        const backdrop = $('<div>').addClass(
          'auto-illustrator-dialog-backdrop'
        );

        const dialog = $('<div>')
          .attr('id', 'auto_illustrator_regen_confirm_dialog')
          .addClass('auto-illustrator-dialog');

        dialog.append(
          $('<p>').text(t('dialog.promptUpdatedRegenerateWithMode'))
        );

        // Add mode selection radio buttons
        const modeGroup = $('<div>').addClass('auto-illustrator-mode-group');

        const replaceOption = $('<label>')
          .addClass('auto-illustrator-mode-option')
          .append(
            $('<input>')
              .attr('type', 'radio')
              .attr('name', 'regen_mode')
              .val('replace')
              .prop('checked', settings.manualGenerationMode === 'replace')
          )
          .append(
            $('<span>').html(
              `<strong>${t('dialog.replace')}</strong> ${t('dialog.replaceRegen')}`
            )
          );

        const appendOption = $('<label>')
          .addClass('auto-illustrator-mode-option')
          .append(
            $('<input>')
              .attr('type', 'radio')
              .attr('name', 'regen_mode')
              .val('append')
              .prop('checked', settings.manualGenerationMode === 'append')
          )
          .append(
            $('<span>').html(
              `<strong>${t('dialog.append')}</strong> ${t('dialog.appendRegen')}`
            )
          );

        modeGroup.append(appendOption).append(replaceOption);
        dialog.append(modeGroup);

        const buttons = $('<div>').addClass('auto-illustrator-dialog-buttons');

        const generateBtn = $('<button>')
          .text(t('dialog.generate'))
          .addClass('menu_button')
          .on('click', () => {
            const mode = dialog
              .find('input[name="regen_mode"]:checked')
              .val() as ManualGenerationMode;
            backdrop.remove();
            dialog.remove();
            resolve(mode);
          });

        const cancelBtn = $('<button>')
          .text(t('dialog.cancel'))
          .addClass('menu_button')
          .on('click', () => {
            backdrop.remove();
            dialog.remove();
            resolve(null);
          });

        buttons.append(generateBtn).append(cancelBtn);
        dialog.append(buttons);

        $('body').append(backdrop).append(dialog);

        backdrop.on('click', () => {
          backdrop.remove();
          dialog.remove();
          resolve(null);
        });
      }
    );

    logger.info('User selected regeneration mode:', selectedMode);

    // Return selected mode (or null if cancelled)
    return selectedMode;
  } catch (error) {
    logger.error('Error updating prompt:', error);
    toastr.error(t('toast.failedToUpdatePrompt'), t('extensionName'));
    return null;
  }
}

/**
 * Deletes a specific image from a message
 * @param messageId - Message ID
 * @param imageSrc - Source URL of image to delete
 * @param context - SillyTavern context
 * @param settings - Extension settings
 * @returns True if image was deleted, false otherwise
 */
async function deleteImage(
  messageId: number,
  imageSrc: string,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<boolean> {
  // Wrap in scheduleDomOperation to serialize with other message operations
  return scheduleDomOperation(
    messageId,
    async () => {
      const message = context.chat?.[messageId];
      if (!message) {
        logger.error('Message not found:', messageId);
        toastr.error(t('toast.messageNotFound'), t('extensionName'));
        return false;
      }

      let text = message.mes || '';
      const originalLength = text.length;

      // Escape special characters in the image src for regex
      const escapedSrc = imageSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Find and remove the specific image tag
      const imgPattern = new RegExp(
        `\\s*<img\\s+src="${escapedSrc}"[^>]*>`,
        'g'
      );
      text = text.replace(imgPattern, '');

      // Check if anything was removed
      if (text.length === originalLength) {
        logger.warn('Image not found in message text');
        toastr.warning(t('toast.imageNotFound'), t('extensionName'));
        return false;
      }

      // Update message
      message.mes = text;

      // Emit proper event sequence for DOM update
      const MESSAGE_EDITED = context.eventTypes.MESSAGE_EDITED;
      await context.eventSource.emit(MESSAGE_EDITED, messageId);

      context.updateMessageBlock(messageId, message);

      const MESSAGE_UPDATED = context.eventTypes.MESSAGE_UPDATED;
      await context.eventSource.emit(MESSAGE_UPDATED, messageId);

      // Save chat
      await context.saveChat();

      toastr.success(t('toast.imageDeleted'), t('extensionName'));
      logger.info('Image deleted successfully');

      // Re-attach click handlers to remaining images
      setTimeout(() => {
        addImageClickHandlers(context, settings);
      }, 100);

      return true;
    },
    'image deletion'
  );
}

/**
 * Shows regeneration dialog for an image
 * @param messageId - Message ID
 * @param imageSrc - Source URL of image to regenerate
 * @param context - SillyTavern context
 * @param settings - Extension settings
 */
async function showRegenerationDialog(
  messageId: number,
  imageSrc: string,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<void> {
  // Check if streaming is active for this message
  if (isStreamingActive(messageId)) {
    toastr.warning(
      t('toast.cannotGenerateMessageStreaming'),
      t('extensionName')
    );
    return;
  }

  // Check if dialog already exists and close it (mobile behavior)
  const existingDialog = $('#auto_illustrator_regen_dialog');
  if (existingDialog.length > 0) {
    logger.debug('Dialog already open, closing it');
    $('.auto-illustrator-dialog-backdrop').remove();
    existingDialog.remove();
    return;
  }

  const dialogMessage = t('dialog.whatToDo');

  // Show confirmation dialog with mode selection
  const action = await new Promise<
    ManualGenerationMode | 'delete' | 'update_prompt' | null
  >(resolve => {
    // Create backdrop
    const backdrop = $('<div>').addClass('auto-illustrator-dialog-backdrop');

    const dialog = $('<div>')
      .attr('id', 'auto_illustrator_regen_dialog')
      .addClass('auto-illustrator-dialog');

    dialog.append($('<p>').text(dialogMessage));

    const modeGroup = $('<div>').addClass('auto-illustrator-mode-group');

    const replaceOption = $('<label>')
      .addClass('auto-illustrator-mode-option')
      .append(
        $('<input>')
          .attr('type', 'radio')
          .attr('name', 'regen_mode')
          .val('replace')
          .prop('checked', settings.manualGenerationMode === 'replace')
      )
      .append(
        $('<span>').html(
          `<strong>${t('dialog.replace')}</strong> ${t('dialog.replaceRegen')}`
        )
      );

    const appendOption = $('<label>')
      .addClass('auto-illustrator-mode-option')
      .append(
        $('<input>')
          .attr('type', 'radio')
          .attr('name', 'regen_mode')
          .val('append')
          .prop('checked', settings.manualGenerationMode === 'append')
      )
      .append(
        $('<span>').html(
          `<strong>${t('dialog.append')}</strong> ${t('dialog.appendRegen')}`
        )
      );

    modeGroup.append(appendOption).append(replaceOption);
    dialog.append(modeGroup);

    const buttons = $('<div>').addClass('auto-illustrator-dialog-buttons');

    const generateBtn = $('<button>')
      .text(t('dialog.generate'))
      .addClass('menu_button')
      .on('click', () => {
        const selectedMode = dialog
          .find('input[name="regen_mode"]:checked')
          .val() as ManualGenerationMode;
        backdrop.remove();
        dialog.remove();
        resolve(selectedMode);
      });

    const updatePromptBtn = $('<button>')
      .text(t('dialog.updatePrompt'))
      .addClass('menu_button')
      .on('click', () => {
        backdrop.remove();
        dialog.remove();
        resolve('update_prompt');
      });

    const deleteBtn = $('<button>')
      .text(t('dialog.delete'))
      .addClass('menu_button caution')
      .on('click', () => {
        backdrop.remove();
        dialog.remove();
        resolve('delete');
      });

    const cancelBtn = $('<button>')
      .text(t('dialog.cancel'))
      .addClass('menu_button')
      .on('click', () => {
        backdrop.remove();
        dialog.remove();
        resolve(null);
      });

    buttons
      .append(generateBtn)
      .append(updatePromptBtn)
      .append(deleteBtn)
      .append(cancelBtn);
    dialog.append(buttons);

    // Append backdrop and dialog to body
    $('body').append(backdrop).append(dialog);

    // Close on backdrop click
    backdrop.on('click', () => {
      backdrop.remove();
      dialog.remove();
      resolve(null);
    });
  });

  if (!action) {
    logger.info('Action cancelled by user');
    return;
  }

  if (action === 'delete') {
    // Delete the image
    await deleteImage(messageId, imageSrc, context, settings);
  } else if (action === 'update_prompt') {
    // Update prompt with AI
    await showPromptUpdateDialog(messageId, imageSrc, context, settings);
  } else {
    // Regenerate image
    await regenerateImage(messageId, imageSrc, action, context, settings);
  }
}

/**
 * Adds click handlers to all AI-generated images in the chat
 * @param context - SillyTavern context
 * @param settings - Extension settings
 */
export function addImageClickHandlers(
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): void {
  // Remove existing handlers to avoid duplicates
  $('.mes_text img[title^="AI generated image"]').off(
    'click.auto_illustrator_regen'
  );

  // Add click handler to all AI-generated images
  $('.mes_text img[title^="AI generated image"]').on(
    'click.auto_illustrator_regen',
    function (this: HTMLElement) {
      const $img = $(this);
      const $mes = $img.closest('.mes');
      const mesId = $mes.attr('mesid');

      if (!mesId) {
        logger.warn('Could not find message ID for clicked image');
        return;
      }

      const messageId = parseInt(mesId, 10);
      if (isNaN(messageId)) {
        logger.warn('Invalid message ID:', mesId);
        return;
      }

      const imageSrc = $img.attr('src');
      if (!imageSrc) {
        logger.warn('Image has no src attribute');
        return;
      }

      logger.info(
        `Image clicked: messageId=${messageId}, src=${imageSrc.substring(0, 50)}...`
      );

      // Show regeneration dialog
      showRegenerationDialog(messageId, imageSrc, context, settings);
    }
  );

  logger.debug(
    `Added click handlers to ${$('.mes_text img[title^="AI generated image"]').length} images`
  );
}

/**
 * Adds manual generation button to a message element
 * @param messageElement - jQuery message element
 * @param messageId - Message index in chat array
 * @param context - SillyTavern context
 * @param settings - Extension settings
 */
export function addManualGenerationButton(
  messageElement: JQuery,
  messageId: number,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): void {
  const message = context.chat?.[messageId];
  if (!message || message.is_user) {
    return;
  }

  // Only add button if message has prompts
  if (!hasImagePrompts(message.mes, settings.promptDetectionPatterns)) {
    return;
  }

  // Check if button already exists
  const $messageElement = $(messageElement);
  if ($messageElement.find('.auto_illustrator_manual_gen').length > 0) {
    return;
  }

  // Create button
  const button = $('<div>')
    .addClass(
      'mes_button auto_illustrator_manual_gen fa-solid fa-wand-magic-sparkles'
    )
    .attr('title', t('button.manualGenerate'))
    .on('click', async () => {
      // Check if streaming is active for this message
      if (isStreamingActive(messageId)) {
        toastr.warning(
          t('toast.cannotGenerateMessageStreaming'),
          t('extensionName')
        );
        return;
      }

      // Disable button during generation
      button.prop('disabled', true);
      button.css('opacity', '0.5');

      try {
        await showGenerationDialog(messageId, context, settings);
      } finally {
        button.prop('disabled', false);
        button.css('opacity', '1');
      }
    });

  // Add to extraMesButtons container
  const extraButtons = $messageElement.find('.extraMesButtons');
  if (extraButtons.length > 0) {
    extraButtons.append(button);
  }
}
