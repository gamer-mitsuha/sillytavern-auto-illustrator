/**
 * Progress Widget Module
 * Manages a global loading indicator for image generation
 * Shows progress for all messages in a fixed position above the user input area
 *
 * Architecture: View layer that subscribes to ProgressManager events
 * - Listens to progress:started, progress:updated, progress:cancelled
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
  ProgressCancelledEventDetail,
} from './progress_manager';

const logger = createLogger('ProgressWidget');

// State tracking progress for each message
interface MessageProgressState {
  current: number;
  total: number;
  succeeded: number;
  failed: number;
  startTime: number;
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

    manager.addEventListener('progress:cancelled', event => {
      const detail = (event as CustomEvent<ProgressCancelledEventDetail>)
        .detail;
      this.handleCancelled(detail);
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
    });
    this.scheduleUpdate();
  }

  /**
   * Handles progress:cancelled event
   */
  private handleCancelled(detail: ProgressCancelledEventDetail): void {
    logger.debug(`Cancelled tracking message ${detail.messageId}`);
    this.messageProgress.delete(detail.messageId);
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
