/**
 * Progress Widget Module
 * Manages a global loading indicator for image generation
 * Shows progress for all messages in a fixed position above the user input area
 */

import {t} from './i18n';
import {createLogger} from './logger';

const logger = createLogger('ProgressWidget');

// Global state tracking progress for each message
const messageProgress = new Map<
  number,
  {current: number; total: number; startTime: number}
>();

/**
 * Creates or gets the global progress widget element
 * @returns Widget HTMLElement
 */
function getOrCreateGlobalWidget(): HTMLElement {
  const existingWidget = document.getElementById('ai-img-progress-global');
  if (existingWidget) {
    return existingWidget;
  }

  // Create new global widget
  const widget = document.createElement('div');
  widget.id = 'ai-img-progress-global';
  widget.className = 'ai-img-progress-widget-global';
  widget.style.display = 'none'; // Start hidden, will be shown by updateGlobalWidgetDisplay()

  // Find #sheld and #form_sheld to insert widget in correct position
  const sheld = document.getElementById('sheld');
  const formSheld = document.getElementById('form_sheld');

  if (!sheld || !formSheld) {
    logger.error(
      'Could not find #sheld or #form_sheld, falling back to body append'
    );
    document.body.appendChild(widget);
    logger.warn(
      'Widget appended to body as fallback (may have positioning issues)'
    );
  } else {
    // Insert widget BEFORE #form_sheld (just above user input area)
    // This makes it appear between the chat and the input form
    sheld.insertBefore(widget, formSheld);
    logger.info(
      'Created global progress widget and inserted into #sheld before #form_sheld'
    );
  }

  return widget;
}

/**
 * Updates the global widget display with current progress for all messages
 */
function updateGlobalWidgetDisplay(): void {
  const widget = document.getElementById('ai-img-progress-global');
  if (!widget) {
    logger.warn('Global widget not found during update');
    return;
  }

  logger.info(
    `Updating global widget display: ${messageProgress.size} message(s), display will be: ${messageProgress.size === 0 ? 'none' : 'flex'}`
  );

  // Clear existing content
  widget.innerHTML = '';

  if (messageProgress.size === 0) {
    // No active generations - hide widget
    widget.style.display = 'none';
    logger.debug('No active messages, hiding widget');
    return;
  }

  // Show widget
  widget.style.display = 'flex';

  // Add spinner
  const spinner = document.createElement('div');
  spinner.className = 'ai-img-progress-spinner';
  widget.appendChild(spinner);

  // Add progress text for each message
  const container = document.createElement('div');
  container.className = 'ai-img-progress-text-container';

  for (const [messageId, progress] of messageProgress.entries()) {
    const text = document.createElement('div');
    text.className = 'ai-img-progress-text';
    text.textContent = t('toast.generatingImagesProgressWithMessage', {
      messageId: String(messageId),
      current: String(progress.current),
      total: String(progress.total),
    });
    container.appendChild(text);
  }

  widget.appendChild(container);

  // Debug logging AFTER content is added
  const computedStyle = window.getComputedStyle(widget);
  const rect = widget.getBoundingClientRect();
  logger.info(
    `Widget rendered - display: ${computedStyle.display}, visibility: ${computedStyle.visibility}, position: ${computedStyle.position}, zIndex: ${computedStyle.zIndex}, bottom: ${computedStyle.bottom}`
  );
  logger.info(
    `Widget position - top: ${rect.top}px, left: ${rect.left}px, bottom: ${rect.bottom}px, right: ${rect.right}px, width: ${rect.width}px, height: ${rect.height}px`
  );
  logger.info(
    `Widget content: ${widget.children.length} children, innerHTML length: ${widget.innerHTML.length}`
  );

  logger.debug(
    `Updated global widget: ${messageProgress.size} message(s) in progress`
  );
}

/**
 * Adds or updates progress tracking for a message
 * @param messageId - Message ID
 * @param current - Current number of images completed
 * @param total - Total number of images to generate
 */
export function addMessageProgress(
  messageId: number,
  current: number,
  total: number
): void {
  // Ensure widget exists
  getOrCreateGlobalWidget();

  // Add or update progress
  messageProgress.set(messageId, {
    current,
    total,
    startTime: messageProgress.get(messageId)?.startTime || Date.now(),
  });

  updateGlobalWidgetDisplay();

  logger.info(
    `Added/updated progress for message ${messageId}: ${current}/${total}`
  );
}

/**
 * Updates progress for a message
 * @param messageId - Message ID
 * @param current - Current number of images completed
 * @param total - Total number of images to generate
 */
export function updateMessageProgress(
  messageId: number,
  current: number,
  total: number
): void {
  const existing = messageProgress.get(messageId);
  if (!existing) {
    logger.warn(
      `Cannot update progress for message ${messageId}: not being tracked`
    );
    return;
  }

  messageProgress.set(messageId, {
    current,
    total,
    startTime: existing.startTime,
  });

  updateGlobalWidgetDisplay();

  logger.debug(
    `Updated progress for message ${messageId}: ${current}/${total}`
  );
}

/**
 * Removes progress tracking for a message and updates display
 * @param messageId - Message ID
 */
export function removeMessageProgress(messageId: number): void {
  const removed = messageProgress.delete(messageId);

  if (removed) {
    updateGlobalWidgetDisplay();
    logger.info(`Removed progress for message ${messageId}`);
  }
}

/**
 * Legacy API: Inserts progress widget (now adds to global widget)
 * @deprecated Use addMessageProgress instead
 * @param messageId - Message ID
 * @param total - Total number of images to generate
 * @returns Always returns true (widget always succeeds)
 */
export function insertProgressWidget(
  messageId: number,
  total: number
): boolean {
  addMessageProgress(messageId, 0, total);
  return true;
}

/**
 * Legacy API: Updates progress widget (now updates global widget)
 * @deprecated Use updateMessageProgress instead
 * @param messageId - Message ID
 * @param current - Number of images completed
 * @param total - Total number of images
 */
export function updateProgressWidget(
  messageId: number,
  current: number,
  total: number
): void {
  updateMessageProgress(messageId, current, total);
}

/**
 * Legacy API: Removes progress widget (now removes from global widget)
 * @deprecated Use removeMessageProgress instead
 * @param messageId - Message ID
 */
export function removeProgressWidget(messageId: number): void {
  removeMessageProgress(messageId);
}

/**
 * Legacy API: Tries to insert progress widget with retry logic
 * @deprecated No longer needed - widget always succeeds. Use insertProgressWidget instead.
 * @param messageId - Message ID
 * @param total - Total number of images to generate
 * @param _maxRetries - Unused (kept for API compatibility)
 * @param _retryDelay - Unused (kept for API compatibility)
 */
export function tryInsertProgressWidgetWithRetry(
  messageId: number,
  total: number,
  _maxRetries?: number,
  _retryDelay?: number
): void {
  // No retry needed - just add to global widget
  insertProgressWidget(messageId, total);
}
