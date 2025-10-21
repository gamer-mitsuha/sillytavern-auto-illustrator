/**
 * Message Reconciliation Module
 *
 * Provides utilities for:
 * - Idempotency checking (preventing duplicate image insertions)
 * - Message validation (detecting if message modified since prompt detection)
 * - Reconciliation (restoring missing images from metadata)
 *
 * These utilities protect against race conditions where other handlers
 * modify message.mes between detection and insertion.
 */

import {createLogger} from './logger';
import type {AutoIllustratorChatMetadata} from './types';
import type {PromptRegistry} from './prompt_manager';
import {isPlaceholderUrl} from './placeholder';
import {normalizeImageUrl} from './image_utils';
import {htmlEncode, htmlDecode} from './utils/dom_utils';

const logger = createLogger('reconciliation');

/**
 * Marker format: <!-- auto-illustrator:promptId={id},imageUrl={url} -->
 * This stable marker allows idempotency checks and reconciliation
 */
const MARKER_PREFIX = '<!-- auto-illustrator:';
const MARKER_SUFFIX = ' -->';

/**
 * Configuration for reconciliation behavior
 */
export interface ReconciliationConfig {
  /** Enable idempotency markers (default: true) */
  enableMarkers: boolean;
  /** Enable message validation via hashing (default: true) */
  enableValidation: boolean;
  /** Enable auto-reconciliation on missing images (default: true) */
  enableReconciliation: boolean;
  /** Micro-delay before reading message.mes (ms, default: 100) */
  insertionDelayMs: number;
}

/**
 * Default configuration
 */
export const DEFAULT_RECONCILIATION_CONFIG: ReconciliationConfig = {
  enableMarkers: true,
  enableValidation: true,
  enableReconciliation: true,
  insertionDelayMs: 100,
};

/**
 * Result of an idempotency check
 */
export interface IdempotencyCheckResult {
  /** True if image already inserted (marker found) */
  alreadyInserted: boolean;
  /** Position where marker was found (-1 if not found) */
  markerPosition: number;
  /** The marker text if found */
  markerText?: string;
}

/**
 * Result of message validation
 */
export interface ValidationResult {
  /** True if message appears significantly modified */
  modified: boolean;
  /** Original hash at detection time */
  originalHash: string;
  /** Current hash */
  currentHash: string;
  /** Percentage change (0-100) */
  changePercent: number;
}

/**
 * Result of reconciliation operation
 */
export interface ReconciliationResult {
  /** Number of missing images detected */
  missingCount: number;
  /** Number of images successfully restored */
  restoredCount: number;
  /** Errors encountered during reconciliation */
  errors: string[];
}

/**
 * Creates an idempotency marker for an image insertion
 * Normalizes the image URL to ensure consistency
 */
export function createMarker(promptId: string, imageUrl: string): string {
  // Normalize URL to ensure consistent format (preserves data URIs)
  const normalizedUrl = normalizeImageUrl(imageUrl);

  // Escape special characters in URL using centralized utility
  const escapedUrl = htmlEncode(normalizedUrl);

  return `${MARKER_PREFIX}promptId=${promptId},imageUrl=${escapedUrl}${MARKER_SUFFIX}`;
}

/**
 * Parses a marker to extract promptId and imageUrl
 */
export function parseMarker(
  marker: string
): {promptId: string; imageUrl: string} | null {
  const pattern = /<!-- auto-illustrator:promptId=([^,]+),imageUrl=(.+?) -->/;
  const match = pattern.exec(marker);

  if (!match) {
    return null;
  }

  // Unescape URL using centralized utility
  const imageUrl = htmlDecode(match[2]);

  return {
    promptId: match[1],
    imageUrl,
  };
}

/**
 * Checks if an image has already been inserted (idempotency check)
 * Normalizes the image URL to ensure consistent comparison
 */
export function checkIdempotency(
  messageText: string,
  promptId: string,
  imageUrl: string
): IdempotencyCheckResult {
  // Normalize URL before creating marker to ensure consistent comparison
  const normalizedUrl = normalizeImageUrl(imageUrl);
  const marker = createMarker(promptId, normalizedUrl);
  const position = messageText.indexOf(marker);

  if (position !== -1) {
    logger.debug(
      `Idempotency check: Image already inserted (marker found at ${position})`
    );
    return {
      alreadyInserted: true,
      markerPosition: position,
      markerText: marker,
    };
  }

  // Also check for image URL directly (legacy insertions without markers)
  const escapedUrl = normalizedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const imgTagPattern = new RegExp(`<img[^>]*src="${escapedUrl}"[^>]*>`, 'i');
  const legacyFound = imgTagPattern.test(messageText);

  if (legacyFound) {
    logger.debug(
      'Idempotency check: Image already inserted (legacy format without marker)'
    );
    return {
      alreadyInserted: true,
      markerPosition: -1,
    };
  }

  return {
    alreadyInserted: false,
    markerPosition: -1,
  };
}

