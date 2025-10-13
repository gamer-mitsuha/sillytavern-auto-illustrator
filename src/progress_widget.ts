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
  private closedMessages = new Set<number>(); // Track manually closed messages
  private isWidgetCollapsed = false; // Track widget expansion state
  private expandedMessages = new Set<number>(); // Track which messages are expanded
  private manuallyCollapsedMessages = new Set<number>(); // Track manually collapsed messages
  private updateTimer: number | null = null;
  private readonly THROTTLE_MS = 100; // Max 10 updates per second
  private readonly progressManager: ProgressManager;
  private readonly STORAGE_KEY = 'ai-img-widget-state-v1';

  private loadStateFromStorage(): void {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        isWidgetCollapsed?: boolean;
        manuallyCollapsedMessages?: number[];
      };
      if (typeof data.isWidgetCollapsed === 'boolean') {
        this.isWidgetCollapsed = data.isWidgetCollapsed;
      }
      if (Array.isArray(data.manuallyCollapsedMessages)) {
        // Cap to a reasonable size to avoid unbounded growth
        for (const id of data.manuallyCollapsedMessages.slice(0, 200)) {
          this.manuallyCollapsedMessages.add(id);
        }
      }
    } catch (err) {
      logger.warn('Failed to load widget state from storage', err);
    }
  }

  private saveStateToStorage(): void {
    try {
      const data = {
        isWidgetCollapsed: this.isWidgetCollapsed,
        manuallyCollapsedMessages: Array.from(
          this.manuallyCollapsedMessages
        ).slice(0, 200),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      logger.warn('Failed to save widget state to storage', err);
    }
  }

  /**
   * Initializes the widget and subscribes to ProgressManager events
   */
  constructor(manager: ProgressManager) {
    this.progressManager = manager;
    // Restore persisted UI state (safe to proceed if storage unavailable)
    this.loadStateFromStorage();
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
   * This is when the operation is finished, but widget stays visible until user closes it
   */
  private handleCleared(detail: ProgressClearedEventDetail): void {
    logger.debug(
      `Cleared tracking for message ${detail.messageId} - marking as completed but keeping visible`
    );
    // Don't delete the message data - keep it visible until user manually closes
    // Just schedule an update to change the visual state (spinner -> checkmark)
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

    // Filter out manually closed messages
    const visibleMessages = Array.from(this.messageProgress.entries()).filter(
      ([messageId]) => !this.closedMessages.has(messageId)
    );

    logger.debug(
      `Updating display: ${visibleMessages.length} visible message(s) (${this.closedMessages.size} closed), widget collapsed: ${this.isWidgetCollapsed}`
    );

    // Clear existing content
    widget.innerHTML = '';

    if (visibleMessages.length === 0) {
      // No visible messages - hide widget
      widget.style.display = 'none';
      logger.debug('No visible messages, hiding widget');
      return;
    }

    // Show widget
    widget.style.display = 'flex';

    // Render collapsed or expanded widget
    if (this.isWidgetCollapsed) {
      this.renderCollapsedWidget(widget, visibleMessages);
    } else {
      this.renderExpandedWidget(widget, visibleMessages);
    }

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
      `Updated widget display: ${visibleMessages.length} visible message(s)`
    );
  }

  /**
   * Renders widget in collapsed state (compact single bar)
   */
  private renderCollapsedWidget(
    widget: HTMLElement,
    visibleMessages: Array<[number, MessageProgressState]>
  ): void {
    widget.classList.add('collapsed');
    widget.classList.remove('expanded');

    // Determine overall status
    const allComplete = visibleMessages.every(
      ([, progress]) => progress.current === progress.total
    );

    // Count total images across all messages
    const totalImages = visibleMessages.reduce(
      (sum, [, progress]) => sum + progress.completedImages.length,
      0
    );

    // Create collapsed header (clickable to expand)
    const header = document.createElement('div');
    header.className = 'ai-img-progress-header-collapsed';
    header.addEventListener('click', () => {
      this.isWidgetCollapsed = false;
      this.saveStateToStorage();
      this.scheduleUpdate();
    });

    // Status icon
    const statusIcon = document.createElement('span');
    statusIcon.className = allComplete
      ? 'ai-img-progress-checkmark'
      : 'ai-img-progress-spinner';
    statusIcon.textContent = allComplete ? '✓' : '';
    header.appendChild(statusIcon);

    // Summary text
    const summaryText = document.createElement('span');
    summaryText.className = 'ai-img-progress-summary-text';
    const messageCount = visibleMessages.length;
    summaryText.textContent = allComplete
      ? `${t('progress.summaryComplete', {count: String(messageCount)})} (${t('progress.imageCountTotal', {count: String(totalImages)})})`
      : t('progress.summaryGenerating', {count: String(messageCount)});
    header.appendChild(summaryText);

    // Expand button
    const expandBtn = document.createElement('button');
    expandBtn.className = 'ai-img-progress-expand-toggle';
    expandBtn.innerHTML = '▼';
    expandBtn.title = t('progress.expandWidget');
    header.appendChild(expandBtn);

    widget.appendChild(header);
  }

  /**
   * Renders widget in expanded state (full details)
   */
  private renderExpandedWidget(
    widget: HTMLElement,
    visibleMessages: Array<[number, MessageProgressState]>
  ): void {
    widget.classList.add('expanded');
    widget.classList.remove('collapsed');

    // Determine if all visible messages are complete
    const allComplete = visibleMessages.every(
      ([, progress]) => progress.current === progress.total
    );

    // Add header with spinner/checkmark and title
    const header = document.createElement('div');
    header.className = 'ai-img-progress-header';

    if (allComplete) {
      // All complete - show checkmark
      const checkmark = document.createElement('div');
      checkmark.className = 'ai-img-progress-checkmark';
      checkmark.textContent = '✓';
      header.appendChild(checkmark);
    } else {
      // Still generating - show spinner
      const spinner = document.createElement('div');
      spinner.className = 'ai-img-progress-spinner';
      header.appendChild(spinner);
    }

    const title = document.createElement('div');
    title.className = 'ai-img-progress-title';
    title.textContent = allComplete
      ? t('progress.imagesGenerated')
      : t('progress.generatingImages');
    header.appendChild(title);

    // Add collapse button
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'ai-img-progress-collapse';
    collapseBtn.innerHTML = '▲';
    collapseBtn.title = t('progress.collapseWidget');
    collapseBtn.addEventListener('click', () => {
      this.isWidgetCollapsed = true;
      this.saveStateToStorage();
      this.scheduleUpdate();
    });
    header.appendChild(collapseBtn);

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ai-img-progress-close';
    closeBtn.innerHTML = '×';
    closeBtn.title = t('progress.closeWidget');
    closeBtn.addEventListener('click', () => {
      // Close all visible messages
      for (const [messageId] of visibleMessages) {
        this.closedMessages.add(messageId);
        this.messageProgress.delete(messageId);
      }
      this.scheduleUpdate();
    });
    header.appendChild(closeBtn);

    widget.appendChild(header);

    // Add progress content for each message
    const container = document.createElement('div');
    container.className = 'ai-img-progress-text-container';

    for (const [messageId, progress] of visibleMessages) {
      const isMessageComplete = progress.current === progress.total;
      const isExpanded = this.expandedMessages.has(messageId);
      const hasImages = progress.completedImages.length > 0;
      const manuallyCollapsed = this.manuallyCollapsedMessages.has(messageId);

      // Auto-expand logic:
      // 1. Always expand messages that are generating (not complete)
      // 2. Auto-expand completed messages with images (unless manually collapsed)
      // 3. Respect user's manual collapse/expand actions
      if (!isMessageComplete && !isExpanded) {
        // Auto-expand generating messages
        this.expandedMessages.add(messageId);
      } else if (
        isMessageComplete &&
        hasImages &&
        !isExpanded &&
        !manuallyCollapsed
      ) {
        // Auto-expand completed messages with images (unless user collapsed it)
        this.expandedMessages.add(messageId);
      }

      // Render message (collapsed or expanded)
      if (this.expandedMessages.has(messageId)) {
        const messageElement = this.renderExpandedMessage(messageId, progress);
        container.appendChild(messageElement);
      } else {
        const messageElement = this.renderCompactMessage(messageId, progress);
        container.appendChild(messageElement);
      }
    }

    widget.appendChild(container);
  }

  /**
   * Renders a message in compact state (single line)
   */
  private renderCompactMessage(
    messageId: number,
    progress: MessageProgressState
  ): HTMLElement {
    const messageContainer = document.createElement('div');
    messageContainer.className = 'ai-img-progress-message compact';

    const messageHeader = document.createElement('div');
    messageHeader.className = 'ai-img-progress-message-header';

    // Checkmark for completed
    const checkmark = document.createElement('span');
    checkmark.className = 'message-checkmark';
    checkmark.textContent = '✓';
    messageHeader.appendChild(checkmark);

    // Message label
    const label = document.createElement('span');
    label.className = 'message-label';
    label.textContent = t('progress.message', {messageId: String(messageId)});
    messageHeader.appendChild(label);

    // Summary
    const summary = document.createElement('span');
    summary.className = 'message-summary';
    summary.textContent = `${progress.succeeded} ${t('progress.succeeded')}`;
    if (progress.failed > 0) {
      summary.textContent += `, ${progress.failed} ${t('progress.failed')}`;
    }
    messageHeader.appendChild(summary);

    // Image count
    const imageCount = document.createElement('span');
    imageCount.className = 'message-image-count';
    imageCount.textContent = `(${t('progress.imageCountTotal', {count: String(progress.completedImages.length)})})`;
    messageHeader.appendChild(imageCount);

    // Expand toggle
    const expandToggle = document.createElement('button');
    expandToggle.className = 'ai-img-progress-message-expand-toggle';
    expandToggle.innerHTML = '▼';
    expandToggle.title = t('progress.expandWidget');
    expandToggle.addEventListener('click', () => {
      this.expandedMessages.add(messageId);
      this.manuallyCollapsedMessages.delete(messageId); // Clear manual collapse flag
      this.saveStateToStorage();
      this.scheduleUpdate();
    });
    messageHeader.appendChild(expandToggle);

    // Make entire header clickable to expand
    messageHeader.style.cursor = 'pointer';
    messageHeader.addEventListener('click', e => {
      // Don't trigger if clicking the button directly
      if (e.target !== expandToggle) {
        this.expandedMessages.add(messageId);
        this.manuallyCollapsedMessages.delete(messageId); // Clear manual collapse flag
        this.saveStateToStorage();
        this.scheduleUpdate();
      }
    });

    messageContainer.appendChild(messageHeader);
    return messageContainer;
  }

  /**
   * Renders a message in expanded state (full details)
   */
  private renderExpandedMessage(
    messageId: number,
    progress: MessageProgressState
  ): HTMLElement {
    const messageContainer = document.createElement('div');
    messageContainer.className = 'ai-img-progress-message expanded';

    const messageHeader = document.createElement('div');
    messageHeader.className = 'ai-img-progress-message-header';

    // Message label
    const label = document.createElement('div');
    label.className = 'ai-img-progress-message-label';
    label.textContent = t('progress.message', {messageId: String(messageId)});
    messageHeader.appendChild(label);

    // Collapse toggle (only for completed messages)
    const isComplete = progress.current === progress.total;
    if (isComplete) {
      const collapseToggle = document.createElement('button');
      collapseToggle.className = 'ai-img-progress-message-collapse-toggle';
      collapseToggle.innerHTML = '▲';
      collapseToggle.title = t('progress.collapseWidget');
      collapseToggle.addEventListener('click', () => {
        this.expandedMessages.delete(messageId);
        this.manuallyCollapsedMessages.add(messageId); // Mark as manually collapsed
        this.saveStateToStorage();
        this.scheduleUpdate();
      });
      messageHeader.appendChild(collapseToggle);
    }

    messageContainer.appendChild(messageHeader);

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

    messageContainer.appendChild(badgesContainer);

    // Progress bar (show only if not complete)
    if (!isComplete) {
      const progressPercent =
        progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
      const progressBar = this.createProgressBar(progressPercent);
      messageContainer.appendChild(progressBar);
    }

    // Add thumbnail gallery if there are completed images
    if (progress.completedImages.length > 0) {
      const gallery = this.createThumbnailGallery(
        messageId,
        progress.completedImages
      );
      messageContainer.appendChild(gallery);
    }

    return messageContainer;
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
    const previouslyFocused = (document.activeElement as HTMLElement) || null;

    // Zoom and pan state
    interface ZoomState {
      scale: number;
      translateX: number;
      translateY: number;
      isDragging: boolean;
      dragStartX: number;
      dragStartY: number;
      lastTouchDistance: number;
      lastTapTime: number;
    }

    const zoomState: ZoomState = {
      scale: 1,
      translateX: 0,
      translateY: 0,
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0,
      lastTouchDistance: 0,
      lastTapTime: 0,
    };

    const MIN_ZOOM = 1;
    const MAX_ZOOM = 3;
    const ZOOM_STEP = 0.1;
    const DOUBLE_TAP_DELAY = 300; // ms

    // Helper functions for zoom and pan
    const updateImageTransform = () => {
      const {scale, translateX, translateY} = zoomState;
      img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
      img.style.transformOrigin = '0 0';

      // Update cursor based on zoom state
      if (scale > MIN_ZOOM) {
        img.style.cursor = zoomState.isDragging ? 'grabbing' : 'grab';
        img.classList.add('zoomed');
      } else {
        img.style.cursor = 'zoom-in';
        img.classList.remove('zoomed');
      }

      // Update zoom indicator
      updateZoomIndicator();
    };

    const constrainToBounds = () => {
      if (zoomState.scale <= MIN_ZOOM) {
        zoomState.translateX = 0;
        zoomState.translateY = 0;
        return;
      }

      const containerRect = imageContainer.getBoundingClientRect();

      // Get natural image dimensions
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;

      // Calculate scaled dimensions
      const scaledWidth = naturalWidth * zoomState.scale;
      const scaledHeight = naturalHeight * zoomState.scale;

      // Calculate maximum allowed translation
      const maxX = Math.max(0, (scaledWidth - containerRect.width) / 2);
      const maxY = Math.max(0, (scaledHeight - containerRect.height) / 2);

      // Clamp translation
      zoomState.translateX = Math.max(
        -maxX,
        Math.min(maxX, zoomState.translateX)
      );
      zoomState.translateY = Math.max(
        -maxY,
        Math.min(maxY, zoomState.translateY)
      );
    };

    const resetZoom = () => {
      zoomState.scale = MIN_ZOOM;
      zoomState.translateX = 0;
      zoomState.translateY = 0;
      updateImageTransform();
    };

    const zoomTo = (newScale: number, centerX?: number, centerY?: number) => {
      const oldScale = zoomState.scale;
      newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));

      if (centerX !== undefined && centerY !== undefined) {
        // Zoom toward specific point
        const rect = img.getBoundingClientRect();
        const offsetX = centerX - rect.left;
        const offsetY = centerY - rect.top;

        // Adjust translation to zoom toward the point
        zoomState.translateX -= offsetX * (newScale / oldScale - 1);
        zoomState.translateY -= offsetY * (newScale / oldScale - 1);
      }

      zoomState.scale = newScale;
      constrainToBounds();
      updateImageTransform();
    };

    // Create zoom indicator
    const zoomIndicator = document.createElement('div');
    zoomIndicator.className = 'ai-img-zoom-indicator';
    zoomIndicator.style.display = 'none';
    let zoomIndicatorTimeout: number | null = null;

    const updateZoomIndicator = () => {
      if (zoomState.scale === MIN_ZOOM) {
        zoomIndicator.style.display = 'none';
        return;
      }

      const zoomPercent = Math.round(zoomState.scale * 100);
      zoomIndicator.textContent = `${zoomPercent}%`;
      zoomIndicator.style.display = 'block';

      // Auto-hide after 1 second
      if (zoomIndicatorTimeout !== null) {
        clearTimeout(zoomIndicatorTimeout);
      }
      zoomIndicatorTimeout = window.setTimeout(() => {
        zoomIndicator.style.display = 'none';
      }, 1000);
    };

    const getTouchDistance = (touch1: Touch, touch2: Touch): number => {
      const dx = touch2.clientX - touch1.clientX;
      const dy = touch2.clientY - touch1.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'ai-img-modal-backdrop';
    // Lock background scroll when modal opens
    document.body.classList.add('ai-img-modal-open');

    // Create modal container
    const container = document.createElement('div');
    container.className = 'ai-img-modal-container';
    // Accessibility roles
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-modal', 'true');
    container.setAttribute('aria-label', 'Image viewer');
    container.tabIndex = -1;

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
    prevBtn.setAttribute('aria-label', t('modal.previous'));
    content.appendChild(prevBtn);

    // Image container
    const imageContainer = document.createElement('div');
    imageContainer.className = 'ai-img-modal-image-container';

    const img = document.createElement('img');
    img.className = 'ai-img-modal-image';
    imageContainer.appendChild(img);
    imageContainer.appendChild(zoomIndicator);

    content.appendChild(imageContainer);

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'ai-img-modal-nav next';
    nextBtn.innerHTML = '▶';
    nextBtn.title = t('modal.next');
    nextBtn.setAttribute('aria-label', t('modal.next'));
    content.appendChild(nextBtn);

    container.appendChild(content);

    // Info bar
    const info = document.createElement('div');
    info.className = 'ai-img-modal-info';
    info.setAttribute('role', 'region');
    info.setAttribute('aria-live', 'polite');

    const meta = document.createElement('div');
    meta.className = 'ai-img-modal-meta';
    info.appendChild(meta);

    const promptDiv = document.createElement('div');
    promptDiv.className = 'ai-img-modal-prompt';
    info.appendChild(promptDiv);

    container.appendChild(info);

    backdrop.appendChild(container);

    // Navigation state and preload helpers
    const updateNavButtons = () => {
      const total = progress.completedImages.length;
      prevBtn.disabled = total === 0 || currentIndex <= 0;
      nextBtn.disabled = total === 0 || currentIndex >= total - 1;
    };
    const preloadImage = (index: number) => {
      if (index < 0 || index >= progress.completedImages.length) return;
      const src = progress.completedImages[index].imageUrl;
      const pre = new Image();
      pre.src = src;
    };

    // Update display function
    const updateDisplay = () => {
      const currentImage = progress.completedImages[currentIndex];
      img.src = currentImage.imageUrl;
      img.alt = currentImage.promptPreview;

      // Reset zoom when changing images
      resetZoom();

      // Update metadata
      meta.innerHTML = `
        <div class="ai-img-modal-meta-item">
          <span class="ai-img-modal-meta-label">${t('progress.imageIndex', {current: String(currentIndex + 1), total: String(progress.completedImages.length)})}</span>
        </div>
        <div class="ai-img-modal-actions">
          <button class="ai-img-modal-action-btn reset-zoom-btn" title="${t('modal.resetZoom')}" style="display: none;">
            ↺ ${t('modal.resetZoom')}
          </button>
          <button class="ai-img-modal-action-btn open-tab-btn" title="${t('modal.openInNewTab')}">
            🔗 ${t('modal.openInNewTab')}
          </button>
          <button class="ai-img-modal-action-btn download-btn" title="${t('modal.download')}">
            💾 ${t('modal.download')}
          </button>
        </div>
      `;

      promptDiv.textContent = currentImage.promptText;

      // Update nav state and preload neighbors
      updateNavButtons();
      preloadImage(currentIndex - 1);
      preloadImage(currentIndex + 1);

      // Re-attach action button handlers
      const resetZoomBtn = meta.querySelector(
        '.reset-zoom-btn'
      ) as HTMLButtonElement;
      const downloadBtn = meta.querySelector('.download-btn');
      const openTabBtn = meta.querySelector('.open-tab-btn');

      // Show/hide reset button based on zoom state
      const updateResetButton = () => {
        if (resetZoomBtn) {
          resetZoomBtn.style.display =
            zoomState.scale > MIN_ZOOM ? 'flex' : 'none';
        }
      };
      updateResetButton();

      resetZoomBtn?.addEventListener('click', () => {
        resetZoom();
        updateResetButton();
      });

      downloadBtn?.addEventListener('click', () => {
        this.downloadImage(
          currentImage.imageUrl,
          `image-${currentIndex + 1}.png`
        );
      });

      openTabBtn?.addEventListener('click', () => {
        try {
          window.open(currentImage.imageUrl, '_blank', 'noopener,noreferrer');
        } catch (e) {
          logger.warn('Failed to open image in new tab', e);
        }
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
        updateDisplay(); // This now resets zoom internally
      }
    });

    nextBtn.addEventListener('click', () => {
      if (currentIndex < progress.completedImages.length - 1) {
        currentIndex++;
        updateDisplay(); // This now resets zoom internally
      }
    });

    // Desktop: Mouse wheel zoom
    imageContainer.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const newScale = zoomState.scale + delta;
      zoomTo(newScale, e.clientX, e.clientY);
    });

    // Desktop: Click-and-drag panning
    imageContainer.addEventListener('mousedown', (e: MouseEvent) => {
      if (zoomState.scale <= MIN_ZOOM) return;

      e.preventDefault(); // Prevent default drag behavior
      e.stopPropagation(); // Stop event from bubbling to ST's drop handlers
      zoomState.isDragging = true;
      zoomState.dragStartX = e.clientX - zoomState.translateX;
      zoomState.dragStartY = e.clientY - zoomState.translateY;
      updateImageTransform();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!zoomState.isDragging) return;

      zoomState.translateX = e.clientX - zoomState.dragStartX;
      zoomState.translateY = e.clientY - zoomState.dragStartY;
      constrainToBounds();
      updateImageTransform();
    });

    document.addEventListener('mouseup', () => {
      if (zoomState.isDragging) {
        zoomState.isDragging = false;
        updateImageTransform();
      }
    });

    // Prevent native drag behavior on image (interferes with panning and ST's char card drop)
    img.addEventListener('dragstart', (e: DragEvent) => {
      e.preventDefault();
    });

    // Desktop: Double-click to zoom
    imageContainer.addEventListener('dblclick', (e: MouseEvent) => {
      e.preventDefault();
      if (zoomState.scale > MIN_ZOOM) {
        resetZoom();
      } else {
        zoomTo(2, e.clientX, e.clientY);
      }
    });

    // Ensure bounds after image load (natural size is ready)
    img.addEventListener('load', () => {
      constrainToBounds();
      updateImageTransform();
    });

    // Keep image within bounds on viewport resize/orientation
    const handleResize = () => {
      constrainToBounds();
      updateImageTransform();
      updateNavButtons();
    };
    window.addEventListener('resize', handleResize);

    // Mobile: Touch gesture support
    let touchStartTime = 0;
    let initialTouches: Touch[] = [];
    let lastPanX = 0;
    let lastPanY = 0;

    imageContainer.addEventListener('touchstart', (e: TouchEvent) => {
      touchStartTime = Date.now();
      initialTouches = Array.from(e.touches);

      if (e.touches.length === 1) {
        // Single touch - prepare for pan or swipe
        const touch = e.touches[0];
        lastPanX = touch.clientX;
        lastPanY = touch.clientY;
      } else if (e.touches.length === 2) {
        // Two touches - pinch zoom
        const dist = getTouchDistance(e.touches[0], e.touches[1]);
        zoomState.lastTouchDistance = dist;
      }
    });

    imageContainer.addEventListener('touchmove', (e: TouchEvent) => {
      if (e.touches.length === 1 && zoomState.scale > MIN_ZOOM) {
        // Single touch pan when zoomed
        e.preventDefault();
        const touch = e.touches[0];
        const deltaX = touch.clientX - lastPanX;
        const deltaY = touch.clientY - lastPanY;

        zoomState.translateX += deltaX;
        zoomState.translateY += deltaY;
        constrainToBounds();
        updateImageTransform();

        lastPanX = touch.clientX;
        lastPanY = touch.clientY;
      } else if (e.touches.length === 2) {
        // Pinch to zoom
        e.preventDefault();
        const dist = getTouchDistance(e.touches[0], e.touches[1]);
        const scale = (dist / zoomState.lastTouchDistance) * zoomState.scale;

        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

        zoomTo(scale, centerX, centerY);
        zoomState.lastTouchDistance = dist;
      }
    });

    imageContainer.addEventListener('touchend', (e: TouchEvent) => {
      if (e.touches.length === 0) {
        // All touches ended
        const touchDuration = Date.now() - touchStartTime;

        // Check for horizontal swipe navigation (only when not zoomed)
        if (
          zoomState.scale <= MIN_ZOOM &&
          initialTouches.length === 1 &&
          touchDuration < 500
        ) {
          const touch = e.changedTouches[0];
          const startX = initialTouches[0].clientX;
          const endX = touch.clientX;
          const swipeDistance = endX - startX;
          const minSwipeDistance = 50;

          // Swipe left (next image)
          if (
            swipeDistance < -minSwipeDistance &&
            currentIndex < progress.completedImages.length - 1
          ) {
            nextBtn.click();
          }
          // Swipe right (previous image)
          else if (swipeDistance > minSwipeDistance && currentIndex > 0) {
            prevBtn.click();
          }
        }

        // Check for double tap
        const now = Date.now();
        if (now - zoomState.lastTapTime < DOUBLE_TAP_DELAY) {
          const touch = e.changedTouches[0];
          if (zoomState.scale > MIN_ZOOM) {
            resetZoom();
          } else {
            zoomTo(2, touch.clientX, touch.clientY);
          }
        }
        zoomState.lastTapTime = now;
      }
    });

    // Focus trap inside dialog
    const getFocusable = (): HTMLElement[] => {
      return Array.from(
        container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1);
    };
    const focusTrapHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          last.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    container.addEventListener('keydown', focusTrapHandler);

    // Close handlers
    const closeModal = () => {
      backdrop.remove();
      document.removeEventListener('keydown', handleKeyboard);
      this.progressManager.removeEventListener(
        'progress:image-completed',
        handleImageCompleted
      );
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('keydown', focusTrapHandler);
      document.body.classList.remove('ai-img-modal-open');
      // Restore focus to previously focused element
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
      logger.debug('Image modal closed');
    };

    closeBtn.addEventListener('click', closeModal);

    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) {
        closeModal();
      }
    });

    // Keyboard navigation and zoom
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
        case '+':
        case '=':
          // Zoom in
          zoomTo(zoomState.scale + ZOOM_STEP);
          break;
        case '-':
          // Zoom out
          zoomTo(zoomState.scale - ZOOM_STEP);
          break;
        case '0':
          // Reset zoom
          resetZoom();
          break;
      }
    };
    document.addEventListener('keydown', handleKeyboard);

    document.body.appendChild(backdrop);
    // Move focus into dialog shortly after insertion
    setTimeout(() => {
      try {
        closeBtn.focus();
      } catch (e) {
        /* ignore focus errors */
      }
    }, 0);
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
    widget.setAttribute('role', 'status');
    widget.setAttribute('aria-live', 'polite');

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
