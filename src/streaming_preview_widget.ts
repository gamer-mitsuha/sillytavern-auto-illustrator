/**
 * Streaming Preview Widget Module
 * Displays streaming text with inline images for an immersive experience
 *
 * Architecture: Independent widget that doesn't modify existing features
 * - Shows streaming text in real-time
 * - Inserts images inline at their detected positions
 * - Remains visible until manually dismissed by user
 * - Works alongside existing progress and gallery widgets
 */

import {createLogger} from './logger';
import {t} from './i18n';
import {openImageModal, type ModalImage} from './modal_viewer';
import type {
  ProgressManager,
  ProgressImageCompletedEventDetail,
} from './progress_manager';
import {extractImagePromptsMultiPattern} from './regex';

const logger = createLogger('StreamingPreviewWidget');

/**
 * Represents a text segment between images
 */
interface TextSegment {
  type: 'text';
  content: string;
  startIndex?: number; // Position in original text where this segment starts
  endIndex?: number; // Position in original text where this segment ends
}

/**
 * Represents an image placeholder or completed image
 */
interface ImageSegment {
  type: 'image';
  promptIndex: number;
  prompt: string;
  imageUrl?: string;
  status: 'detected' | 'generating' | 'completed' | 'failed';
  error?: string;
  startIndex?: number; // Position in original text where prompt starts
  endIndex?: number; // Position in original text where prompt ends
}

type ContentSegment = TextSegment | ImageSegment;

/**
 * Streaming Preview Widget - Shows text and inline images during streaming
 */
export class StreamingPreviewWidget {
  private readonly progressManager: ProgressManager;
  private readonly STORAGE_KEY = 'ai-streaming-preview-state-v1';
  private isMinimized = false;
  private isVisible = false;
  private currentMessageId = -1;
  private lastSeenText = '';
  private contentSegments: ContentSegment[] = [];
  private widget: HTMLElement | null = null;
  private promptDetectionPatterns: string[] = [];
  private autoScrollEnabled = true;
  private scrollCheckTimeout: number | null = null;
  private isUserScrolling = false;
  private lastScrollTop = 0;

  // Smooth streaming buffer
  private textBuffer = ''; // Target text to display
  private displayedText = ''; // Currently displayed text
  private streamingInterval: number | null = null;
  private readonly CHARS_PER_FRAME = 3; // Characters to add per animation frame
  private readonly FRAME_DELAY = 30; // Milliseconds between frames (33fps)

  /**
   * Initialize the streaming preview widget
   * @param manager - Progress manager for image completion events
   * @param promptPatterns - Regex patterns for detecting image prompts
   */
  constructor(manager: ProgressManager, promptPatterns: string[] = []) {
    this.progressManager = manager;
    this.promptDetectionPatterns = promptPatterns;
    this.loadStateFromStorage();

    // Subscribe to image completion events
    manager.addEventListener('progress:image-completed', event => {
      const detail = (event as CustomEvent<ProgressImageCompletedEventDetail>)
        .detail;
      this.handleImageCompleted(detail);
    });

    logger.debug(
      'StreamingPreviewWidget initialized and subscribed to image completion events'
    );
  }