/**
 * Computes a simple hash of a string (FNV-1a algorithm)
 * Used for detecting message modifications
 */
export function hashString(str: string): string {
  let hash = 2166136261; // FNV offset basis

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  // Convert to unsigned 32-bit integer and then to hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Validates that a message hasn't been significantly modified since detection
 */
export function validateMessageState(
  originalText: string,
  currentText: string,
  threshold = 10 // Allow up to 10% change
): ValidationResult {
  const originalHash = hashString(originalText);
  const currentHash = hashString(currentText);

  if (originalHash === currentHash) {
    return {
      modified: false,
      originalHash,
      currentHash,
      changePercent: 0,
    };
  }

  // Calculate approximate change percentage based on length difference
  const lengthDiff = Math.abs(currentText.length - originalText.length);
  const changePercent = (lengthDiff / originalText.length) * 100;

  return {
    modified: changePercent > threshold,
    originalHash,
    currentHash,
    changePercent: Math.round(changePercent * 10) / 10,
  };
}

/**
 * Finds all markers in message text
 */
export function findAllMarkers(messageText: string): string[] {
  const markers: string[] = [];
  const pattern = /<!-- auto-illustrator:promptId=[^,]+,imageUrl=.+? -->/g;

  let match;
  while ((match = pattern.exec(messageText)) !== null) {
    markers.push(match[0]);
  }

  return markers;
}

/**
 * Reconciles missing images in a message by comparing metadata with message text
 * Returns the updated message text with missing images restored
 */
export function reconcileMessage(
  messageId: number,
  messageText: string,
  metadata: AutoIllustratorChatMetadata
): {updatedText: string; result: ReconciliationResult} {
  const result: ReconciliationResult = {
    missingCount: 0,
    restoredCount: 0,
    errors: [],
  };

  // No reconciliation needed if no prompt registry
  if (!metadata.promptRegistry) {
    return {updatedText: messageText, result};
  }

  const registry: PromptRegistry = metadata.promptRegistry;
  let updatedText = messageText;

  // Find all prompts for this message
  const messagePrompts = Object.values(registry.nodes).filter(
    node => node.messageId === messageId
  );

  if (messagePrompts.length === 0) {
    logger.debug(
      `No prompts registered for message ${messageId}, skipping reconciliation`
    );
    return {updatedText: messageText, result};
  }

  logger.debug(
    `Reconciling message ${messageId}: checking ${messagePrompts.length} prompts`
  );

  // Check each prompt's images
  for (const promptNode of messagePrompts) {
    if (promptNode.generatedImages.length === 0) {
      continue;
    }

    for (const imageUrl of promptNode.generatedImages) {
      // Check if image already present
      const idempotencyCheck = checkIdempotency(
        updatedText,
        promptNode.id,
        imageUrl
      );

      if (idempotencyCheck.alreadyInserted) {
        continue; // Image already present, skip
      }

      // Image missing - need to restore
      result.missingCount++;
      logger.info(
        `Missing image detected for prompt ${promptNode.id}: ${imageUrl.substring(0, 50)}...`
      );

      try {
        // Find the prompt tag in the message
        // Try to find by searching for the prompt text in a comment/tag
        const promptText = promptNode.text;
        const escapedPrompt = htmlEncode(promptText);

        // Try multiple pattern variants
        const patterns = [
          `<!--img-prompt="${escapedPrompt}"-->`,
          `<!--img-prompt='${promptText}'-->`,
          `<img-prompt="${escapedPrompt}">`,
          `<img-prompt='${promptText}'>`,
        ];

        let insertionPoint = -1;
        let matchedPattern = '';

        for (const pattern of patterns) {
          insertionPoint = updatedText.indexOf(pattern);
          if (insertionPoint !== -1) {
            matchedPattern = pattern;
            break;
          }
        }

        if (insertionPoint === -1) {
          result.errors.push(
            `Cannot find prompt tag for prompt ${promptNode.id} in message ${messageId}`
          );
          logger.warn(
            `Cannot restore image: prompt tag not found for ${promptNode.id}`
          );
          continue;
        }

        // Check if this is a placeholder image (handles both old and new format with fragment)
        const isPlaceholder = isPlaceholderUrl(imageUrl);

        // Create image tag using shared function
        // Works for both normal images and failed placeholders (both use img tags with real URLs)
        const contentHtml = createImageTag(
          imageUrl,
          promptNode.text,
          promptNode.id,
          true, // include marker
          isPlaceholder // isFailed - adds placeholder attributes
        );

        // Insert after the prompt tag
        const insertPoint = insertionPoint + matchedPattern.length;
        updatedText =
          updatedText.substring(0, insertPoint) +
          contentHtml +
          updatedText.substring(insertPoint);

        result.restoredCount++;
        logger.info(
          `Restored missing image for prompt ${promptNode.id} at position ${insertPoint}`
        );
      } catch (error) {
        const errorMsg = `Failed to restore image for prompt ${promptNode.id}: ${error}`;
        result.errors.push(errorMsg);
        logger.error(errorMsg);
      }
    }
  }

  if (result.restoredCount > 0) {
    logger.info(
      `Reconciliation complete: restored ${result.restoredCount}/${result.missingCount} missing images`
    );
  } else if (result.missingCount > 0) {
    logger.warn(
      `Reconciliation incomplete: could not restore ${result.missingCount} missing images`
    );
  } else {
    logger.debug('Reconciliation complete: no missing images');
  }

  return {updatedText, result};
}

/**
 * Utility to introduce a micro-delay before insertion
 * Allows other post-processors to finish
 */
export function microDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Removes all idempotency markers from text
 * Used for cleaning chat history before sending to LLM
 *
 * @param text - Text to clean
 * @returns Text with all markers removed
 */
export function removeAllMarkers(text: string): string {
  // Remove all markers using regex
  const markerPattern =
    /<!-- auto-illustrator:promptId=[^,]+,imageUrl=.+? -->\s*/g;
  return text.replace(markerPattern, '');
}

/**
 * Creates an image tag with consistent formatting
 * Used by both image insertion and reconciliation to ensure consistent format
 *
 * @param imageUrl - URL of the image (or placeholder data URI)
 * @param promptText - Full text of the prompt
 * @param promptId - ID of the prompt node
 * @param includeMarker - Whether to include the idempotency marker (default: true)
 * @param isFailed - Whether this is a failed placeholder image (default: false)
 * @param displayWidth - Display width percentage (default: 100)
 * @returns HTML string with marker and img tag
 */
export function createImageTag(
  imageUrl: string,
  promptText: string,
  promptId: string,
  includeMarker = true,
  isFailed = false,
  displayWidth = 100
): string {
  // Create prompt preview (max 50 chars)
  const promptPreview =
    promptText.substring(0, 50) + (promptText.length > 50 ? '...' : '');

  // Title depends on whether it's a failed placeholder or normal image
  let imageTitle: string;
  if (isFailed) {
    // For failed placeholders, include error message in title
    imageTitle = `Image generation failed: ${promptPreview}\nClick to retry`;
  } else {
    // IMPORTANT: title must start with "AI generated image" for gallery widget to recognize it
    imageTitle = `AI generated image: ${promptPreview}`;
  }

  // Create marker if enabled
  const marker = includeMarker ? createMarker(promptId, imageUrl) : '';

  // Use smaller width for failed placeholders (they're just error indicators)
  const effectiveWidth = isFailed ? 10 : displayWidth;

  // Build attributes with display width and centering
  const baseAttrs = `src="${htmlEncode(imageUrl)}" alt="${htmlEncode(promptPreview)}" title="${htmlEncode(imageTitle)}" class="auto-illustrator-img" data-prompt-id="${htmlEncode(promptId)}" style="width: ${effectiveWidth}%; max-width: 100%; height: auto; border-radius: 8px; margin: 8px auto; display: block;"`;

  // Add data-failed-placeholder attribute for failed placeholders
  const failedAttr = isFailed ? ' data-failed-placeholder="true"' : '';

  // Add full prompt text for failed placeholders (needed for regeneration)
  const promptTextAttr = isFailed
    ? ` data-prompt-text="${htmlEncode(promptText)}"`
    : '';

  // Create image tag with all attributes
  const imgTag = `<img ${baseAttrs}${failedAttr}${promptTextAttr} />`;

  // Return with or without marker
  return marker ? `\n${marker}\n${imgTag}\n` : `\n${imgTag}\n`;
}
