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
import {openImageModal, type ModalImage} from './modal_viewer';
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
   * Clears all widget state (called when chat changes)
   * This removes all message progress and hides the widget
   */
  public clearState(): void {
    logger.info('Clearing progress widget state (chat changed)');
    this.messageProgress.clear();
    this.closedMessages.clear();
    this.expandedMessages.clear();
    // Don't clear manuallyCollapsedMessages - that's a UI preference
    // Don't clear isWidgetCollapsed - that's also a UI preference
    this.scheduleUpdate();
  }

  /**
   * Handles progress:started event
   */
  private handleStarted(detail: ProgressStartedEventDetail): void {
    logger.debug(`Started tracking message ${detail.messageId}`);

    // Remove from closed messages to ensure widget reappears
    if (this.closedMessages.has(detail.messageId)) {
      logger.debug(
        `Removing message ${detail.messageId} from closed messages - widget will reappear`
      );
      this.closedMessages.delete(detail.messageId);
    }

    // Check if this is a regeneration (message already exists)
    const existing = this.messageProgress.get(detail.messageId);
    if (existing) {
      logger.debug(
        `Message ${detail.messageId} already exists - clearing old images for regeneration`
      );
      // Clear completed images for regeneration
      existing.completedImages = [];
      // Reset counts for new generation
      existing.current = 0;
      existing.total = detail.total;
      existing.succeeded = 0;
      existing.failed = 0;
      existing.startTime = Date.now();
    } else {
      // New message
      this.messageProgress.set(detail.messageId, {
        current: 0,
        total: detail.total,
        succeeded: 0,
        failed: 0,
        startTime: Date.now(),
        completedImages: [],
      });
    }

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
   * Immediately updates the display, bypassing throttle
   * Used for user-triggered actions that need immediate feedback
   */
  private updateImmediately(): void {
    // Cancel any pending throttled update
    if (this.updateTimer !== null) {
      window.clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    // Execute update right away
    this.updateDisplay();
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

    // Save scroll positions before update
    const scrollPositions = this.saveScrollPositions(widget);

    if (visibleMessages.length === 0) {
      // No visible messages - hide widget
      widget.style.display = 'none';
      widget.innerHTML = ''; // Only clear when actually hiding
      logger.debug('No visible messages, hiding widget');
      return;
    }

    // Show widget
    widget.style.display = 'flex';

    // Check if we need a full rebuild (collapse state changed or first render)
    const currentCollapseState = widget.classList.contains('collapsed');
    const needsFullRebuild =
      currentCollapseState !== this.isWidgetCollapsed ||
      widget.children.length === 0;

    if (needsFullRebuild) {
      // Full rebuild needed
      widget.innerHTML = '';
      if (this.isWidgetCollapsed) {
        this.renderCollapsedWidget(widget, visibleMessages);
      } else {
        this.renderExpandedWidget(widget, visibleMessages);
      }
    } else {
      // Smart update - update existing elements
      if (this.isWidgetCollapsed) {
        this.updateCollapsedWidget(widget, visibleMessages);
      } else {
        this.updateExpandedWidget(widget, visibleMessages);
      }
    }

    // Restore scroll positions after update
    this.restoreScrollPositions(widget, scrollPositions);

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
   * Save scroll positions of all thumbnail containers
   */
  private saveScrollPositions(widget: HTMLElement): Map<string, number> {
    const positions = new Map<string, number>();
    const thumbnailContainers = widget.querySelectorAll(
      '.ai-img-progress-thumbnails'
    );

    thumbnailContainers.forEach((container, index) => {
      if (container instanceof HTMLElement) {
        const key = `thumbnails-${index}`;
        positions.set(key, container.scrollLeft);
      }
    });

    return positions;
  }

  /**
   * Restore scroll positions of all thumbnail containers
   */
  private restoreScrollPositions(
    widget: HTMLElement,
    positions: Map<string, number>
  ): void {
    const thumbnailContainers = widget.querySelectorAll(
      '.ai-img-progress-thumbnails'
    );

    thumbnailContainers.forEach((container, index) => {
      if (container instanceof HTMLElement) {
        const key = `thumbnails-${index}`;
        const savedPosition = positions.get(key);
        if (savedPosition !== undefined) {
          container.scrollLeft = savedPosition;
        }
      }
    });
  }

  /**
   * Update collapsed widget without full rebuild
   */
  private updateCollapsedWidget(
    widget: HTMLElement,
    visibleMessages: Array<[number, MessageProgressState]>
  ): void {
    // Find existing FAB
    const fab = widget.querySelector('.ai-img-progress-fab');
    if (!fab) {
      // Fallback to full render if structure is missing
      this.renderCollapsedWidget(widget, visibleMessages);
      return;
    }

    // Update status
    const allComplete = visibleMessages.every(
      ([, progress]) => progress.current === progress.total
    );
    const totalImages = visibleMessages.reduce(
      (sum, [, progress]) => sum + progress.completedImages.length,
      0
    );

    // Update title
    fab.setAttribute(
      'title',
      allComplete
        ? t('progress.summaryComplete', {
            count: String(visibleMessages.length),
          })
        : t('progress.summaryGenerating', {
            count: String(visibleMessages.length),
          })
    );

    // Update icon (spinner or checkmark)
    const spinner = fab.querySelector('.ai-img-progress-fab-spinner');
    const checkIcon = fab.querySelector('span:not(.ai-img-progress-fab-badge)');

    if (allComplete) {
      // Remove spinner, add checkmark
      if (spinner) spinner.remove();
      if (!checkIcon) {
        const check = document.createElement('span');
        check.textContent = '✓';
        fab.insertBefore(check, fab.firstChild);
      }
    } else {
      // Remove checkmark, add spinner
      if (checkIcon && checkIcon.textContent === '✓') checkIcon.remove();
      if (!spinner) {
        const spin = document.createElement('div');
        spin.className = 'ai-img-progress-fab-spinner';
        fab.insertBefore(spin, fab.firstChild);
      }
    }

    // Update badge
    const badge = fab.querySelector('.ai-img-progress-fab-badge');
    if (totalImages > 0) {
      if (badge) {
        badge.textContent = String(totalImages);
      } else {
        const newBadge = document.createElement('span');
        newBadge.className = 'ai-img-progress-fab-badge';
        newBadge.textContent = String(totalImages);
        fab.appendChild(newBadge);
      }
    } else if (badge) {
      badge.remove();
    }
  }

  /**
   * Update expanded widget without full rebuild
   */
  private updateExpandedWidget(
    widget: HTMLElement,
    visibleMessages: Array<[number, MessageProgressState]>
  ): void {
    // Find existing elements
    const header = widget.querySelector('.ai-img-progress-header');
    const container = widget.querySelector('.ai-img-progress-text-container');

    if (!header || !container) {
      // Fallback to full render if structure is missing
      this.renderExpandedWidget(widget, visibleMessages);
      return;
    }

    // Update header status
    const allComplete = visibleMessages.every(
      ([, progress]) => progress.current === progress.total
    );

    // Update spinner/checkmark
    const statusElement = header.querySelector(
      '.ai-img-progress-spinner, .ai-img-progress-checkmark'
    );
    if (statusElement) {
      if (allComplete) {
        statusElement.className = 'ai-img-progress-checkmark';
        statusElement.textContent = '✓';
      } else {
        statusElement.className = 'ai-img-progress-spinner';
        statusElement.textContent = '';
      }
    }

    // Update title
    const title = header.querySelector('.ai-img-progress-title');
    if (title) {
      title.textContent = allComplete
        ? t('progress.imagesGenerated')
        : t('progress.generatingImages');
    }

    // Update message containers
    this.updateMessageContainers(container as HTMLElement, visibleMessages);
  }

  /**
   * Update individual message containers
   */
  private updateMessageContainers(
    container: HTMLElement,
    visibleMessages: Array<[number, MessageProgressState]>
  ): void {
    // Create a map of existing message elements
    const existingMessages = new Map<number, HTMLElement>();
    container.querySelectorAll('.ai-img-progress-message').forEach(elem => {
      const messageId = elem.getAttribute('data-message-id');
      if (messageId) {
        existingMessages.set(parseInt(messageId, 10), elem as HTMLElement);
      }
    });

    const visibleMessageIds = new Set(
      visibleMessages.map(([messageId]) => messageId)
    );

    // Remove messages that no longer exist
    for (const [messageId, element] of existingMessages.entries()) {
      if (!visibleMessageIds.has(messageId)) {
        element.remove();
        existingMessages.delete(messageId);
      }
    }

    // Update or create each message in order
    let previousElement: HTMLElement | null = null;
    for (const [messageId, progress] of visibleMessages) {
      // Default to expanded for new messages, then let user control manually
      if (
        !this.expandedMessages.has(messageId) &&
        !this.manuallyCollapsedMessages.has(messageId)
      ) {
        // First time seeing this message - expand by default
        this.expandedMessages.add(messageId);
      }

      const shouldBeExpanded = this.expandedMessages.has(messageId);
      let messageElement = existingMessages.get(messageId);

      if (!messageElement) {
        // Element doesn't exist - create it
        if (shouldBeExpanded) {
          messageElement = this.renderExpandedMessage(messageId, progress);
        } else {
          messageElement = this.renderCompactMessage(messageId, progress);
        }

        // Add data attribute for tracking
        messageElement.setAttribute('data-message-id', String(messageId));

        // Insert in correct position
        if (previousElement) {
          previousElement.after(messageElement);
        } else {
          container.prepend(messageElement);
        }
      } else {
        // Element exists - check if expansion state changed
        const currentlyExpanded = messageElement.classList.contains('expanded');

        if (currentlyExpanded !== shouldBeExpanded) {
          // Expansion state changed - need to recreate
          messageElement.remove();

          if (shouldBeExpanded) {
            messageElement = this.renderExpandedMessage(messageId, progress);
          } else {
            messageElement = this.renderCompactMessage(messageId, progress);
          }

          messageElement.setAttribute('data-message-id', String(messageId));

          // Insert in correct position
          if (previousElement) {
            previousElement.after(messageElement);
          } else {
            container.prepend(messageElement);
          }
        } else {
          // Same state - just update content
          if (shouldBeExpanded) {
            this.updateExpandedMessage(messageElement, messageId, progress);
          } else {
            this.updateCompactMessage(messageElement, messageId, progress);
          }

          // Ensure element is in correct position
          if (previousElement) {
            if (previousElement.nextElementSibling !== messageElement) {
              previousElement.after(messageElement);
            }
          } else {
            if (container.firstElementChild !== messageElement) {
              container.prepend(messageElement);
            }
          }
        }
      }

      previousElement = messageElement;
    }
  }

  /**
   * Update an existing expanded message element
   */
  private updateExpandedMessage(
    element: HTMLElement,
    messageId: number,
    progress: MessageProgressState
  ): void {
    const isComplete = progress.current === progress.total;

    // Update status badges
    const badgesContainer = element.querySelector(
      '.ai-img-progress-status-badges'
    );
    if (badgesContainer) {
      badgesContainer.innerHTML = '';

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
    }

    // Update progress bar
    const progressBar = element.querySelector('.ai-img-progress-bar');
    if (progressBar instanceof HTMLElement) {
      if (isComplete) {
        // Remove progress bar container
        progressBar.parentElement?.remove();
      } else {
        const progressPercent =
          progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
        progressBar.style.width = `${Math.min(100, Math.max(0, progressPercent))}%`;
      }
    }

    // Update thumbnail gallery if needed
    let gallery = element.querySelector('.ai-img-progress-gallery');
    if (progress.completedImages.length > 0) {
      if (!gallery) {
        // Need to create gallery
        gallery = this.createThumbnailGallery(
          messageId,
          progress.completedImages
        );
        element.appendChild(gallery);
      } else {
        // Update existing gallery
        this.updateThumbnailGallery(
          gallery as HTMLElement,
          messageId,
          progress.completedImages
        );
      }
    } else if (gallery) {
      // No images, but gallery exists - remove it (e.g., during regeneration)
      gallery.remove();
    }
  }

  /**
   * Update an existing compact message element
   */
  private updateCompactMessage(
    element: HTMLElement,
    _messageId: number,
    progress: MessageProgressState
  ): void {
    const header = element.querySelector('.ai-img-progress-message-header');
    if (!header) return;

    // Update summary
    const summary = header.querySelector('.message-summary');
    if (summary) {
      summary.textContent = `${progress.succeeded} ${t('progress.succeeded')}`;
      if (progress.failed > 0) {
        summary.textContent += `, ${progress.failed} ${t('progress.failed')}`;
      }
    }

    // Update image count
    const imageCount = header.querySelector('.message-image-count');
    if (imageCount) {
      imageCount.textContent = `(${t('progress.imageCountTotal', {count: String(progress.completedImages.length)})})`;
    }
  }

  /**
   * Update an existing thumbnail gallery
   */
  private updateThumbnailGallery(
    gallery: HTMLElement,
    messageId: number,
    images: CompletedImage[]
  ): void {
    const thumbnailsContainer = gallery.querySelector(
      '.ai-img-progress-thumbnails'
    );
    if (!thumbnailsContainer) return;

    // Get current thumbnails
    const existingThumbnails = thumbnailsContainer.querySelectorAll(
      '.ai-img-progress-thumbnail'
    );
    const existingCount = existingThumbnails.length;
    const newCount = images.length;

    // If we have fewer images than before (e.g., regeneration), clear and rebuild
    if (newCount < existingCount) {
      // Clear all thumbnails
      thumbnailsContainer.innerHTML = '';
      // Rebuild from scratch with new images
      for (let i = 0; i < newCount; i++) {
        const image = images[i];
        const thumbnail = document.createElement('div');
        thumbnail.className = 'ai-img-progress-thumbnail';
        thumbnail.title = image.promptText;

        // Add index badge
        const indexBadge = document.createElement('div');
        indexBadge.className = 'ai-img-progress-thumbnail-index';
        indexBadge.textContent = t('progress.imageIndex', {
          current: String(i + 1),
          total: String(newCount),
        });
        thumbnail.appendChild(indexBadge);

        // Create img element
        const img = document.createElement('img');
        img.src = image.imageUrl;
        img.alt = image.promptPreview;
        img.loading = 'lazy';
        thumbnail.appendChild(img);

        // Add click handler
        thumbnail.addEventListener('click', () => {
          this.showImageModal(messageId, i);
        });

        thumbnailsContainer.appendChild(thumbnail);
      }
    } else if (newCount > existingCount) {
      // Only add new thumbnails (don't recreate existing ones)
      for (let i = existingCount; i < newCount; i++) {
        const image = images[i];
        const thumbnail = document.createElement('div');
        thumbnail.className = 'ai-img-progress-thumbnail';
        thumbnail.title = image.promptText;

        // Add index badge
        const indexBadge = document.createElement('div');
        indexBadge.className = 'ai-img-progress-thumbnail-index';
        indexBadge.textContent = t('progress.imageIndex', {
          current: String(i + 1),
          total: String(newCount),
        });
        thumbnail.appendChild(indexBadge);

        // Create img element
        const img = document.createElement('img');
        img.src = image.imageUrl;
        img.alt = image.promptPreview;
        img.loading = 'lazy';
        thumbnail.appendChild(img);

        // Add click handler
        thumbnail.addEventListener('click', () => {
          this.showImageModal(messageId, i);
        });

        thumbnailsContainer.appendChild(thumbnail);
      }

      // Update indices on all thumbnails
      thumbnailsContainer
        .querySelectorAll('.ai-img-progress-thumbnail')
        .forEach((thumb, index) => {
          const indexBadge = thumb.querySelector(
            '.ai-img-progress-thumbnail-index'
          );
          if (indexBadge) {
            indexBadge.textContent = t('progress.imageIndex', {
              current: String(index + 1),
              total: String(newCount),
            });
          }
        });
    }
    // If newCount === existingCount, we assume images are the same and don't update
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

    // Create FAB button
    const fab = document.createElement('button');
    fab.className = 'ai-img-progress-fab';
    fab.title = allComplete
      ? t('progress.summaryComplete', {
          count: String(visibleMessages.length),
        })
      : t('progress.summaryGenerating', {
          count: String(visibleMessages.length),
        });
    fab.addEventListener('click', () => {
      this.isWidgetCollapsed = false;
      this.saveStateToStorage();
      this.updateImmediately();
    });

    // Add status icon (spinner or checkmark)
    if (allComplete) {
      const checkIcon = document.createElement('span');
      checkIcon.textContent = '✓';
      fab.appendChild(checkIcon);
    } else {
      const spinner = document.createElement('div');
      spinner.className = 'ai-img-progress-fab-spinner';
      fab.appendChild(spinner);
    }

    // Add badge showing image count
    if (totalImages > 0) {
      const badge = document.createElement('span');
      badge.className = 'ai-img-progress-fab-badge';
      badge.textContent = String(totalImages);
      fab.appendChild(badge);
    }

    widget.appendChild(fab);
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
      this.updateImmediately();
    });
    header.appendChild(collapseBtn);

    // Add close button (×)
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ai-img-progress-close';
    closeBtn.innerHTML = '×';
    closeBtn.title = t('progress.closeWidget');
    closeBtn.addEventListener('click', () => {
      // Close all visible messages
      for (const [messageId] of visibleMessages) {
        this.closedMessages.add(messageId);
      }
      this.updateImmediately();
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
        messageElement.setAttribute('data-message-id', String(messageId));
        container.appendChild(messageElement);
      } else {
        const messageElement = this.renderCompactMessage(messageId, progress);
        messageElement.setAttribute('data-message-id', String(messageId));
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
      this.updateImmediately();
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
        this.updateImmediately();
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
        this.updateImmediately();
      });
      messageHeader.appendChild(collapseToggle);
    }

    // Add close button (×) for completed messages
    if (isComplete) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'ai-img-progress-message-close';
      closeBtn.innerHTML = '×';
      closeBtn.title = t('progress.closeWidget');
      closeBtn.addEventListener('click', () => {
        this.closedMessages.add(messageId);
        this.updateImmediately();
      });
      messageHeader.appendChild(closeBtn);
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
   * Uses the shared ImageModalViewer for consistent UX across widgets
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

    // Open the shared modal viewer
    const modal = openImageModal({
      images: progress.completedImages as ModalImage[],
      initialIndex: initialIndex,
      title: t('progress.imageIndex', {
        current: String(initialIndex + 1),
        total: String(progress.completedImages.length),
      }),
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
        // Update the modal with new images array
        // Note: progress.completedImages is updated by handleImageCompleted()
        modal.updateImages(progress.completedImages as ModalImage[]);
      }
    }) as EventListener;

    this.progressManager.addEventListener(
      'progress:image-completed',
      handleImageCompleted
    );

    // Clean up event listener when modal closes
    // Note: The modal viewer handles its own cleanup internally,
    // we just need to remove our progress event listener
    const originalOnClose = modal['onClose'];
    modal['onClose'] = () => {
      this.progressManager.removeEventListener(
        'progress:image-completed',
        handleImageCompleted
      );
      if (originalOnClose) {
        originalOnClose();
      }
    };
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

/**
 * Clears the progress widget state (called when chat changes)
 * Removes all message progress and hides the widget
 */
export function clearProgressWidgetState(): void {
  if (!widgetInstance) {
    logger.debug('No widget instance to clear');
    return;
  }

  widgetInstance.clearState();
}
