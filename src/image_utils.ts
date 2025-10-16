/**
 * Image Utilities Module
 * Shared utilities for extracting and processing AI-generated images
 */

import {createLogger} from './logger';
import {getMetadata} from './metadata';
import {getPromptForImage} from './prompt_manager';
import type {ModalImage} from './modal_viewer';

const logger = createLogger('ImageUtils');

/**
 * Normalizes an image URL by converting absolute URLs to relative paths
 * and decoding URL encoding for consistent lookups
 * This is needed because img.src returns absolute URL but we store relative paths
 * @param url - Image URL (absolute or relative)
 * @returns Normalized relative path with decoded characters
 */
export function normalizeImageUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Return decoded pathname (e.g., /user/images/小说家/test.png instead of /user/images/%E5%B0%8F%E8%AF%B4%E5%AE%B6/test.png)
    return decodeURIComponent(urlObj.pathname);
  } catch {
    // If URL parsing fails, it's already a relative path - decode it anyway
    return decodeURIComponent(url);
  }
}

/**
 * Extracts all AI-generated images from a message
 * @param messageText - Raw message text (HTML)
 * @param messageId - Message ID
 * @returns Array of images found in the message
 */
export function extractImagesFromMessage(
  messageText: string,
  messageId: number
): ModalImage[] {
  const images: ModalImage[] = [];

  // Get metadata for prompt lookup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const context = (window as any).SillyTavern?.getContext?.();
  const metadata = getMetadata(context);

  // Find all img tags in the message
  const imgPattern = /<img\s+([^>]+)>/g;
  let match;
  let imageIndex = 0;

  while ((match = imgPattern.exec(messageText)) !== null) {
    const imgAttrs = match[1];
    const srcMatch = imgAttrs.match(/src="([^"]+)"/);
    const titleMatch = imgAttrs.match(/title="([^"]+)"/);
    const altMatch = imgAttrs.match(/alt="([^"]+)"/);

    if (!srcMatch) {
      continue; // No src attribute, skip
    }

    const imageUrl = srcMatch[1];
    const title = titleMatch ? titleMatch[1] : '';
    const alt = altMatch ? altMatch[1] : '';

    // Only include images with "AI generated image" in title
    // This filters out user-uploaded images and other content
    if (!title.startsWith('AI generated image')) {
      logger.trace(
        `Skipping image (not AI generated): ${imageUrl.substring(0, 50)}...`
      );
      continue;
    }

    // Normalize image URL for PromptRegistry lookup
    const normalizedUrl = normalizeImageUrl(imageUrl);

    // Get complete prompt from PromptRegistry using normalized URL
    const promptNode = getPromptForImage(normalizedUrl, metadata);

    let promptText: string;
    if (promptNode) {
      // Use complete prompt from PromptRegistry
      promptText = promptNode.text;
      logger.trace(
        `Found prompt in registry for ${imageUrl.substring(0, 50)}...`
      );
    } else {
      // Fallback: extract from title if not in registry (legacy images)
      promptText = title.replace(/^AI generated image:\s*/, '') || alt;
      logger.trace(
        `No prompt in registry for ${imageUrl.substring(0, 50)}..., using title/alt`
      );
    }

    // Generate prompt preview (first 100 chars)
    const promptPreview =
      promptText.length > 100
        ? promptText.substring(0, 100) + '...'
        : promptText;

    images.push({
      imageUrl,
      promptText,
      promptPreview,
      messageId,
      imageIndex,
    });

    imageIndex++;
  }

  return images;
}

/**
 * Collects all AI-generated images from all messages in the chat
 * @param context - SillyTavern context
 * @returns Array of all images in chat order
 */
export function collectAllImagesFromChat(
  context: SillyTavernContext
): ModalImage[] {
  const allImages: ModalImage[] = [];

  if (!context?.chat) {
    logger.warn('Cannot collect images: no chat available');
    return allImages;
  }

  for (let messageId = 0; messageId < context.chat.length; messageId++) {
    const message = context.chat[messageId];

    // Skip user and system messages
    if (message.is_user || message.is_system) {
      continue;
    }

    const messageText = message.mes || '';
    if (!messageText) {
      continue;
    }

    const images = extractImagesFromMessage(messageText, messageId);
    allImages.push(...images);
  }

  logger.debug(`Collected ${allImages.length} AI-generated images from chat`);
  return allImages;
}
