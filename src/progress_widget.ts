/**
 * Progress Widget Module
 * Manages a global loading indicator for image generation
 * Shows progress for all messages in a fixed position above the user input area
 *
 * Architecture: View layer that subscribes to ProgressManager events
 * - Listens to progress:started, progress:updated, progress:cleared
 * - Throttles DOM updates to prevent thrashing
 * - Shows success/failure breakdown
 * - No business logic, purely presentational
 */

import {createLogger} from './logger';
import {t} from './i18n';
import type {
  ProgressManager,
  ProgressStartedEventDetail,
  ProgressUpdatedEventDetail,
  ProgressClearedEventDetail,
  ProgressImageCompletedEventDetail,
} from './progress_manager';

const logger = createLogger('ProgressWidget');

// State tracking progress for each message
interface MessageProgressState {
  current: number;
  total: number;
  succeeded: number;
  failed: number;
  startTime: number;
  completedImages: CompletedImage[]; // Thumbnails for streaming preview
}

// Completed image data for thumbnail display
interface CompletedImage {
  imageUrl: string;
  promptText: string;
  promptPreview: string;
  completedAt: number;
}

/**
 * Progress Widget - View layer for progress visualization
 * Subscribes to ProgressManager events and renders DOM updates
 */
class ProgressWidgetView {
  private messageProgress = new Map<number, MessageProgressState>();
  private updateTimer: number | null = null;
  private readonly THROTTLE_MS = 100; // Max 10 updates per second

  /**
   * Initializes the widget and subscribes to ProgressManager events
   */
  constructor(manager: ProgressManager) {
    // Subscribe to all progress events
    manager.addEventListener('progress:started', event => {
      const detail = (event as CustomEvent<ProgressStartedEventDetail>).detail;
      this.handleStarted(detail);
    });

    manager.addEventListener('progress:updated', event => {
      const detail = (event as CustomEvent<ProgressUpdatedEventDetail>).detail;
      this.handleUpdated(detail);
    });

    manager.addEventListener('progress:cleared', event => {
      const detail = (event as CustomEvent<ProgressClearedEventDetail>).detail;
      this.handleCleared(detail);
    });

    manager.addEventListener('progress:image-completed', event => {
      const detail = (event as CustomEvent<ProgressImageCompletedEventDetail>)
        .detail;
      this.handleImageCompleted(detail);
    });

    logger.debug('ProgressWidget initialized and subscribed to manager events');
  }

  /**
   * Handles progress:started event
   */
  private handleStarted(detail: ProgressStartedEventDetail): void {
    logger.debug(`Started tracking message ${detail.messageId}`);
    this.messageProgress.set(detail.messageId, {
      current: 0,
      total: detail.total,
      succeeded: 0,
      failed: 0,
      startTime: Date.now(),
      completedImages: [],
    });
    this.scheduleUpdate();
  }

  /**
   * Handles progress:updated event
   */
  private handleUpdated(detail: ProgressUpdatedEventDetail): void {
    logger.debug(
      `Updated message ${detail.messageId}: ${detail.completed}/${detail.total} (${detail.succeeded} ok, ${detail.failed} failed)`
    );
    const existing = this.messageProgress.get(detail.messageId);
    this.messageProgress.set(detail.messageId, {
      current: detail.completed,
      total: detail.total,
      succeeded: detail.succeeded,
      failed: detail.failed,
      startTime: existing?.startTime ?? Date.now(),
      completedImages: existing?.completedImages ?? [],
    });
    this.scheduleUpdate();
  }

  /**
   * Handles progress:cleared event
   * This is when the operation is finished and widget should hide
   */
  private handleCleared(detail: ProgressClearedEventDetail): void {
    logger.debug(`Cleared tracking for message ${detail.messageId}`);
    this.messageProgress.delete(detail.messageId);
    this.scheduleUpdate();
  }

  /**
   * Handles progress:image-completed event
   * Adds completed image to thumbnail gallery
   */
  private handleImageCompleted(
    detail: ProgressImageCompletedEventDetail
  ): void {
    logger.debug(
      `Image completed for message ${detail.messageId}: ${detail.promptPreview}`
    );
    const progress = this.messageProgress.get(detail.messageId);
    if (!progress) {
      logger.warn(
        `Cannot add image: message ${detail.messageId} not being tracked`
      );
      return;
    }

    // Add to completed images array
    progress.completedImages.push({
      imageUrl: detail.imageUrl,
      promptText: detail.promptText,
      promptPreview: detail.promptPreview,
      completedAt: detail.completedAt,
    });

    this.scheduleUpdate();
  }

  /**
   * Schedules a throttled DOM update
   * Multiple rapid calls will be batched into a single update
   */
  private scheduleUpdate(): void {
    if (this.updateTimer !== null) {
      return; // Update already scheduled
    }

    this.updateTimer = window.setTimeout(() => {
      this.updateTimer = null;
      this.updateDisplay();
    }, this.THROTTLE_MS);
  }

