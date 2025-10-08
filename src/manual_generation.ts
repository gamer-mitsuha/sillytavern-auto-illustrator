/**
 * Manual Generation Module
 * Handles manual image generation for existing img_prompt tags
 */

import {extractImagePrompts, hasImagePrompts} from './image_extractor';
import {generateImage} from './image_generator';
import type {ManualGenerationMode, ImagePromptMatch} from './types';
import {createLogger} from './logger';
import {createImagePromptWithImgRegex} from './regex';
import {t, tCount} from './i18n';
import {isStreamingActive} from './index';

const logger = createLogger('ManualGen');

/**
 * Checks if a prompt already has an image after it
 * @param text - Message text
 * @param promptText - The prompt to check
 * @returns True if image exists after this prompt
 */
export function hasExistingImage(text: string, promptText: string): boolean {
  const promptTag = `<img_prompt="${promptText}">`;
  const promptIndex = text.indexOf(promptTag);

  if (promptIndex === -1) {
    return false;
  }

  // Check if there's an img tag immediately after the prompt
  const afterPrompt = text.substring(
    promptIndex + promptTag.length,
    promptIndex + promptTag.length + 200
  );

  return afterPrompt.trimStart().startsWith('<img');
}

/**
 * Removes existing images that follow img_prompt tags
 * @param text - Message text
 * @returns Text with existing images removed
 */
export function removeExistingImages(text: string): string {
  const pattern = createImagePromptWithImgRegex();

  // Replace "<img_prompt="..."><img...>" with just "<img_prompt="...">"
  return text.replace(pattern, match => {
    // Extract just the img_prompt part
    const promptMatch = match.match(/<img_prompt="[^"]*">/);
    return promptMatch ? promptMatch[0] : match;
  });
}

/**
 * Generates images for all prompts in a message
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
  logger.info(`Generating images for message ${messageId} in ${mode} mode`);

  const message = context.chat?.[messageId];
  if (!message) {
    logger.warn('Message not found:', messageId);
    toastr.error(t('toast.messageNotFound'), t('extensionName'));
    return 0;
  }

  let text = message.mes;

  // Extract prompts before any modifications
  const prompts = extractImagePrompts(text);
  if (prompts.length === 0) {
    logger.info('No prompts found in message');
    toastr.info(t('toast.noPromptsFound'), t('extensionName'));
    return 0;
  }

  logger.info(`Found ${prompts.length} prompts`);

  // In replace mode, remove existing images first
  if (mode === 'replace') {
    const originalLength = text.length;
    text = removeExistingImages(text);
    logger.info(
      `Replace mode: removed existing images (${originalLength} -> ${text.length} chars)`
    );
  } else {
    logger.info('Append mode: will append new images after existing ones');
  }

  // In both modes, generate images for all prompts
  const promptsToGenerate = prompts;

  // Show start notification
  toastr.info(
    tCount(promptsToGenerate.length, 'toast.generatingImages'),
    t('extensionName')
  );

  // Generate images sequentially
  const startTime = performance.now();

  // Step 1: Generate all images first
  const generatedImages: Array<{
    prompt: ImagePromptMatch;
    imageUrl: string;
    originalIndex: number;
  }> = [];

  for (let i = 0; i < promptsToGenerate.length; i++) {
    const prompt = promptsToGenerate[i];
    logger.info(`Generating image ${i + 1}/${promptsToGenerate.length}`);

    const imageUrl = await generateImage(prompt.prompt, context);

    if (imageUrl) {
      generatedImages.push({prompt, imageUrl, originalIndex: i});
    }
  }

  // Step 2: Sort by prompt position (end to start) and insert in reverse order
  // This ensures that inserting later prompts doesn't shift earlier positions
  generatedImages.sort((a, b) => b.prompt.startIndex - a.prompt.startIndex);

  let successCount = 0;
  for (const {prompt, imageUrl, originalIndex} of generatedImages) {
    const promptTag = `<img_prompt="${prompt.prompt}">`;
    const tagIndex = text.indexOf(promptTag);

    if (tagIndex !== -1) {
      let insertPos = tagIndex + promptTag.length;

      // In append mode, find the position after the last existing image
      if (mode === 'append') {
        const afterPrompt = text.substring(insertPos);
        // Match all consecutive img tags after the prompt (including whitespace between them)
        const imgTagRegex = /\s*<img\s+[^>]*>/g;
        let lastMatchEnd = 0;
        let match;

        // Keep matching img tags until we find a non-img-tag or end of string
        while ((match = imgTagRegex.exec(afterPrompt)) !== null) {
          // Check if this match is contiguous with previous matches (only whitespace between)
          if (
            match.index === lastMatchEnd ||
            afterPrompt.substring(lastMatchEnd, match.index).trim() === ''
          ) {
            lastMatchEnd = imgTagRegex.lastIndex;
          } else {
            // Found non-whitespace content, stop here
            break;
          }
        }

        if (lastMatchEnd > 0) {
          // Found existing images, insert after them
          insertPos += lastMatchEnd;
        }
      }

      // Create image tag with index
      const imageTitle = `AI generated image #${originalIndex + 1}`;
      const imageTag = `\n<img src="${imageUrl}" title="${imageTitle}" alt="${imageTitle}">`;
      text =
        text.substring(0, insertPos) + imageTag + text.substring(insertPos);
      successCount++;
    }
  }

  const duration = performance.now() - startTime;
  logger.info(
    `Generated ${successCount}/${promptsToGenerate.length} images (${duration.toFixed(0)}ms total)`
  );

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
  logger.debug('Chat saved after manual generation');

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
  // Check if streaming is active
  if (isStreamingActive()) {
    toastr.warning(t('toast.cannotGenerateWhileStreaming'), t('extensionName'));
    return;
  }

  const message = context.chat?.[messageId];
  if (!message) {
    logger.warn('Message not found:', messageId);
    return;
  }

  const prompts = extractImagePrompts(message.mes);
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

    modeGroup.append(replaceOption).append(appendOption);
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
 * @returns Prompt text or null if not found
 */
