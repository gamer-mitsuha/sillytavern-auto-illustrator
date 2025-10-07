/**
 * Manual Generation Module
 * Handles manual image generation for existing img_prompt tags
 */

import {extractImagePrompts, hasImagePrompts} from './image_extractor';
import {generateImage} from './image_generator';
import type {ManualGenerationMode, ImagePromptMatch} from './types';
import {createLogger} from './logger';
import {createImagePromptWithImgRegex} from './regex';

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
    toastr.error('Message not found', 'Auto Illustrator');
    return 0;
  }

  let text = message.mes;

  // Extract prompts before any modifications
  const prompts = extractImagePrompts(text);
  if (prompts.length === 0) {
    logger.info('No prompts found in message');
    toastr.info('No image prompts found in message', 'Auto Illustrator');
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
    `Generating ${promptsToGenerate.length} image${promptsToGenerate.length > 1 ? 's' : ''}...`,
    'Auto Illustrator'
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

      const imageTag = `\n<img src="${imageUrl}" title="AI generated image #${originalIndex + 1}" alt="AI generated image #${originalIndex + 1}">`;
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
      `Successfully generated ${successCount} image${successCount > 1 ? 's' : ''}`,
      'Auto Illustrator'
    );
  } else if (successCount > 0) {
    toastr.warning(
      `Generated ${successCount} of ${promptsToGenerate.length} images`,
      'Auto Illustrator'
    );
  } else {
    toastr.error('Failed to generate images', 'Auto Illustrator');
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
  const message = context.chat?.[messageId];
  if (!message) {
    logger.warn('Message not found:', messageId);
    return;
  }

  const prompts = extractImagePrompts(message.mes);
  if (prompts.length === 0) {
    toastr.info('No image prompts found in message', 'Auto Illustrator');
    return;
  }

  // Build dialog message
  let dialogMessage = `Found ${prompts.length} image prompt${prompts.length > 1 ? 's' : ''} in this message.`;
  dialogMessage += '\n\nHow would you like to generate images?';

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
          '<strong>Replace:</strong> Remove existing images and regenerate new ones'
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
          '<strong>Append:</strong> Keep existing images and add new ones after them'
        )
      );

    modeGroup.append(replaceOption).append(appendOption);
    dialog.append(modeGroup);

    const buttons = $('<div>').addClass('auto-illustrator-dialog-buttons');

    const generateBtn = $('<button>')
      .text('Generate')
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
      .text('Cancel')
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
    toastr.error('Message not found', 'Auto Illustrator');
    return 0;
  }

  // Find the prompt for this image (using current message state)
  const promptText = findPromptForImage(message.mes || '', imageSrc);
  if (!promptText) {
    toastr.error('Could not find prompt for this image', 'Auto Illustrator');
    return 0;
  }

  logger.info(`Regenerating image for prompt: "${promptText}" (mode: ${mode})`);

  // Generate new image (this respects concurrency limit and may wait in queue)
  toastr.info('Generating new image...', 'Auto Illustrator');
  const imageUrl = await generateImage(promptText, context);

  if (!imageUrl) {
    toastr.error('Failed to generate image', 'Auto Illustrator');
    return 0;
  }

  // IMPORTANT: Re-read message AFTER generation completes
  // This ensures we have the latest state if other regenerations happened while we were queued
  message = context.chat?.[messageId];
  if (!message) {
    logger.error('Message not found after generation:', messageId);
    toastr.error('Message disappeared during generation', 'Auto Illustrator');
    return 0;
  }

  let text = message.mes || '';

  // Find the prompt tag
  const promptTag = `<img_prompt="${promptText}">`;
  const promptIndex = text.indexOf(promptTag);

  if (promptIndex === -1) {
    logger.error('Prompt tag not found in text');
    toastr.error('Failed to find prompt tag', 'Auto Illustrator');
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

  const imageTag = `\n<img src="${imageUrl}" title="AI generated image (regenerated)" alt="AI generated image (regenerated)">`;
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

  toastr.success('Image regenerated successfully', 'Auto Illustrator');
  logger.info('Image regenerated successfully');

  // Re-attach click handlers to all images (including the new one)
  setTimeout(() => {
    addImageClickHandlers(context, settings);
  }, 100);

  return 1;
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
  const dialogMessage = 'How would you like to regenerate this image?';

  // Show confirmation dialog with mode selection
  const mode = await new Promise<ManualGenerationMode | null>(resolve => {
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
        $('<span>').html('<strong>Replace:</strong> Remove and regenerate')
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
        $('<span>').html('<strong>Append:</strong> Keep and add new one after')
      );

    modeGroup.append(replaceOption).append(appendOption);
    dialog.append(modeGroup);

    const buttons = $('<div>').addClass('auto-illustrator-dialog-buttons');

    const generateBtn = $('<button>')
      .text('Generate')
      .addClass('menu_button')
      .on('click', () => {
        const selectedMode = dialog
          .find('input[name="regen_mode"]:checked')
          .val() as ManualGenerationMode;
        backdrop.remove();
        dialog.remove();
        resolve(selectedMode);
      });

    const cancelBtn = $('<button>')
      .text('Cancel')
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
    logger.info('Regeneration cancelled by user');
    return;
  }

  // Regenerate image
  await regenerateImage(messageId, imageSrc, mode, context, settings);
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
    .attr('title', 'Generate images from prompts')
    .attr('data-i18n', '[title]Generate images from prompts')
    .on('click', async () => {
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
