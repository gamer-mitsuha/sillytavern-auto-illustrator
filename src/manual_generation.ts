/**
 * Manual Generation Module (v2)
 * Simplified to support only click-to-regenerate functionality
 *
 * Removed:
 * - Batch manual generation operations
 * - Manual generation dialog/button
 * - Replace/append mode selection
 *
 * Kept:
 * - Click-to-regenerate image handlers
 * - Image click listeners
 */

import {createLogger} from './logger';
import {sessionManager} from './session_manager';
import {
  getPromptForImage,
  getPromptNode,
  registerPrompt,
  linkImageToPrompt,
} from './prompt_manager';
import {getMetadata} from './metadata';
import type {ImageInsertionMode} from './types';
import {t} from './i18n';
import {
  generateUpdatedPrompt,
  applyPromptUpdate,
  type PromptNode,
} from './prompt_updater';
import {findImageBySrc, htmlEncode} from './utils/dom_utils';
import {renderMessageUpdate} from './utils/message_renderer';
import {openImageModal} from './modal_viewer';
import {scheduleDomOperation} from './dom_queue';
import {collectAllImagesFromChat, normalizeImageUrl} from './image_utils';

const logger = createLogger('ManualGen');

/**
 * Opens the global image viewer starting from a specific image
 * Collects all AI-generated images from all messages in chat order
 * @param imageUrl - URL of the clicked image (absolute or relative)
 */
function openGlobalViewerFromImage(imageUrl: string): void {
  logger.info('Opening global viewer from image:', imageUrl);

  // Get SillyTavern context
  const context = SillyTavern.getContext();
  if (!context?.chat) {
    logger.error('Cannot open viewer: no context or chat');
    toastr.error(t('toast.messageNotFound'), t('extensionName'));
    return;
  }

  // Collect all AI-generated images from chat
  const allImages = collectAllImagesFromChat(context);

  if (allImages.length === 0) {
    logger.warn('No AI-generated images found in chat');
    toastr.warning(t('toast.noPromptsFound'), t('extensionName'));
    return;
  }

  // Find the clicked image in the collection
  const normalizedClickedUrl = normalizeImageUrl(imageUrl);
  let clickedImageIndex = allImages.findIndex(
    img => normalizeImageUrl(img.imageUrl) === normalizedClickedUrl
  );

  if (clickedImageIndex === -1) {
    logger.warn(
      'Could not find clicked image in chat, defaulting to first image'
    );
    clickedImageIndex = 0;
  }

  logger.info(
    `Opening global viewer with ${allImages.length} images, starting at index ${clickedImageIndex}`
  );

  // Open the modal viewer
  openImageModal({
    images: allImages,
    initialIndex: clickedImageIndex,
    title: t('gallery.imageViewer'),
    onClose: () => {
      logger.debug('Global viewer closed');
    },
    onNavigate: (newIndex: number) => {
      logger.trace(
        `Global viewer navigated to image ${newIndex + 1}/${allImages.length}`
      );
    },
  });
}

/**
 * Shows regeneration dialog and returns user's choice
 * @param imageUrl - URL of the image to regenerate
 * @param settings - Extension settings for default mode
 * @param context - SillyTavern context (for update prompt functionality)
 * @param messageId - Message ID (for update prompt functionality)
 * @returns User's choice: 'replace-image', 'append-after-image', 'update-prompt', or null if cancelled/delete
 */