  /**
   * Load widget state from localStorage
   */
  private loadStateFromStorage(): void {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {isMinimized?: boolean};
      if (typeof data.isMinimized === 'boolean') {
        this.isMinimized = data.isMinimized;
      }
    } catch (err) {
      logger.warn('Failed to load streaming preview state from storage', err);
    }
  }

  /**
   * Save widget state to localStorage
   */
  private saveStateToStorage(): void {
    try {
      const data = {isMinimized: this.isMinimized};
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      logger.warn('Failed to save streaming preview state to storage', err);
    }
  }

  /**
   * Start showing the widget for a streaming message
   * @param messageId - Index of the message being streamed
   */
  start(messageId: number): void {
    logger.debug(`Starting streaming preview for message ${messageId}`);
    this.currentMessageId = messageId;
    this.lastSeenText = '';
    this.contentSegments = [];
    this.textBuffer = '';
    this.displayedText = '';
    this.stopSmoothStreaming(); // Stop any existing animation
    this.isVisible = true;
    this.autoScrollEnabled = true; // Reset auto-scroll for new message
    this.isUserScrolling = false; // Reset user scroll detection
    this.lastScrollTop = 0; // Reset scroll tracking
    this.render();
  }

  /**
   * Update the widget with new streaming text
   * @param text - Current message text
   */
  updateText(text: string): void {
    if (!this.isVisible || text === this.lastSeenText) {
      return;
    }

    logger.trace(
      `Updating text (${this.lastSeenText.length} -> ${text.length} chars)`
    );

    // If text shrinks, it's likely being filtered (thinking chains removed)
    // In this case, reset the display position to avoid freezing
    if (text.length < this.lastSeenText.length) {
      logger.debug(
        `Text shrunk from ${this.lastSeenText.length} to ${text.length} chars - resetting display position`
      );
      // Reset displayed text to catch up with new filtered text
      this.displayedText = text;
    }

    this.lastSeenText = text;

    // Update buffer with new text
    this.textBuffer = text;

    // Parse segments from the buffer text NOW (not in animation loop)
    // This ensures we capture prompts before text might change
    this.parseTextAndUpdateSegments(this.textBuffer);

    // Start smooth streaming animation if not already running
    if (!this.streamingInterval) {
      this.startSmoothStreaming();
    }
  }

  /**
   * Parse text and create segments with text and image placeholders
   * @param text - Full message text
   */
  private parseTextAndUpdateSegments(text: string): void {
    // Extract all image prompts from text
    const prompts = extractImagePromptsMultiPattern(
      text,
      this.promptDetectionPatterns
    );

    const hadPrompts = this.contentSegments.some(s => s.type === 'image');
    const hasNewPrompts = prompts.length > 0 && !hadPrompts;

    logger.debug(
      `Parsing text (${text.length} chars), found ${prompts.length} prompts (new: ${hasNewPrompts})`
    );

    // If we just detected new prompts, reset display position to current buffer
    // This prevents freezing when segments structure changes
    if (hasNewPrompts) {
      logger.debug('New image prompts detected - syncing display position');
      this.displayedText = this.textBuffer;
    }

    if (prompts.length === 0) {
      // No prompts, just show text
      this.contentSegments = [
        {type: 'text', content: text, startIndex: 0, endIndex: text.length},
      ];
      return;
    }

    // Build segments by interleaving text and image placeholders
    const newSegments: ContentSegment[] = [];
    let lastIndex = 0;

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];

      // Add text before this prompt
      if (prompt.startIndex > lastIndex) {
        newSegments.push({
          type: 'text',
          content: text.substring(lastIndex, prompt.startIndex),
          startIndex: lastIndex,
          endIndex: prompt.startIndex,
        });
      }

      // Find existing image segment to preserve its state by matching prompt text
      const existingImage = this.contentSegments.find(
        seg => seg.type === 'image' && seg.prompt === prompt.prompt
      ) as ImageSegment | undefined;

      // Add image placeholder/completed image
      newSegments.push({
        type: 'image',
        promptIndex: i,
        prompt: prompt.prompt,
        imageUrl: existingImage?.imageUrl,
        status: existingImage?.status || 'detected',
        error: existingImage?.error,
        startIndex: prompt.startIndex,
        endIndex: prompt.endIndex,
      });

      lastIndex = prompt.endIndex;
    }

    // Add remaining text after last prompt
    if (lastIndex < text.length) {
      newSegments.push({
        type: 'text',
        content: text.substring(lastIndex),
        startIndex: lastIndex,
        endIndex: text.length,
      });
    }

    this.contentSegments = newSegments;
  }

  /**
   * Handle image completion event
   * @param detail - Image completion event details
   */
  private handleImageCompleted(
    detail: ProgressImageCompletedEventDetail
  ): void {
    if (detail.messageId !== this.currentMessageId || !this.isVisible) {
      return;
    }

    logger.debug(
      `Image completed for message ${detail.messageId}, prompt: ${detail.promptPreview}`
    );

    // Debug: log all current segments
    logger.debug(
      'Current segments:',
      this.contentSegments.map(s =>
        s.type === 'image'
          ? `[IMAGE: ${s.prompt}]`
          : `[TEXT: ${s.content.substring(0, 50)}...]`
      )
    );
    logger.debug(`Looking for prompt: "${detail.promptText}"`);

    // Find and update the corresponding image segment by matching prompt text
    const imageSegment = this.contentSegments.find(
      seg =>
        seg.type === 'image' &&
        seg.prompt === detail.promptText &&
        !seg.imageUrl // Find first uncompleted match
    ) as ImageSegment | undefined;

    if (imageSegment) {
      imageSegment.imageUrl = detail.imageUrl;
      imageSegment.status = 'completed';
      this.render();
      logger.debug('Successfully updated image segment');
    } else {
      logger.warn(
        `Could not find image segment for prompt: ${detail.promptPreview}`
      );
      logger.warn(
        'Available prompts in segments:',
        this.contentSegments
          .filter(s => s.type === 'image')
          .map(s => (s as ImageSegment).prompt)
      );
    }
  }

  /**
   * Start smooth streaming animation
   */
  private startSmoothStreaming(): void {
    this.streamingInterval = window.setInterval(() => {
      this.updateDisplayedText();
    }, this.FRAME_DELAY);
  }

  /**
   * Stop smooth streaming animation
   */
  private stopSmoothStreaming(): void {
    if (this.streamingInterval) {
      clearInterval(this.streamingInterval);
      this.streamingInterval = null;
    }
  }

  /**
   * Update displayed text incrementally for smooth streaming effect
   */
  private updateDisplayedText(): void {
    if (this.displayedText.length < this.textBuffer.length) {
      // Add more characters to displayed text
      const charsToAdd = Math.min(
        this.CHARS_PER_FRAME,
        this.textBuffer.length - this.displayedText.length
      );
      this.displayedText = this.textBuffer.substring(
        0,
        this.displayedText.length + charsToAdd
      );

      // Don't re-parse segments here - they're already parsed in updateText()
      // Just render with current display position
      this.render();
    }
    // Note: We keep the interval running even when caught up,
    // so it can resume when new text arrives
  }

  /**
   * Get segments adjusted for current display position
   * Truncates text content to match displayedText length
   */
  private getDisplaySegments(): ContentSegment[] {
    if (this.displayedText === this.textBuffer) {
      return this.contentSegments;
    }

    // Calculate how much text to show based on displayedText length
    const displayLength = this.displayedText.length;
    const result: ContentSegment[] = [];

    for (const segment of this.contentSegments) {
      if (segment.type === 'text') {
        const segmentStart = segment.startIndex ?? 0;
        const segmentEnd =
          segment.endIndex ?? segmentStart + segment.content.length;

        // Only add text if it starts before display length
        if (segmentStart < displayLength) {
          const visibleLength = Math.min(
            segment.content.length,
            displayLength - segmentStart
          );

          if (visibleLength > 0) {
            result.push({
              type: 'text',
              content: segment.content.substring(0, visibleLength),
              startIndex: segmentStart,
              endIndex: Math.min(segmentEnd, displayLength),
            });
          }
        }

        // Stop if we've gone past display length
        if (segmentStart >= displayLength) {
          break;
        }
      } else {
        // For images, show if we've displayed past the end of the prompt tag
        if (segment.endIndex && segment.endIndex <= displayLength) {
          result.push(segment);
        }
      }
    }

    return result;
  }

  /**
   * Mark streaming as complete (but keep widget visible)
   */
  markComplete(): void {
    logger.debug('Marking streaming as complete');

    // Immediately show all remaining text
    this.displayedText = this.textBuffer;
    this.parseTextAndUpdateSegments(this.displayedText);
    this.stopSmoothStreaming();

    this.render(); // Update to show "complete" state in header
  }

  /**
   * Toggle minimize/expand state
   */
  toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
    this.saveStateToStorage();
    this.render();
    logger.debug(`Widget ${this.isMinimized ? 'minimized' : 'expanded'}`);
  }

  /**
   * Close and hide the widget
   */
  close(): void {
    logger.debug('Closing streaming preview widget');
    this.isVisible = false;
    this.currentMessageId = -1;
    this.lastSeenText = '';
    this.contentSegments = [];
    this.textBuffer = '';
    this.displayedText = '';
    this.stopSmoothStreaming();
    this.removeFromDOM();
  }

  /**
   * Clear state when chat changes
   */
  clearState(): void {
    logger.info('Clearing streaming preview state (chat changed)');
    this.close();
  }

  /**
   * Render the widget to DOM
   */
  private render(): void {
    if (!this.isVisible) {
      this.removeFromDOM();
      return;
    }

    // Create widget if it doesn't exist
    if (!this.widget) {
      this.createWidget();
    }

    // Ensure widget is in DOM
    if (!this.widget?.parentElement) {
      this.insertIntoDom();
    }

    // Update widget state
    if (this.widget) {
      // Update minimize state
      if (this.isMinimized) {
        this.widget.classList.add('minimized');
      } else {
        this.widget.classList.remove('minimized');
      }

      // Update minimize button text
      const minimizeBtn = this.widget.querySelector(
        '.ai-streaming-preview-btn-minimize'
      ) as HTMLButtonElement;
      if (minimizeBtn) {
        minimizeBtn.textContent = this.isMinimized
          ? t('streamingPreview.expand')
          : t('streamingPreview.minimize');
      }

      // Update widget content
      this.updateWidgetContent();
    }
  }

  /**
   * Create the widget HTML structure
   */
  private createWidget(): void {
    const widget = document.createElement('div');
    widget.className = 'ai-streaming-preview-widget';
    if (this.isMinimized) {
      widget.classList.add('minimized');
    }

    // Header
    const header = document.createElement('div');
    header.className = 'ai-streaming-preview-header';

    const title = document.createElement('span');
    title.className = 'ai-streaming-preview-title';
    title.textContent = `📖 ${t('streamingPreview.title')}`;
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'ai-streaming-preview-actions';

    const minimizeBtn = document.createElement('button');
    minimizeBtn.className = 'ai-streaming-preview-btn-minimize';
    minimizeBtn.textContent = this.isMinimized
      ? t('streamingPreview.expand')
      : t('streamingPreview.minimize');
    minimizeBtn.addEventListener('click', () => this.toggleMinimize());
    actions.appendChild(minimizeBtn);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ai-streaming-preview-btn-close';
    closeBtn.textContent = '×';
    closeBtn.title = t('streamingPreview.close');
    closeBtn.addEventListener('click', () => this.close());
    actions.appendChild(closeBtn);

    header.appendChild(actions);
    widget.appendChild(header);

    // Content area
    const content = document.createElement('div');
    content.className = 'ai-streaming-preview-content';
    widget.appendChild(content);

    // Add scroll listener to detect manual scrolling
    content.addEventListener('scroll', () => {
      this.handleScroll(content);
    });

    this.widget = widget;
  }

  /**
   * Handle scroll event to detect manual scrolling
   * @param content - Content element
   */
  private handleScroll(content: HTMLElement): void {
    const currentScrollTop = content.scrollTop;

    // Detect if user is actively scrolling (not programmatic)
    if (Math.abs(currentScrollTop - this.lastScrollTop) > 5) {
      this.isUserScrolling = true;
    }

    this.lastScrollTop = currentScrollTop;

    // Clear existing timeout
    if (this.scrollCheckTimeout) {
      clearTimeout(this.scrollCheckTimeout);
    }

    // Check if user scrolled away from bottom
    const atBottom = this.isScrolledToBottom(content);

    if (!atBottom && this.isUserScrolling) {
      // User scrolled up, disable auto-scroll immediately
      this.autoScrollEnabled = false;
      logger.trace('Auto-scroll disabled (user scrolled up)');
    } else if (atBottom) {
      // User is at bottom, re-enable auto-scroll after a short delay
      this.scrollCheckTimeout = window.setTimeout(() => {
        this.autoScrollEnabled = true;
        this.isUserScrolling = false;
        logger.trace('Auto-scroll re-enabled (user at bottom)');
      }, 300);
    }
  }

  /**
   * Update widget content with current segments
   * Uses smart DOM updates to prevent flickering
   */
  private updateWidgetContent(): void {
    if (!this.widget) return;

    const content = this.widget.querySelector(
      '.ai-streaming-preview-content'
    ) as HTMLElement;
    if (!content) return;

    // Store scroll position before update
    const wasAtBottom = this.isScrolledToBottom(content);

    if (this.contentSegments.length === 0) {
      // Show loading state
      content.innerHTML = '';
      const loading = document.createElement('div');
      loading.className = 'ai-streaming-preview-loading';
      loading.textContent = t('streamingPreview.waitingForContent');
      content.appendChild(loading);
      return;
    }

    // Get segments adjusted for current display position
    const displaySegments = this.getDisplaySegments();

    // Smart update: only update changed segments
    const existingElements = Array.from(content.children);
    let elementIndex = 0;

    for (let i = 0; i < displaySegments.length; i++) {
      const segment = displaySegments[i];
      const existingElement = existingElements[elementIndex];

      if (segment.type === 'text') {
        // Check if we can reuse existing text element
        if (
          existingElement &&
          existingElement.classList.contains('ai-streaming-preview-text')
        ) {
          // Update text content directly (smooth streaming handles the animation)
          if (existingElement.textContent !== segment.content) {
            existingElement.textContent = segment.content;
          }
          elementIndex++;
        } else {
          // Create new text element
          const textEl = document.createElement('div');
          textEl.className = 'ai-streaming-preview-text';
          textEl.textContent = segment.content;
          content.insertBefore(textEl, existingElement || null);
          elementIndex++;
        }
      } else if (segment.type === 'image') {
        // Check if we can reuse existing image container
        const segmentKey = `img-${i}-${segment.promptIndex}`;
        if (
          existingElement &&
          existingElement.classList.contains(
            'ai-streaming-preview-image-container'
          ) &&
          existingElement.getAttribute('data-segment-key') === segmentKey
        ) {
          // Check if status changed
          const currentStatus = existingElement.getAttribute('data-status');
          if (currentStatus !== segment.status) {
            // Status changed, smoothly transition
            this.updateImageElement(
              existingElement as HTMLElement,
              segment,
              currentStatus || 'detected'
            );
          }
          elementIndex++;
        } else {
          // Create new image element
          const imageContainer = this.createImageElement(segment);
          imageContainer.setAttribute('data-segment-key', segmentKey);
          content.insertBefore(imageContainer, existingElement || null);
          elementIndex++;
        }
      }
    }

    // Remove extra elements that are no longer needed
    while (elementIndex < existingElements.length) {
      const elementToRemove = existingElements[elementIndex];
      if (elementToRemove.parentElement) {
        elementToRemove.parentElement.removeChild(elementToRemove);
      }
      elementIndex++;
    }

    // Auto-scroll only if enabled and user isn't manually scrolling
    if (this.autoScrollEnabled && wasAtBottom && !this.isUserScrolling) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        content.scrollTop = content.scrollHeight;
        this.lastScrollTop = content.scrollHeight;
      });
    }
  }

  /**
   * Check if content is scrolled to bottom
   * @param element - Scrollable element
   * @returns True if at bottom
   */
  private isScrolledToBottom(element: HTMLElement): boolean {
    const threshold = 50; // 50px threshold for "near bottom"
    return (
      element.scrollHeight - element.scrollTop - element.clientHeight <=
      threshold
    );
  }

  /**
   * Update an existing image element with smooth transition
   * @param container - Existing container element
   * @param segment - New segment data
   * @param oldStatus - Previous status
   */
  private updateImageElement(
    container: HTMLElement,
    segment: ImageSegment,
    oldStatus: string
  ): void {
    // Update status attribute
    container.dataset.status = segment.status;

    // Handle transition to completed image
    if (segment.status === 'completed' && segment.imageUrl) {
      // Fade out placeholder
      const placeholder = container.querySelector(
        '.ai-streaming-preview-image-placeholder, .ai-streaming-preview-image-failed'
      );
      if (placeholder) {
        (placeholder as HTMLElement).style.opacity = '0';
        (placeholder as HTMLElement).style.transition = 'opacity 0.3s ease';

        // After fade out, replace with image
        setTimeout(() => {
          container.innerHTML = '';

          const img = document.createElement('img');
          img.src = segment.imageUrl!;
          img.alt = segment.prompt;
          img.className = 'ai-streaming-preview-image';
          img.title = t('streamingPreview.clickToEnlarge');
          img.style.opacity = '0';

          // Click to open modal
          img.addEventListener('click', () => {
            this.openImageInModal(segment);
          });

          container.appendChild(img);

          // Fade in image
          requestAnimationFrame(() => {
            img.style.transition = 'opacity 0.3s ease';
            img.style.opacity = '1';
          });
        }, 300);
      }
    } else if (segment.status === 'failed') {
      // Transition to failed state
      container.innerHTML = '';
      const failed = document.createElement('div');
      failed.className = 'ai-streaming-preview-image-failed';
      failed.innerHTML = `
        <div class="ai-streaming-preview-image-failed-icon">⚠️</div>
        <div class="ai-streaming-preview-image-failed-text">
          ${t('streamingPreview.generationFailed')}
        </div>
      `;
      container.appendChild(failed);
    } else if (oldStatus !== segment.status) {
      // Update placeholder state (detected -> generating)
      const icon = container.querySelector(
        '.ai-streaming-preview-image-placeholder-icon'
      );
      const text = container.querySelector(
        '.ai-streaming-preview-image-placeholder-text'
      );

      if (icon) {
        icon.textContent = segment.status === 'generating' ? '⏳' : '🖼️';
      }
      if (text) {
        text.textContent =
          segment.status === 'generating'
            ? t('streamingPreview.generating')
            : t('streamingPreview.imageDetected');
      }
    }
  }

  /**
   * Create an image element (placeholder or completed image)
   * @param segment - Image segment data
   * @returns HTML element
   */
  private createImageElement(segment: ImageSegment): HTMLElement {
    const container = document.createElement('div');
    container.className = 'ai-streaming-preview-image-container';
    container.dataset.status = segment.status;

    if (segment.status === 'completed' && segment.imageUrl) {
      // Show completed image (no caption to save space)
      const img = document.createElement('img');
      img.src = segment.imageUrl;
      img.alt = segment.prompt;
      img.className = 'ai-streaming-preview-image';
      img.title = t('streamingPreview.clickToEnlarge');

      // Click to open modal
      img.addEventListener('click', () => {
        this.openImageInModal(segment);
      });

      container.appendChild(img);
    } else if (segment.status === 'failed') {
      // Show failed state
      const failed = document.createElement('div');
      failed.className = 'ai-streaming-preview-image-failed';
      failed.innerHTML = `
        <div class="ai-streaming-preview-image-failed-icon">⚠️</div>
        <div class="ai-streaming-preview-image-failed-text">
          ${t('streamingPreview.generationFailed')}
        </div>
      `;
      container.appendChild(failed);
    } else {
      // Show placeholder (detected or generating)
      const placeholder = document.createElement('div');
      placeholder.className = 'ai-streaming-preview-image-placeholder';

      const icon = document.createElement('div');
      icon.className = 'ai-streaming-preview-image-placeholder-icon';
      icon.textContent = segment.status === 'generating' ? '⏳' : '🖼️';
      placeholder.appendChild(icon);

      const text = document.createElement('div');
      text.className = 'ai-streaming-preview-image-placeholder-text';
      text.textContent =
        segment.status === 'generating'
          ? t('streamingPreview.generating')
          : t('streamingPreview.imageDetected');
      placeholder.appendChild(text);

      // Show truncated prompt
      const promptText = document.createElement('div');
      promptText.className = 'ai-streaming-preview-image-placeholder-prompt';
      promptText.textContent = this.truncatePrompt(segment.prompt, 60);
      placeholder.appendChild(promptText);

      container.appendChild(placeholder);
    }

    return container;
  }

  /**
   * Open image in modal viewer
   * @param segment - Image segment with imageUrl
   */
  private openImageInModal(segment: ImageSegment): void {
    if (!segment.imageUrl) return;

    // Collect all completed images for modal navigation
    const completedImages: ModalImage[] = this.contentSegments
      .filter(
        (seg): seg is ImageSegment =>
          seg.type === 'image' && seg.status === 'completed' && !!seg.imageUrl
      )
      .map(seg => ({
        imageUrl: seg.imageUrl!,
        promptText: seg.prompt,
        promptPreview: this.truncatePrompt(seg.prompt, 60),
      }));

    // Find current image index
    const currentIndex = completedImages.findIndex(
      img => img.imageUrl === segment.imageUrl
    );

    openImageModal({
      images: completedImages,
      initialIndex: Math.max(0, currentIndex),
    });
  }

  /**
   * Truncate prompt text for display
   * @param prompt - Full prompt text
   * @param maxLength - Maximum length
   * @returns Truncated prompt
   */
  private truncatePrompt(prompt: string, maxLength: number): string {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength - 3) + '...';
  }

  /**
   * Insert widget into DOM
   */
  private insertIntoDom(): void {
    if (!this.widget) return;

    // Insert at top of #sheld (above chat input)
    const sheld = document.querySelector('#sheld');
    if (sheld) {
      // Insert as first child
      sheld.insertBefore(this.widget, sheld.firstChild);
      logger.debug('Streaming preview widget inserted into DOM');
    } else {
      logger.warn('Could not find #sheld element to insert widget');
    }
  }

  /**
   * Remove widget from DOM
   */
  private removeFromDOM(): void {
    if (this.widget?.parentElement) {
      this.widget.parentElement.removeChild(this.widget);
      logger.debug('Streaming preview widget removed from DOM');
    }
    this.widget = null;
  }

  /**
   * Check if widget is currently visible
   * @returns True if visible
   */
  isActive(): boolean {
    return this.isVisible;
  }

  /**
   * Get current widget state for debugging
   * @returns Widget state information
   */
  getStatus(): {
    isVisible: boolean;
    isMinimized: boolean;
    messageId: number;
    segmentCount: number;
  } {
    return {
      isVisible: this.isVisible,
      isMinimized: this.isMinimized,
      messageId: this.currentMessageId,
      segmentCount: this.contentSegments.length,
    };
  }
}