  /**
   * Actually updates the DOM (called by throttled scheduler)
   */
  private updateDisplay(): void {
    const widget = this.getOrCreateGlobalWidget();

    logger.debug(
      `Updating display: ${this.messageProgress.size} message(s), display will be: ${this.messageProgress.size === 0 ? 'none' : 'flex'}`
    );

    // Clear existing content
    widget.innerHTML = '';

    if (this.messageProgress.size === 0) {
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

    for (const [messageId, progress] of this.messageProgress.entries()) {
      const text = document.createElement('div');
      text.className = 'ai-img-progress-text';

      // Show detailed breakdown: "Message 123: 5 ok, 2 failed, 3 pending"
      const pending = progress.total - progress.current;
      const parts: string[] = [];

      if (progress.succeeded > 0) {
        parts.push(
          `<span class="ai-img-progress-success">${progress.succeeded} ${t('progress.succeeded')}</span>`
        );
      }
      if (progress.failed > 0) {
        parts.push(
          `<span class="ai-img-progress-failed">${progress.failed} ${t('progress.failed')}</span>`
        );
      }
      if (pending > 0) {
        parts.push(
          `<span class="ai-img-progress-pending">${pending} ${t('progress.pending')}</span>`
        );
      }

      text.innerHTML = `${t('progress.message', {messageId: String(messageId)})}: ${parts.join(', ')}`;
      container.appendChild(text);

      // Add thumbnail gallery if there are completed images
      if (progress.completedImages.length > 0) {
        const gallery = this.createThumbnailGallery(
          messageId,
          progress.completedImages
        );
        container.appendChild(gallery);
      }
    }

    widget.appendChild(container);

    // Debug logging AFTER content is added
    const computedStyle = window.getComputedStyle(widget);
    const rect = widget.getBoundingClientRect();
    logger.trace(
      `Widget rendered - display: ${computedStyle.display}, visibility: ${computedStyle.visibility}, position: ${computedStyle.position}, zIndex: ${computedStyle.zIndex}, bottom: ${computedStyle.bottom}`
    );
    logger.trace(
      `Widget position - top: ${rect.top}px, left: ${rect.left}px, bottom: ${rect.bottom}px, right: ${rect.right}px, width: ${rect.width}px, height: ${rect.height}px`
    );
    logger.trace(
      `Widget content: ${widget.children.length} children, innerHTML length: ${widget.innerHTML.length}`
    );

    logger.debug(
      `Updated widget display: ${this.messageProgress.size} message(s) in progress`
    );
  }

  /**
   * Creates thumbnail gallery for completed images
   * @param messageId - Message ID (for logging)
   * @param images - Array of completed images
   * @returns Gallery container element
   */
  private createThumbnailGallery(
    messageId: number,
    images: CompletedImage[]
  ): HTMLElement {
    const gallery = document.createElement('div');
    gallery.className = 'ai-img-progress-gallery';

    // Add label
    const label = document.createElement('div');
    label.className = 'ai-img-progress-gallery-label';
    label.textContent = t('progress.generatedImages');
    gallery.appendChild(label);

    // Add thumbnails container
    const thumbnailsContainer = document.createElement('div');
    thumbnailsContainer.className = 'ai-img-progress-thumbnails';

    // Limit to max 5 thumbnails to avoid clutter
    const displayImages = images.slice(0, 5);

    for (const image of displayImages) {
      const thumbnail = document.createElement('div');
      thumbnail.className = 'ai-img-progress-thumbnail';
      thumbnail.title = image.promptText; // Full prompt on hover

      // Create img element
      const img = document.createElement('img');
      img.src = image.imageUrl;
      img.alt = image.promptPreview;
      img.loading = 'lazy';

      // Add click handler to show full-size modal
      thumbnail.addEventListener('click', () => {
        this.showImageModal(image.imageUrl, image.promptText);
      });

      thumbnail.appendChild(img);
      thumbnailsContainer.appendChild(thumbnail);
    }

    gallery.appendChild(thumbnailsContainer);

    // Add hint text
    const hint = document.createElement('div');
    hint.className = 'ai-img-progress-gallery-hint';
    hint.textContent = t('progress.clickToView');
    gallery.appendChild(hint);

    logger.trace(
      `Created gallery with ${displayImages.length} thumbnails for message ${messageId}`
    );

    return gallery;
  }

  /**
   * Shows full-size image in modal overlay
   * @param imageUrl - URL of the image to display
   * @param promptText - Prompt text for title
   */
  private showImageModal(imageUrl: string, promptText: string): void {
    logger.debug('Showing image modal');

    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'ai-img-modal-backdrop';

    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'ai-img-modal';

    // Create image
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = promptText;
    img.className = 'ai-img-modal-image';

    // Create prompt text
    const prompt = document.createElement('div');
    prompt.className = 'ai-img-modal-prompt';
    prompt.textContent = promptText;

    modal.appendChild(img);
    modal.appendChild(prompt);
    backdrop.appendChild(modal);

    // Close on backdrop click
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) {
        backdrop.remove();
        logger.debug('Image modal closed');
      }
    });

    // Close on Escape key
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        backdrop.remove();
        document.removeEventListener('keydown', handleEscape);
        logger.debug('Image modal closed via Escape');
      }
    };
    document.addEventListener('keydown', handleEscape);

    document.body.appendChild(backdrop);
  }

  /**
   * Creates or gets the global progress widget element
   * @returns Widget HTMLElement
   */
  private getOrCreateGlobalWidget(): HTMLElement {
    const existingWidget = document.getElementById('ai-img-progress-global');
    if (existingWidget) {
      return existingWidget;
    }

    // Create new global widget
    const widget = document.createElement('div');
    widget.id = 'ai-img-progress-global';
    widget.className = 'ai-img-progress-widget-global';
    widget.style.display = 'none'; // Start hidden, will be shown by updateDisplay()

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
      logger.debug(
        'Created global progress widget and inserted into #sheld before #form_sheld'
      );
    }

    return widget;
  }
}

// Singleton widget instance (initialized lazily)
let widgetInstance: ProgressWidgetView | null = null;

/**
 * Initializes the progress widget with a ProgressManager
 * Should be called once during extension initialization
 * @param manager - ProgressManager instance to subscribe to
 */
export function initializeProgressWidget(manager: ProgressManager): void {
  if (widgetInstance) {
    logger.warn('Progress widget already initialized');
    return;
  }

  widgetInstance = new ProgressWidgetView(manager);
  logger.info('Progress widget initialized');
}