async function showRegenerationDialog(
  imageUrl: string,
  settings: AutoIllustratorSettings,
  context?: SillyTavernContext,
  messageId?: number
): Promise<ImageInsertionMode | 'update-prompt' | null> {
  // Check if dialog already exists and close it (mobile behavior)
  const existingDialog = $('#auto_illustrator_regen_dialog');
  if (existingDialog.length > 0) {
    logger.debug('Dialog already open, closing it and reopening for new image');
    $('.auto-illustrator-dialog-backdrop').remove();
    existingDialog.remove();
    // Don't return null - continue to show dialog for the new image
  }

  const dialogMessage = t('dialog.whatToDo');

  return new Promise<ImageInsertionMode | 'update-prompt' | null>(resolve => {
    // Create backdrop
    const backdrop = $('<div>').addClass('auto-illustrator-dialog-backdrop');

    const dialog = $('<div>')
      .attr('id', 'auto_illustrator_regen_dialog')
      .addClass('auto-illustrator-dialog');

    dialog.append($('<p>').text(dialogMessage));

    const modeGroup = $('<div>').addClass('auto-illustrator-mode-group');

    // Map settings mode to ImageInsertionMode
    const defaultMode =
      settings.manualGenerationMode === 'append'
        ? 'append-after-image'
        : 'replace-image';

    const replaceOption = $('<label>')
      .addClass('auto-illustrator-mode-option')
      .append(
        $('<input>')
          .attr('type', 'radio')
          .attr('name', 'regen_mode')
          .val('replace-image')
          .prop('checked', defaultMode === 'replace-image')
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
          .val('append-after-image')
          .prop('checked', defaultMode === 'append-after-image')
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
          .val() as ImageInsertionMode;
        backdrop.remove();
        dialog.remove();
        resolve(selectedMode);
      });

    const updateBtn = $('<button>')
      .text(t('dialog.updatePrompt'))
      .addClass('menu_button')
      .on('click', () => {
        backdrop.remove();
        dialog.remove();
        resolve('update-prompt');
      });

    const deleteBtn = $('<button>')
      .text(t('dialog.delete'))
      .addClass('menu_button caution')
      .on('click', async () => {
        backdrop.remove();
        dialog.remove();
        // Delete the image directly
        await deleteImage(imageUrl);
        resolve(null);
      });

    const viewAllBtn = $('<button>')
      .text(t('dialog.viewAll'))
      .addClass('menu_button')
      .on('click', () => {
        backdrop.remove();
        dialog.remove();
        // Open global image viewer starting from this image
        openGlobalViewerFromImage(imageUrl);
        resolve(null);
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
      .append(updateBtn)
      .append(deleteBtn)
      .append(viewAllBtn)
      .append(cancelBtn);
    dialog.append(buttons);

    backdrop.on('click', () => {
      backdrop.remove();
      dialog.remove();
      resolve(null);
    });

    $('body').append(backdrop).append(dialog);
  });
}

/**
 * Shows prompt update dialog for an image
 * @param imageUrl - URL of the image whose prompt to update
 * @param messageId - Message ID containing the image
 * @param context - SillyTavern context
 * @param settings - Extension settings
 * @returns Object with parent and child nodes if succeeded, null otherwise
 */
async function showPromptUpdateDialog(
  imageUrl: string,
  messageId: number,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<{parent: PromptNode; child: PromptNode} | null> {
  // Normalize URL
  const normalizedUrl = normalizeImageUrl(imageUrl);

  // Get metadata and find prompt
  const metadata = getMetadata();

  // DEBUG: Log registry state to diagnose issue
  const registry = metadata.promptRegistry;
  if (!registry) {
    logger.error('PromptRegistry is undefined in metadata!');
    toastr.error(t('toast.promptNotFoundForImage'), t('extensionName'));
    return null;
  }

  logger.info('=== DEBUG: PromptRegistry State ===');
  logger.info(`Looking up image: ${normalizedUrl}`);
  logger.info(
    `Registry has ${Object.keys(registry.nodes).length} prompt nodes`
  );
  logger.info(
    `Registry has ${Object.keys(registry.imageToPromptId).length} image mappings`
  );

  // Log all image URLs in registry for comparison
  const registryUrls = Object.keys(registry.imageToPromptId);
  logger.info('URLs in registry:', registryUrls);

  // Check if any URLs are similar (might be encoding issue)
  const decodedLookupUrl = decodeURIComponent(normalizedUrl);
  logger.info(`Decoded lookup URL: ${decodedLookupUrl}`);

  // Try to find similar URLs
  const similarUrls = registryUrls.filter(url => {
    const decodedRegistryUrl = decodeURIComponent(url);
    return decodedRegistryUrl === decodedLookupUrl || url === normalizedUrl;
  });
  logger.info('Similar URLs found:', similarUrls);

  const promptNode = getPromptForImage(normalizedUrl, metadata);

  if (!promptNode) {
    logger.error('No prompt found for image');
    logger.error('This could be due to:');
    logger.error('1. Image was never linked to a prompt');
    logger.error('2. URL encoding mismatch');
    logger.error('3. PromptRegistry not persisted/loaded');
    toastr.error(t('toast.promptNotFoundForImage'), t('extensionName'));
    return null;
  }

  const currentPrompt = promptNode.text;

  // Show dialog to get user feedback
  const userFeedback = await new Promise<string | null>(resolve => {
    // Check if dialog already exists and close it
    const existingDialog = $('#auto_illustrator_prompt_update_dialog');
    if (existingDialog.length > 0) {
      $('.auto-illustrator-dialog-backdrop').remove();
      existingDialog.remove();
    }

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

    const updateButton = $('<button>')
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

    const cancelButton = $('<button>')
      .text(t('dialog.cancel'))
      .addClass('menu_button')
      .on('click', () => {
        backdrop.remove();
        dialog.remove();
        resolve(null);
      });

    buttons.append(updateButton).append(cancelButton);
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

  // Generate updated prompt using LLM (don't update message text yet)
  try {
    toastr.info(t('toast.updatingPromptWithAI'), t('extensionName'));

    const childNode = await generateUpdatedPrompt(
      normalizedUrl,
      userFeedback,
      context,
      settings
    );

    if (!childNode) {
      logger.error('Failed to generate updated prompt - LLM returned null');
      toastr.error(t('toast.failedToUpdatePrompt'), t('extensionName'));
      return null;
    }

    logger.info('Successfully generated updated prompt');
    return {parent: promptNode, child: childNode};
  } catch (error) {
    logger.error('Error generating updated prompt:', error);
    toastr.error(t('toast.failedToUpdatePrompt'), t('extensionName'));
    return null;
  }
}

/**
 * Shows post-update regeneration dialog with new prompt
 * @param newPrompt - The updated prompt text
 * @returns Regeneration mode or null if cancelled
 */
async function showPostUpdateRegenerationDialog(
  newPrompt: string
): Promise<ImageInsertionMode | null> {
  return new Promise<ImageInsertionMode | null>(resolve => {
    // Check if dialog already exists and close it
    const existingDialog = $('#auto_illustrator_regen_dialog');
    if (existingDialog.length > 0) {
      $('.auto-illustrator-dialog-backdrop').remove();
      existingDialog.remove();
    }

    // Create backdrop
    const backdrop = $('<div>').addClass('auto-illustrator-dialog-backdrop');

    const dialog = $('<div>')
      .attr('id', 'auto_illustrator_regen_dialog')
      .addClass('auto-illustrator-dialog');

    dialog.append($('<h3>').text(t('dialog.promptUpdatedRegenerateWithMode')));

    // Show new prompt (read-only)
    dialog.append($('<label>').text(t('dialog.newPrompt')));
    const newPromptDisplay = $('<div>')
      .addClass('auto-illustrator-current-prompt')
      .text(newPrompt);
    dialog.append(newPromptDisplay);

    const buttons = $('<div>').addClass('auto-illustrator-dialog-buttons');

    const replaceBtn = $('<button>')
      .text(t('dialog.replaceRegen'))
      .addClass('menu_button')
      .on('click', () => {
        backdrop.remove();
        dialog.remove();
        resolve('replace-image');
      });

    const appendBtn = $('<button>')
      .text(t('dialog.appendRegen'))
      .addClass('menu_button')
      .on('click', () => {
        backdrop.remove();
        dialog.remove();
        resolve('append-after-image');
      });

    const cancelBtn = $('<button>')
      .text(t('dialog.cancel'))
      .addClass('menu_button')
      .on('click', () => {
        backdrop.remove();
        dialog.remove();
        resolve(null);
      });

    buttons.append(replaceBtn).append(appendBtn).append(cancelBtn);
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
}

/**
 * Deletes an image from the message
 * @param imageUrl - URL of the image to delete (can be absolute or relative)
 */
async function deleteImage(imageUrl: string): Promise<void> {
  const context = SillyTavern.getContext();
  const settings = context.extensionSettings?.auto_illustrator;

  // Normalize URL to relative path (message text contains relative paths)
  const normalizedUrl = normalizeImageUrl(imageUrl);

  // HTML-encode the URL to match against message text (which has &amp; etc.)
  const encodedUrl = htmlEncode(normalizedUrl);

  // Find which message contains this image
  for (let i = 0; i < context.chat.length; i++) {
    const message = context.chat[i];
    if (message.mes && message.mes.includes(encodedUrl)) {
      const escapedUrl = encodedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const imgPattern = new RegExp(
        `\\s*<img[^>]*src="${escapedUrl}"[^>]*>`,
        'g'
      );
      const beforeLength = message.mes.length;
      message.mes = message.mes.replace(imgPattern, '');
      const afterLength = message.mes.length;

      if (beforeLength === afterLength) {
        logger.warn(
          `Failed to delete image - pattern didn't match: ${encodedUrl.substring(0, 100)}...`
        );
        toastr.error(t('toast.imageNotFound'), 'Auto Illustrator');
        return;
      }

      // Set up one-time listener to attach handlers after DOM update
      if (settings) {
        const MESSAGE_UPDATED = context.eventTypes.MESSAGE_UPDATED;
        context.eventSource.once(MESSAGE_UPDATED, () => {
          attachRegenerationHandlers(i, context, settings);
          logger.debug('Re-attached click handlers after image deletion');
        });
      }

      // Render message with proper event sequence and save
      await renderMessageUpdate(i);

      toastr.success(t('toast.imageDeleted'), 'Auto Illustrator');
      logger.info(`Deleted image: ${normalizedUrl}`);
      return;
    }
  }

  logger.warn(`Image not found in any message: ${normalizedUrl}`);
  logger.debug(`Looking for encoded URL: ${encodedUrl.substring(0, 100)}...`);
  toastr.error(t('toast.imageNotFound'), 'Auto Illustrator');
}

/**
 * Rebuilds prompt registry entry from message text (backward compatibility)
 * Finds the prompt comment that precedes the given image and registers it
 * @param messageId - Message ID
 * @param imageUrl - Normalized image URL
 * @param context - SillyTavern context
 * @param metadata - Chat metadata
 * @returns PromptNode if found and registered, null otherwise
 */
async function rebuildPromptFromMessage(
  messageId: number,
  imageUrl: string,
  context: SillyTavernContext,
  metadata: import('./types').AutoIllustratorChatMetadata
): Promise<import('./prompt_manager').PromptNode | null> {
  const message = context.chat?.[messageId];
  if (!message) {
    logger.warn(`Message ${messageId} not found`);
    return null;
  }

  const messageText = message.mes || '';

  // Find the image in the message text
  const escapedUrl = imageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const imgPattern = new RegExp(`<img[^>]*src="${escapedUrl}"[^>]*>`, 'g');
  const imgMatch = imgPattern.exec(messageText);

  if (!imgMatch || imgMatch.index === undefined) {
    logger.warn(
      `Image not found in message text: ${imageUrl.substring(0, 50)}...`
    );
    return null;
  }

  // Search backward from the image position to find the preceding prompt comment
  const textBeforeImage = messageText.substring(0, imgMatch.index);
  const promptPattern =
    /<!--img-prompt="([^"\\]*(?:\\.[^"\\]*)*)"-->|<img_prompt="([^"\\]*(?:\\.[^"\\]*)*)">(?![\s\S]*(?:<!--img-prompt="|<img_prompt="))/g;

  let lastPromptMatch: RegExpExecArray | null = null;
  let match;

  // Find the LAST prompt comment before the image
  while ((match = promptPattern.exec(textBeforeImage)) !== null) {
    lastPromptMatch = match;
  }

  if (!lastPromptMatch) {
    logger.warn(
      `No prompt comment found before image: ${imageUrl.substring(0, 50)}...`
    );
    return null;
  }

  // Extract prompt text (group 1 for <!--img-prompt, group 2 for <img_prompt)
  const promptText = lastPromptMatch[1] || lastPromptMatch[2];
  if (!promptText) {
    logger.warn('Prompt text is empty');
    return null;
  }

  logger.debug(`Found prompt text: ${promptText.substring(0, 50)}...`);

  // Count existing prompts to determine the index
  const allPromptsPattern =
    /<!--img-prompt="([^"\\]*(?:\\.[^"\\]*)*)"-->|<img_prompt="([^"\\]*(?:\\.[^"\\]*)*)">>/g;
  let promptIndex = 0;
  while ((match = allPromptsPattern.exec(textBeforeImage)) !== null) {
    if (match.index < lastPromptMatch.index) {
      promptIndex++;
    }
  }

  // Register the prompt
  const promptNode = await registerPrompt(
    promptText,
    messageId,
    promptIndex,
    'ai-message',
    metadata
  );

  // Link the image to the prompt
  await linkImageToPrompt(promptNode.id, imageUrl, metadata);

  logger.info(
    `Rebuilt and registered prompt (ID: ${promptNode.id}): ${promptText.substring(0, 50)}...`
  );

  return promptNode;
}

/**
 * Handles click on an image to regenerate it
 *
 * Flow:
 * 1. Show dialog to get user's choice (replace/append/delete)
 * 2. Get prompt associated with the image (from prompt_manager)
 * 3. Queue regeneration via sessionManager
 * 4. SessionManager auto-finalizes after 2s idle
 *
 * @param imageUrl - URL of the image to regenerate (can be absolute or relative)
 * @param messageId - Message ID containing the image
 * @param context - SillyTavern context
 * @param settings - Extension settings
 */
export async function handleImageRegenerationClick(
  imageUrl: string,
  messageId: number,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<void> {
  logger.info(
    `Image clicked in message ${messageId}: ${imageUrl.substring(0, 50)}...`
  );

  // Normalize URL to relative path for consistent lookup
  const normalizedUrl = normalizeImageUrl(imageUrl);
  logger.debug(`Normalized URL: ${normalizedUrl}`);

  // Show dialog to get user's choice
  const choice = await showRegenerationDialog(
    imageUrl,
    settings,
    context,
    messageId
  );

  // Handle "Update Prompt" choice
  if (choice === 'update-prompt') {
    logger.info('User chose to update prompt');
    const updateResult = await showPromptUpdateDialog(
      imageUrl,
      messageId,
      context,
      settings
    );

    if (updateResult) {
      const {parent, child} = updateResult;

      // Show post-update dialog with new prompt and get regeneration mode
      logger.info('Prompt updated successfully, showing post-update dialog');
      const regenMode = await showPostUpdateRegenerationDialog(child.text);

      if (!regenMode) {
        // User cancelled - don't update message text or regenerate
        logger.debug('User cancelled regeneration after prompt update');
        return;
      }

      // User confirmed regeneration - apply prompt update to message text
      logger.info(
        'User confirmed regeneration, applying prompt update to message'
      );
      // Set up one-time listener to attach handlers after DOM update
      const MESSAGE_UPDATED = context.eventTypes.MESSAGE_UPDATED;
      context.eventSource.once(MESSAGE_UPDATED, () => {
        attachRegenerationHandlers(messageId, context, settings);
        logger.debug('Re-attached click handlers after prompt update');
      });

      const updateSuccess = await scheduleDomOperation(
        messageId,
        async () => {
          const success = await applyPromptUpdate(
            normalizedUrl,
            parent.id,
            child,
            context,
            settings
          );

          return success;
        },
        'apply-prompt-update'
      );

      if (!updateSuccess) {
        logger.error('Failed to apply prompt update to message');
        toastr.error(t('toast.failedToUpdatePrompt'), t('extensionName'));
        return;
      }

      toastr.success(t('toast.promptUpdated'), t('extensionName'));

      // Continue with regeneration using the new mode and updated prompt ID
      await performRegeneration(
        normalizedUrl,
        regenMode,
        messageId,
        context,
        settings,
        child.id // Pass the child (updated) prompt ID directly
      );
    }
    return;
  }

  // If not update-prompt, check if it's a valid regeneration mode
  if (!choice) {
    logger.debug('User cancelled regeneration or deleted image');
    return;
  }

  logger.info(`Regeneration requested with mode: ${choice}`);
  await performRegeneration(
    normalizedUrl,
    choice,
    messageId,
    context,
    settings
  );
}

/**
 * Performs the actual regeneration after mode is determined
 * Extracted to reduce code duplication
 * @param promptId - Optional prompt ID to use (for updated prompts)
 */
async function performRegeneration(
  normalizedUrl: string,
  mode: ImageInsertionMode,
  messageId: number,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings,
  promptId?: string
): Promise<void> {
  // Get prompt from image using prompt_manager (with normalized URL)
  const metadata = getMetadata();
  let promptNode = promptId
    ? getPromptNode(promptId, metadata)
    : getPromptForImage(normalizedUrl, metadata);

  // Backward compatibility: If prompt not found, try to rebuild from message text
  if (!promptNode) {
    logger.warn(
      `Prompt not found in registry for image: ${normalizedUrl}. Attempting to rebuild from message text (backward compatibility).`
    );
    promptNode = await rebuildPromptFromMessage(
      messageId,
      normalizedUrl,
      context,
      metadata
    );

    if (!promptNode) {
      logger.error(`Cannot find or rebuild prompt for image: ${normalizedUrl}`);
      logger.debug(
        `Available image mappings: ${JSON.stringify(Object.keys(metadata.promptRegistry?.imageToPromptId || {}))}`
      );
      toastr.error(
        'Cannot find prompt for this image. This may be an old image from before the recent update.',
        'Auto Illustrator'
      );
      return;
    }

    logger.info(
      `Successfully rebuilt prompt from message text: ${promptNode.text.substring(0, 50)}...`
    );
  }

  logger.debug(
    `Found prompt for image: ${promptNode.text.substring(0, 50)}... (ID: ${promptNode.id})`
  );

  try {
    // Queue regeneration via sessionManager (use normalized URL)
    await sessionManager.queueRegeneration(
      messageId,
      promptNode.id,
      normalizedUrl,
      context,
      settings,
      mode
    );

    toastr.info(
      `Regenerating: ${promptNode.text.substring(0, 50)}...`,
      'Auto Illustrator'
    );

    logger.info(
      `Queued regeneration for prompt ${promptNode.id} in message ${messageId}`
    );
  } catch (error) {
    logger.error('Error queueing regeneration:', error);
    toastr.error('Failed to queue regeneration', 'Auto Illustrator');
  }
}

/**
 * Attaches click handlers to images in a message for regeneration
 *
 * @param messageId - Message ID to attach handlers to
 * @param context - SillyTavern context
 * @param settings - Extension settings
 */
export function attachRegenerationHandlers(
  messageId: number,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): void {
  // Get the raw message text (not DOM HTML)
  const message = context.chat?.[messageId];
  if (!message) {
    logger.trace(`Message ${messageId} not found in chat`);
    return;
  }

  const messageText = message.mes || '';
  if (!messageText) {
    logger.trace(`Message ${messageId} has no text`);
    return;
  }

  // Find message element in DOM (SillyTavern uses .mes class with mesid attribute)
  const messageEl = document.querySelector(
    `.mes[mesid="${messageId}"]`
  ) as HTMLElement | null;

  if (!messageEl) {
    // Message DOM element may not exist yet during initialization - this is normal
    logger.trace(
      `Message element not found for message ${messageId} (DOM not ready yet)`
    );
    return;
  }

  // Find all images that follow prompt comment tags in the RAW text
  // Strategy: Parse the raw message text to find prompt tags and ALL consecutive images after each prompt
  // Note: Both normal images and failed placeholders use <img> tags now
  const regeneratableImages: HTMLImageElement[] = [];

  // First, find all prompt positions
  const promptPattern =
    /(?:<!--img-prompt="([^"\\]*(?:\\.[^"\\]*)*)"-->|<img_prompt="([^"\\]*(?:\\.[^"\\]*)*)">)/g;
  const promptPositions: number[] = [];
  let match;

  while ((match = promptPattern.exec(messageText)) !== null) {
    promptPositions.push(match.index + match[0].length);
    logger.trace(
      `Found prompt at position ${match.index}: ${match[0].substring(0, 50)}...`
    );
  }

  // For each prompt position, find all consecutive images after it
  const imgPattern = /<img\s+([^>]+)>/g;

  for (let i = 0; i < promptPositions.length; i++) {
    const startPos = promptPositions[i];
    const endPos =
      i < promptPositions.length - 1
        ? promptPositions[i + 1]
        : messageText.length;
    const textSegment = messageText.substring(startPos, endPos);

    // Find all images in this segment (includes both normal and failed placeholders)
    imgPattern.lastIndex = 0; // Reset regex
    while ((match = imgPattern.exec(textSegment)) !== null) {
      const imgAttrs = match[1];
      const srcMatch = imgAttrs.match(/src="([^"]+)"/);

      if (srcMatch) {
        const imgSrc = srcMatch[1];

        // Find the actual img element in DOM by src using utility function
        // This handles HTML entity decoding and CSS selector issues with data URIs
        const imgEl = findImageBySrc(messageEl, imgSrc);

        if (imgEl && !regeneratableImages.includes(imgEl)) {
          regeneratableImages.push(imgEl);
          logger.trace(
            `Found regeneratable image: ${imgSrc.substring(0, 50)}...`
          );
        }
      }
    }
  }

  if (regeneratableImages.length === 0) {
    logger.trace(`No regeneratable images found in message ${messageId}`);
    return;
  }

  logger.debug(
    `Attaching regeneration handlers to ${regeneratableImages.length} images in message ${messageId}`
  );

  // Attach handlers to all images (including failed placeholders)
  regeneratableImages.forEach(img => {
    // Add visual indicator
    img.style.cursor = 'pointer';
    img.title = img.title || 'Click to regenerate';

    // Attach click handler
    img.addEventListener('click', async (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const imageUrl = (e.target as HTMLImageElement).src;

      await handleImageRegenerationClick(
        imageUrl,
        messageId,
        context,
        settings
      );
    });
  });

  logger.trace(
    `Attached regeneration handlers to ${regeneratableImages.length} images in message ${messageId}`
  );
}

/**
 * Adds image click handlers to all messages in chat
 * Called on extension initialization and settings updates
 *
 * @param settings - Extension settings
 */
export function addImageClickHandlers(settings: AutoIllustratorSettings): void {
  const context = SillyTavern.getContext();
  if (!context || !context.chat) {
    logger.warn('Cannot add image click handlers: no context or chat');
    return;
  }

  logger.debug('Adding image click handlers to all messages');

  // Attach handlers to all messages in chat
  context.chat.forEach((_message: unknown, messageId: number) => {
    attachRegenerationHandlers(messageId, context, settings);
  });
}

/**
 * Removes all image click handlers
 * Called when click-to-regenerate is disabled
 */
export function removeImageClickHandlers(): void {
  logger.info('Removing all image click handlers');

  // Remove cursor styling and title from all images
  const allImages = document.querySelectorAll(
    'img[src^="http"]'
  ) as NodeListOf<HTMLImageElement>;

  allImages.forEach(img => {
    img.style.cursor = '';
    if (img.title === 'Click to regenerate') {
      img.title = '';
    }
  });

  // Note: We can't easily remove specific event listeners without keeping references
  // The handlers will be naturally replaced when re-adding handlers
  // This is acceptable since we're just styling cleanup here
}