export function findPromptForImage(
  text: string,
  imageSrc: string
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
  const promptPattern = /<img_prompt="([^"]*)">(?![\s\S]*<img_prompt="[^"]*">)/;
  const promptMatch = textBeforeImg.match(promptPattern);

  if (!promptMatch) {
    logger.warn('No prompt found before image');
    return null;
  }

  return promptMatch[1];
}

/**
 * Finds the index (1-based) of a specific image after a prompt
 * @param text - Message text
 * @param promptText - The prompt text
 * @param imageSrc - Source URL of the image to find
 * @returns 1-based index of the image, or null if not found
 */
function findImageIndexInPrompt(
  text: string,
  promptText: string,
  imageSrc: string
): number | null {
  const promptTag = `<img_prompt="${promptText}">`;
  const promptIndex = text.indexOf(promptTag);

  if (promptIndex === -1) {
    return null;
  }

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
 * @returns Highest regeneration number found (0 if none exist)
 */
function countRegeneratedImages(
  text: string,
  promptText: string,
  imageIndex: number
): number {
  const promptTag = `<img_prompt="${promptText}">`;
  const promptIndex = text.indexOf(promptTag);

  if (promptIndex === -1) {
    return 0;
  }

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
  // Initial message check
  let message = context.chat?.[messageId];
  if (!message) {
    logger.error('Message not found:', messageId);
    toastr.error(t('toast.messageNotFound'), t('extensionName'));
    return 0;
  }

  // Find the prompt for this image (using current message state)
  const promptText = findPromptForImage(message.mes || '', imageSrc);
  if (!promptText) {
    toastr.error(t('toast.promptNotFoundForImage'), t('extensionName'));
    return 0;
  }

  logger.info(`Regenerating image for prompt: "${promptText}" (mode: ${mode})`);

  // Generate new image (this respects concurrency limit and may wait in queue)
  toastr.info(t('toast.generatingNewImage'), t('extensionName'));
  const imageUrl = await generateImage(promptText, context);

  if (!imageUrl) {
    toastr.error(t('toast.failedToGenerateImage'), t('extensionName'));
    return 0;
  }

  // IMPORTANT: Re-read message AFTER generation completes
  // This ensures we have the latest state if other regenerations happened while we were queued
  message = context.chat?.[messageId];
  if (!message) {
    logger.error('Message not found after generation:', messageId);
    toastr.error(t('toast.messageDisappeared'), t('extensionName'));
    return 0;
  }

  let text = message.mes || '';

  // Determine which image index we're regenerating BEFORE modifying the text
  const imageIndex = findImageIndexInPrompt(text, promptText, imageSrc);
  if (!imageIndex) {
    logger.error('Could not determine image index for regeneration');
    toastr.error(t('toast.failedToDetermineIndex'), t('extensionName'));
    return 0;
  }

  // Find the prompt tag
  const promptTag = `<img_prompt="${promptText}">`;
  const promptIndex = text.indexOf(promptTag);

  if (promptIndex === -1) {
    logger.error('Prompt tag not found in text');
    toastr.error(t('toast.failedToFindPromptTag'), t('extensionName'));
    return 0;
  }

  let insertPos = promptIndex + promptTag.length;

  // In replace mode, find and remove the specific clicked image, remember its position
  if (mode === 'replace') {
    const afterPrompt = text.substring(insertPos);
    const escapedSrc = imageSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Find the specific image we clicked
    const imgPattern = new RegExp(`\\s*<img\\s+src="${escapedSrc}"[^>]*>`, '');
    const imgMatch = afterPrompt.match(imgPattern);

    if (imgMatch && imgMatch.index !== undefined) {
      // Found the clicked image - remove it
      const imgStart = insertPos + imgMatch.index;
      const imgEnd = imgStart + imgMatch[0].length;

      // Remove the image
      text = text.substring(0, imgStart) + text.substring(imgEnd);

      // Insert new image at the same position where old one was
      insertPos = imgStart;

      logger.info('Removed and will replace clicked image at same position');
    } else {
      logger.warn('Could not find clicked image in text, will append instead');
    }
  } else {
    // In append mode, find position after all existing images
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

  // Count existing regenerations for this image index
  const regenCount = countRegeneratedImages(text, promptText, imageIndex);
  const nextRegenNumber = regenCount + 1;

  // Create image tag with meaningful name (without prompt text to avoid display issues)
  const imageTitle = `AI generated image #${imageIndex} (Regenerated ${nextRegenNumber})`;
  const imageTag = `\n<img src="${imageUrl}" title="${imageTitle}" alt="${imageTitle}">`;
  text = text.substring(0, insertPos) + imageTag + text.substring(insertPos);

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

  toastr.success(t('toast.imageRegenerated'), t('extensionName'));
  logger.info('Image regenerated successfully');

  // Re-attach click handlers to all images (including the new one)
  setTimeout(() => {
    addImageClickHandlers(context, settings);
  }, 100);

  return 1;
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
  const imgPattern = new RegExp(`\\s*<img\\s+src="${escapedSrc}"[^>]*>`, 'g');
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
  // Check if streaming is active
  if (isStreamingActive()) {
    toastr.warning(t('toast.cannotGenerateWhileStreaming'), t('extensionName'));
    return;
  }

  const dialogMessage = t('dialog.whatToDo');

  // Show confirmation dialog with mode selection
  const action = await new Promise<ManualGenerationMode | 'delete' | null>(
    resolve => {
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
            .prop('checked', false)
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
            .prop('checked', true)
        )
        .append(
          $('<span>').html(
            `<strong>${t('dialog.append')}</strong> ${t('dialog.appendRegen')}`
          )
        );

      modeGroup.append(replaceOption).append(appendOption);
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

      buttons.append(generateBtn).append(deleteBtn).append(cancelBtn);
      dialog.append(buttons);

      // Append backdrop and dialog to body
      $('body').append(backdrop).append(dialog);

      // Close on backdrop click
      backdrop.on('click', () => {
        backdrop.remove();
        dialog.remove();
        resolve(null);
      });
    }
  );

  if (!action) {
    logger.info('Action cancelled by user');
    return;
  }

  if (action === 'delete') {
    // Delete the image
    await deleteImage(messageId, imageSrc, context, settings);
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
  messageElement: any,
  messageId: number,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): void {
  const message = context.chat?.[messageId];
  if (!message || message.is_user) {
    return;
  }

  // Only add button if message has prompts
  if (!hasImagePrompts(message.mes)) {
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
      // Check if streaming is active
      if (isStreamingActive()) {
        toastr.warning(
          t('toast.cannotGenerateWhileStreaming'),
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
