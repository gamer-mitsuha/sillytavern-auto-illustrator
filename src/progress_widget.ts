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
  private readonly progressManager: ProgressManager;

  /**
   * Initializes the widget and subscribes to ProgressManager events
   */
  constructor(manager: ProgressManager) {
    this.progressManager = manager;
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

    // Add header with spinner and title
    const header = document.createElement('div');
    header.className = 'ai-img-progress-header';

    const spinner = document.createElement('div');
    spinner.className = 'ai-img-progress-spinner';
    header.appendChild(spinner);

    const title = document.createElement('div');
    title.className = 'ai-img-progress-title';
    title.textContent = t('progress.generatingImages');
    header.appendChild(title);

    widget.appendChild(header);

    // Add progress content for each message
    const container = document.createElement('div');
    container.className = 'ai-img-progress-text-container';

    for (const [messageId, progress] of this.messageProgress.entries()) {
      const messageSection = document.createElement('div');
      messageSection.className = 'ai-img-progress-text';

      // Message label
      const label = document.createElement('div');
      label.className = 'ai-img-progress-message-label';
      label.textContent = t('progress.message', {
        messageId: String(messageId),
      });
      messageSection.appendChild(label);

      // Status badges
      const badgesContainer = document.createElement('div');
      badgesContainer.className = 'ai-img-progress-status-badges';

      const pending = progress.total - progress.current;

      if (progress.succeeded > 0) {
        const badge = this.createStatusBadge(
          '✓',
          progress.succeeded,
          t('progress.succeeded'),
          'success'
        );
        badgesContainer.appendChild(badge);
      }

      if (progress.failed > 0) {
        const badge = this.createStatusBadge(
          '✗',
          progress.failed,
          t('progress.failed'),
          'failed'
        );
        badgesContainer.appendChild(badge);
      }

      if (pending > 0) {
        const badge = this.createStatusBadge(
          '⏳',
          pending,
          t('progress.pending'),
          'pending'
        );
        badgesContainer.appendChild(badge);
      }

      messageSection.appendChild(badgesContainer);

      // Progress bar
      const progressPercent =
        progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
      const progressBar = this.createProgressBar(progressPercent);
      messageSection.appendChild(progressBar);

      container.appendChild(messageSection);

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
   * Creates a status badge element
   * @param icon - Icon character (✓, ✗, ⏳)
   * @param count - Number to display
   * @param label - Text label
   * @param variant - Badge variant (success, failed, pending)
   * @returns Badge element
   */
  private createStatusBadge(
    icon: string,
    count: number,
    label: string,
    variant: string
  ): HTMLElement {
    const badge = document.createElement('div');
    badge.className = `ai-img-progress-badge ${variant}`;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'ai-img-progress-badge-icon';
    iconSpan.textContent = icon;
    badge.appendChild(iconSpan);

    const text = document.createElement('span');
    text.textContent = `${count} ${label}`;
    badge.appendChild(text);

    return badge;
  }

  /**
   * Creates a progress bar element
   * @param percent - Progress percentage (0-100)
   * @returns Progress bar container element
   */
  private createProgressBar(percent: number): HTMLElement {
    const container = document.createElement('div');
    container.className = 'ai-img-progress-bar-container';

    const bar = document.createElement('div');
    bar.className = 'ai-img-progress-bar';
    bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;

    container.appendChild(bar);
    return container;
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

    // Show all thumbnails in a scrollable container
    const displayImages = images;
    const totalImages = images.length;

    for (let i = 0; i < displayImages.length; i++) {
      const image = displayImages[i];
      const thumbnail = document.createElement('div');
      thumbnail.className = 'ai-img-progress-thumbnail';
      thumbnail.title = image.promptText; // Full prompt on hover

      // Add index badge
      const indexBadge = document.createElement('div');
      indexBadge.className = 'ai-img-progress-thumbnail-index';
      indexBadge.textContent = t('progress.imageIndex', {
        current: String(i + 1),
        total: String(totalImages),
      });
      thumbnail.appendChild(indexBadge);

      // Create img element
      const img = document.createElement('img');
      img.src = image.imageUrl;
      img.alt = image.promptPreview;
      img.loading = 'lazy';
      thumbnail.appendChild(img);

      // Add click handler to show full-size modal with image index
      thumbnail.addEventListener('click', () => {
        this.showImageModal(messageId, i);
      });

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
   * Shows full-size image in modal overlay with navigation
   * @param messageId - Message ID (for logging and fetching live images)
   * @param initialIndex - Index of image to show initially
   */
  private showImageModal(messageId: number, initialIndex: number): void {
    // Get the live images array from messageProgress
    const progress = this.messageProgress.get(messageId);
    if (!progress) {
      logger.warn(`Cannot show modal: message ${messageId} not found`);
      return;
    }

    logger.debug(
      `Showing image modal for message ${messageId}, image ${initialIndex + 1}/${progress.completedImages.length}`
    );

    let currentIndex = initialIndex;
    let isZoomed = false;

    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'ai-img-modal-backdrop';

    // Create modal container
    const container = document.createElement('div');
    container.className = 'ai-img-modal-container';

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ai-img-modal-close';
    closeBtn.innerHTML = '×';
    closeBtn.title = t('modal.close');
    container.appendChild(closeBtn);

    // Content area with navigation
    const content = document.createElement('div');
    content.className = 'ai-img-modal-content';

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'ai-img-modal-nav prev';
    prevBtn.innerHTML = '▶';
    prevBtn.title = t('modal.previous');
    content.appendChild(prevBtn);

    // Image container
    const imageContainer = document.createElement('div');
    imageContainer.className = 'ai-img-modal-image-container';

    const img = document.createElement('img');
    img.className = 'ai-img-modal-image';
    imageContainer.appendChild(img);

    content.appendChild(imageContainer);

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'ai-img-modal-nav next';
    nextBtn.innerHTML = '▶';
    nextBtn.title = t('modal.next');
    content.appendChild(nextBtn);

    container.appendChild(content);

    // Info bar
    const info = document.createElement('div');
    info.className = 'ai-img-modal-info';

    const meta = document.createElement('div');
    meta.className = 'ai-img-modal-meta';
    info.appendChild(meta);

    const promptDiv = document.createElement('div');
    promptDiv.className = 'ai-img-modal-prompt';
    info.appendChild(promptDiv);

    container.appendChild(info);

    backdrop.appendChild(container);

    // Update display function
    const updateDisplay = () => {
      const currentImage = progress.completedImages[currentIndex];
      img.src = currentImage.imageUrl;
      img.alt = currentImage.promptPreview;

      // Update metadata
      meta.innerHTML = `
        <div class="ai-img-modal-meta-item">
          <span class="ai-img-modal-meta-label">${t('progress.imageIndex', {current: String(currentIndex + 1), total: String(progress.completedImages.length)})}</span>
        </div>
        <div class="ai-img-modal-actions">
          <button class="ai-img-modal-action-btn zoom-btn" title="${t('modal.zoom')}">
            🔍 ${t('modal.zoom')}
          </button>
          <button class="ai-img-modal-action-btn download-btn" title="${t('modal.download')}">
            💾 ${t('modal.download')}
          </button>
        </div>
      `;

      promptDiv.textContent = currentImage.promptText;

      // Update button states
      prevBtn.disabled = currentIndex === 0;
      nextBtn.disabled = currentIndex === progress.completedImages.length - 1;

      // Re-attach action button handlers
      const zoomBtn = meta.querySelector('.zoom-btn');
      const downloadBtn = meta.querySelector('.download-btn');

      zoomBtn?.addEventListener('click', () => {
        isZoomed = !isZoomed;
        img.classList.toggle('zoomed', isZoomed);
      });

      downloadBtn?.addEventListener('click', () => {
        this.downloadImage(
          currentImage.imageUrl,
          `image-${currentIndex + 1}.png`
        );
      });
    };

    // Initial display
    updateDisplay();

    // Toggle prompt visibility on mobile (tap on info bar)
    info.addEventListener('click', event => {
      // Only toggle if clicking on the info bar itself, not the action buttons
      const target = event.target as HTMLElement;
      if (
        !target.closest('.ai-img-modal-action-btn') &&
        window.innerWidth <= 768
      ) {
        info.classList.toggle('expanded');
      }
    });

    // Listen for new images completing while modal is open
    const handleImageCompleted = ((
      event: CustomEvent<ProgressImageCompletedEventDetail>
    ) => {
      const detail = event.detail;
      // Only update if the new image is for this message
      if (detail.messageId === messageId) {
        logger.debug(
          `Modal notified of new image for message ${messageId}, now ${progress.completedImages.length} total`
        );
        // Refresh the display to update the count and enable navigation
        // Note: progress.completedImages is updated by handleImageCompleted()
        updateDisplay();
      }
    }) as EventListener;

    this.progressManager.addEventListener(
      'progress:image-completed',
      handleImageCompleted
    );

    // Navigation handlers
    prevBtn.addEventListener('click', () => {
      if (currentIndex > 0) {
        currentIndex--;
        isZoomed = false;
        img.classList.remove('zoomed');
        updateDisplay();
      }
    });

    nextBtn.addEventListener('click', () => {
      if (currentIndex < progress.completedImages.length - 1) {
        currentIndex++;
        isZoomed = false;
        img.classList.remove('zoomed');
        updateDisplay();
      }
    });

    // Zoom on image click
    img.addEventListener('click', () => {
      isZoomed = !isZoomed;
      img.classList.toggle('zoomed', isZoomed);
    });

    // Close handlers
    const closeModal = () => {
      backdrop.remove();
      document.removeEventListener('keydown', handleKeyboard);
      this.progressManager.removeEventListener(
        'progress:image-completed',
        handleImageCompleted
      );
      logger.debug('Image modal closed');
    };

    closeBtn.addEventListener('click', closeModal);

    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) {
        closeModal();
      }
    });

    // Keyboard navigation
    const handleKeyboard = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          closeModal();
          break;
        case 'ArrowLeft':
          if (currentIndex > 0) {
            prevBtn.click();
          }
          break;
        case 'ArrowRight':
          if (currentIndex < progress.completedImages.length - 1) {
            nextBtn.click();
          }
          break;
      }
    };
    document.addEventListener('keydown', handleKeyboard);

    document.body.appendChild(backdrop);
  }

  /**
   * Downloads an image
   * @param imageUrl - URL of the image to download
   * @param filename - Suggested filename
   */
  private downloadImage(imageUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    logger.debug(`Downloaded image: ${filename}`);
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
