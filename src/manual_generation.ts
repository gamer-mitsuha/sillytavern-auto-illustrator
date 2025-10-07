/**
 * Manual Generation Module
 * Handles manual image generation for existing img_prompt tags
 */

import {extractImagePrompts, hasImagePrompts} from './image_extractor';
import {generateImage} from './image_generator';
import type {ManualGenerationMode} from './types';
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
  let successCount = 0;

  for (let i = 0; i < promptsToGenerate.length; i++) {
    const prompt = promptsToGenerate[i];
    logger.info(`Generating image ${i + 1}/${promptsToGenerate.length}`);

    const imageUrl = await generateImage(prompt.prompt, context);

    if (imageUrl) {
      // Insert image after prompt (or after existing images in append mode)
      const promptTag = `<img_prompt="${prompt.prompt}">`;
      const tagIndex = text.indexOf(promptTag);

      if (tagIndex !== -1) {
        let insertPos = tagIndex + promptTag.length;

        // In append mode, find the position after the last existing image
        if (mode === 'append') {
          const afterPrompt = text.substring(insertPos);
          // Match all consecutive img tags after the prompt
          const imgTagRegex = /^\s*<img\s+[^>]*>/g;
          let match;
          let lastMatchEnd = 0;

          while ((match = imgTagRegex.exec(afterPrompt)) !== null) {
            lastMatchEnd = match.index + match[0].length;
            // Update lastIndex to continue searching from where we found the match
            imgTagRegex.lastIndex = lastMatchEnd;
          }

          if (lastMatchEnd > 0) {
            // Found existing images, insert after them
            insertPos += lastMatchEnd;
          }
        }

        const imageTag = `\n<img src="${imageUrl}" title="AI generated image #${i + 1}" alt="AI generated image #${i + 1}">`;
        text =
          text.substring(0, insertPos) + imageTag + text.substring(insertPos);
        successCount++;
      }
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
