/**
 * Progress Widget Module
 * Manages loading indicators for image generation
 */

import {t} from './i18n';
import {createLogger} from './logger';

const logger = createLogger('ProgressWidget');

/**
 * Creates a progress widget element
 * @param messageId - Message ID
 * @param total - Total number of images to generate
 * @returns Widget HTMLElement
 */
export function createProgressWidget(
  messageId: number,
  total: number
): HTMLElement {
  const widget = document.createElement('div');
  widget.id = `ai-img-progress-${messageId}`;
  widget.className = 'ai-img-progress-widget';

  // Spinner
  const spinner = document.createElement('div');
  spinner.className = 'ai-img-progress-spinner';

  // Text
  const text = document.createElement('span');
  text.className = 'ai-img-progress-text';
  text.textContent = t('toast.generatingImagesProgress', {
    current: '0',
    total: String(total),
  });

  widget.appendChild(spinner);
  widget.appendChild(text);

  logger.debug(`Created progress widget for message ${messageId}`);
  return widget;
}

/**
 * Updates the progress widget with current progress
 * @param messageId - Message ID
 * @param current - Number of images completed
 * @param total - Total number of images
 */
export function updateProgressWidget(
  messageId: number,
  current: number,
  total: number
): void {
  const widget = document.getElementById(`ai-img-progress-${messageId}`);
  if (!widget) {
    logger.warn(`Progress widget not found for message ${messageId}`);
    return;
  }

  const textEl = widget.querySelector('.ai-img-progress-text');
  if (textEl) {
    textEl.textContent = t('toast.generatingImagesProgress', {
      current: String(current),
      total: String(total),
    });
  }

  logger.debug(
    `Updated progress widget for message ${messageId}: ${current}/${total}`
  );
}

/**
 * Removes the progress widget from the DOM
 * @param messageId - Message ID
 */
export function removeProgressWidget(messageId: number): void {
  const widget = document.getElementById(`ai-img-progress-${messageId}`);
  if (widget) {
    widget.remove();
    logger.debug(`Removed progress widget for message ${messageId}`);
  }
}

/**
 * Inserts progress widget into a message element
 * @param messageId - Message ID
 * @param total - Total number of images to generate
 * @returns True if widget was inserted, false if message not found
 */
export function insertProgressWidget(
  messageId: number,
  total: number
): boolean {
  // Check if widget already exists first
  const existingWidget = document.getElementById(
    `ai-img-progress-${messageId}`
  );
  if (existingWidget) {
    logger.debug(`Progress widget already exists for message ${messageId}`);
    return false;
  }

  // Find message container
  const messageEl = document.querySelector(`.mes[mesid="${messageId}"]`);
  if (!messageEl) {
    logger.warn(`Message element not found: ${messageId}`);
    return false;
  }

  const messageText = messageEl.querySelector('.mes_text');
  if (!messageText) {
    logger.warn(`Message text element not found: ${messageId}`);
    return false;
  }

  // Create and insert widget
  const widget = createProgressWidget(messageId, total);
  // Insert widget after .mes_text as a sibling, not inside it
  // This prevents streaming updates from removing the widget
  messageText.insertAdjacentElement('afterend', widget);

  logger.info(
    `Inserted progress widget for message ${messageId} (${total} images)`
  );
  return true;
}

/**
 * Tries to insert progress widget with retry logic
 * Retries up to maxRetries times with delay between attempts
 * @param messageId - Message ID
 * @param total - Total number of images to generate
 * @param maxRetries - Maximum number of retry attempts (default: 10)
 * @param retryDelay - Delay between retries in ms (default: 100)
 */
export function tryInsertProgressWidgetWithRetry(
  messageId: number,
  total: number,
  maxRetries = 10,
  retryDelay = 100
): void {
  let attempts = 0;

  const attemptInsert = () => {
    attempts++;

    // Try to insert widget
    const success = insertProgressWidget(messageId, total);

    if (success) {
      logger.debug(
        `Progress widget inserted successfully on attempt ${attempts}`
      );
      return;
    }

    // Retry if we haven't exceeded max attempts
    if (attempts < maxRetries) {
      logger.debug(
        `Progress widget insertion failed, retrying... (attempt ${attempts}/${maxRetries})`
      );
      setTimeout(attemptInsert, retryDelay);
    } else {
      logger.warn(
        `Failed to insert progress widget after ${maxRetries} attempts`
      );
    }
  };

  // Start first attempt
  attemptInsert();
}
