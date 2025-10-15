/**
 * Shared Modal Viewer Module
 * Provides a reusable image modal viewer for both progress widget and gallery widget
 */

import {createLogger} from './logger';
import {t} from './i18n';

const logger = createLogger('ModalViewer');

/**
 * Image data for modal viewer
 */
export interface ModalImage {
  imageUrl: string;
  promptText: string;
  promptPreview: string;
  messageId?: number;
  imageIndex?: number;
}

/**
 * Modal viewer options
 */
export interface ModalViewerOptions {
  images: ModalImage[];
  initialIndex?: number;
  onClose?: () => void;
  onNavigate?: (newIndex: number) => void;
  title?: string;
}

/**
 * Zoom state for image manipulation
 */
interface ZoomState {
  scale: number;
  translateX: number;
  translateY: number;
  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;
  lastTouchDistance: number;
  velocityX: number;
  velocityY: number;
  lastMoveTime: number;
  lastMoveX: number;
  lastMoveY: number;
}

/**
 * Image Modal Viewer Class
 * Handles displaying images in a full-screen modal with zoom, pan, and navigation
 */
export class ImageModalViewer {
  private images: ModalImage[];
  private currentIndex: number;
  private onClose?: () => void;
  private onNavigate?: (newIndex: number) => void;
  private title?: string;

  // DOM elements
  private backdrop?: HTMLElement;
  private container?: HTMLElement;
  private img?: HTMLImageElement;
  private imageContainer?: HTMLElement;
  private prevBtn?: HTMLButtonElement;
  private nextBtn?: HTMLButtonElement;
  private meta?: HTMLElement;
  private promptDiv?: HTMLElement;
  private info?: HTMLElement;
  private zoomIndicator?: HTMLElement;
  private tapIndicator?: HTMLElement;
  private fullscreenBtn?: HTMLButtonElement;
  private rotateBtn?: HTMLButtonElement;

  // Fullscreen state
  private isFullscreen = false;

  // Image rotation state (in degrees, clockwise) - static to persist across modal instances
  private static rotationDegrees = 0;

  // Zoom state
  private zoomState: ZoomState = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    lastTouchDistance: 0,
    velocityX: 0,
    velocityY: 0,
    lastMoveTime: 0,
    lastMoveX: 0,
    lastMoveY: 0,
  };

  // Constants
  private readonly MIN_ZOOM = 1;
  private readonly MAX_ZOOM = 3;
  private readonly ZOOM_STEP = 0.1;

  // Event handlers (stored for cleanup)
  private boundHandlers: {[key: string]: EventListener} = {};
  private zoomIndicatorTimeout: number | null = null;

  constructor(options: ModalViewerOptions) {
    this.images = options.images;
    this.currentIndex = options.initialIndex || 0;
    this.onClose = options.onClose;
    this.onNavigate = options.onNavigate;
    this.title = options.title;

    this.createModal();
    this.setupEventHandlers();
    this.updateDisplay();

    logger.debug(
      `Modal viewer opened with ${this.images.length} images, starting at index ${this.currentIndex}`
    );
  }

  /**
   * Create modal DOM structure
   */
  private createModal(): void {
    // Create modal backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'ai-img-modal-backdrop';

    // Lock background scroll when modal opens
    document.body.classList.add('ai-img-modal-open');

    // Create modal container
    this.container = document.createElement('div');
    this.container.className = 'ai-img-modal-container';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-label', this.title || 'Image viewer');
    this.container.tabIndex = -1;

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ai-img-modal-close';
    closeBtn.innerHTML = '×';
    closeBtn.title = t('modal.close');
    this.container.appendChild(closeBtn);

    // Content area with navigation
    const content = document.createElement('div');
    content.className = 'ai-img-modal-content';

    // Previous button
    this.prevBtn = document.createElement('button');
    this.prevBtn.className = 'ai-img-modal-nav prev';
    this.prevBtn.innerHTML = '▶';
    this.prevBtn.title = t('modal.previous');
    this.prevBtn.setAttribute('aria-label', t('modal.previous'));
    content.appendChild(this.prevBtn);

    // Image container
    this.imageContainer = document.createElement('div');
    this.imageContainer.className = 'ai-img-modal-image-container';

    this.img = document.createElement('img');
    this.img.className = 'ai-img-modal-image';
    this.imageContainer.appendChild(this.img);

    // Zoom indicator
    this.zoomIndicator = document.createElement('div');
    this.zoomIndicator.className = 'ai-img-zoom-indicator';
    this.zoomIndicator.style.display = 'none';
    this.imageContainer.appendChild(this.zoomIndicator);

    // Mobile swipe hint (replaces CSS ::after pseudo-element)
    const swipeHint = document.createElement('div');
    swipeHint.className = 'ai-img-modal-swipe-hint';
    swipeHint.textContent = t('modal.swipeToNavigate');
    swipeHint.setAttribute('aria-hidden', 'true');
    this.imageContainer.appendChild(swipeHint);

    content.appendChild(this.imageContainer);

    // Next button
    this.nextBtn = document.createElement('button');
    this.nextBtn.className = 'ai-img-modal-nav next';
    this.nextBtn.innerHTML = '▶';
    this.nextBtn.title = t('modal.next');
    this.nextBtn.setAttribute('aria-label', t('modal.next'));
    content.appendChild(this.nextBtn);

    this.container.appendChild(content);

    // Info bar
    this.info = document.createElement('div');
    this.info.className = 'ai-img-modal-info';
    this.info.setAttribute('role', 'region');
    this.info.setAttribute('aria-live', 'polite');

    this.meta = document.createElement('div');
    this.meta.className = 'ai-img-modal-meta';
    this.info.appendChild(this.meta);

    // Mobile tap indicator (replaces CSS ::after pseudo-element on meta)
    this.tapIndicator = document.createElement('div');
    this.tapIndicator.className = 'ai-img-modal-tap-indicator';
    this.tapIndicator.textContent = t('modal.tapToViewPrompt');
    this.tapIndicator.setAttribute('aria-hidden', 'true');
    this.meta.appendChild(this.tapIndicator);

    this.promptDiv = document.createElement('div');
    this.promptDiv.className = 'ai-img-modal-prompt';
    this.info.appendChild(this.promptDiv);

    this.container.appendChild(this.info);

    this.backdrop.appendChild(this.container);
    document.body.appendChild(this.backdrop);
  }

  /**
   * Setup all event handlers
   */
  private setupEventHandlers(): void {
    if (
      !this.backdrop ||
      !this.container ||
      !this.img ||
      !this.imageContainer
    ) {
      return;
    }

    // Close modal handlers
    const closeBtn = this.container.querySelector('.ai-img-modal-close');
    closeBtn?.addEventListener('click', () => this.close());

    // Click backdrop to close
    this.backdrop.addEventListener('click', (e: Event) => {
      if (e.target === this.backdrop) {
        this.close();
      }
    });

    // Prevent clicks on container from closing
    this.container.addEventListener('click', (e: Event) => {
      e.stopPropagation();
    });

    // Navigation handlers
    this.prevBtn?.addEventListener('click', () => this.navigate(-1));
    this.nextBtn?.addEventListener('click', () => this.navigate(1));

    // Fullscreen change event listener (handle ESC key exit)
    this.boundHandlers.fullscreenchange = (() => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      if (this.isFullscreen !== isCurrentlyFullscreen) {
        this.isFullscreen = isCurrentlyFullscreen;
        if (this.container) {
          if (this.isFullscreen) {
            this.container.classList.add('ai-img-fullscreen-active');
            this.backdrop?.classList.add('ai-img-fullscreen-active');
          } else {
            this.container.classList.remove('ai-img-fullscreen-active');
            this.backdrop?.classList.remove('ai-img-fullscreen-active');
          }
        }
        this.updateFullscreenButton();

        logger.debug(
          `Fullscreen state changed: ${this.isFullscreen ? 'entered' : 'exited'}`
        );
      }
    }) as EventListener;

    // Listen for all vendor-prefixed fullscreen change events
    document.addEventListener(
      'fullscreenchange',
      this.boundHandlers.fullscreenchange
    );
    document.addEventListener(
      'webkitfullscreenchange',
      this.boundHandlers.fullscreenchange
    );
    document.addEventListener(
      'mozfullscreenchange',
      this.boundHandlers.fullscreenchange
    );
    document.addEventListener(
      'MSFullscreenChange',
      this.boundHandlers.fullscreenchange
    );

    // Keyboard navigation and shortcuts
    this.boundHandlers.keydown = ((e: KeyboardEvent) => {
      // Allow keyboard input in text fields (textarea, input, contenteditable)
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'INPUT' ||
        target.isContentEditable
      ) {
        return; // Don't intercept keyboard events for text input fields
      }

      // Stop event from bubbling to SillyTavern
      e.preventDefault();
      e.stopPropagation();

      // Navigation
      switch (e.key) {
        case 'ArrowLeft':
          this.navigate(-1);
          break;
        case 'ArrowRight':
          this.navigate(1);
          break;
        case 'Escape':
          this.close();
          break;
        case 'Home':
          this.navigateToIndex(0);
          break;
        case 'End':
          this.navigateToIndex(this.images.length - 1);
          break;
      }

      // Action shortcuts (case insensitive)
      const key = e.key.toLowerCase();
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (key) {
          case 'c': {
            const currentImage = this.images[this.currentIndex];
            this.copyPromptToClipboard(currentImage.promptText);
            break;
          }
          case 'd': {
            const downloadImage = this.images[this.currentIndex];
            this.downloadImage(
              downloadImage.imageUrl,
              `image-${this.currentIndex + 1}.png`
            );
            // Toast is shown inside downloadImage method based on platform
            break;
          }
          case 'o': {
            const openImage = this.images[this.currentIndex];
            window.open(openImage.imageUrl, '_blank', 'noopener,noreferrer');
            break;
          }
          case 'f':
            this.toggleFullscreen();
            break;
          case 'r':
            if (this.zoomState.scale > this.MIN_ZOOM) {
              this.resetZoom();
            }
            break;
          case 't':
            this.rotateImage();
            break;
          case '+':
          case '=':
            this.zoomTo(this.zoomState.scale + this.ZOOM_STEP);
            break;
          case '-':
          case '_':
            this.zoomTo(this.zoomState.scale - this.ZOOM_STEP);
            break;
        }
      }

      // Number keys for quick navigation
      if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        const targetIndex = parseInt(e.key) - 1;
        if (targetIndex < this.images.length) {
          this.navigateToIndex(targetIndex);
        }
      }
    }) as EventListener;
    // Use capture phase to intercept events before SillyTavern
    document.addEventListener('keydown', this.boundHandlers.keydown, true);

    // Setup zoom and pan handlers
    this.setupZoomHandlers();

    // Toggle prompt visibility on mobile
    if (this.info) {
      this.info.addEventListener('click', (event: Event) => {
        const target = event.target as HTMLElement;
        if (
          !target.closest('.ai-img-modal-action-btn') &&
          window.innerWidth <= 768
        ) {
          this.info!.classList.toggle('expanded');
          // Update tap indicator text based on expanded state
          if (this.tapIndicator) {
            const isExpanded = this.info!.classList.contains('expanded');
            this.tapIndicator.textContent = isExpanded
              ? t('modal.tapToHidePrompt')
              : t('modal.tapToViewPrompt');
          }
        }
      });
    }
  }

  /**
   * Setup zoom and pan event handlers
   */
  private setupZoomHandlers(): void {
    if (!this.imageContainer || !this.img) return;

    // Desktop: Mouse wheel zoom
    this.imageContainer.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -this.ZOOM_STEP : this.ZOOM_STEP;
      const newScale = this.zoomState.scale + delta;
      this.zoomTo(newScale, e.clientX, e.clientY);
    });

    // Desktop: Click-and-drag panning
    this.imageContainer.addEventListener('mousedown', (e: MouseEvent) => {
      if (this.zoomState.scale <= this.MIN_ZOOM) return;

      e.preventDefault();
      e.stopPropagation();
      this.zoomState.isDragging = true;
      this.zoomState.dragStartX = e.clientX - this.zoomState.translateX;
      this.zoomState.dragStartY = e.clientY - this.zoomState.translateY;
      this.updateImageTransform();
    });

    // Global mouse move and up handlers
    this.boundHandlers.mousemove = ((e: MouseEvent) => {
      if (!this.zoomState.isDragging) return;

      this.zoomState.translateX = e.clientX - this.zoomState.dragStartX;
      this.zoomState.translateY = e.clientY - this.zoomState.dragStartY;
      this.constrainToBounds();
      this.updateImageTransform();
    }) as EventListener;

    this.boundHandlers.mouseup = (() => {
      if (this.zoomState.isDragging) {
        this.zoomState.isDragging = false;
        this.updateImageTransform();
      }
    }) as EventListener;

    document.addEventListener('mousemove', this.boundHandlers.mousemove);
    document.addEventListener('mouseup', this.boundHandlers.mouseup);

    // Prevent native drag behavior
    this.img.addEventListener('dragstart', (e: DragEvent) => {
      e.preventDefault();
    });

    // Double-click zoom removed - conflicts with tap navigation

    // Touch handlers for mobile
    this.setupTouchHandlers();

    // Ensure bounds after image load
    this.img.addEventListener('load', () => {
      this.constrainToBounds();
      this.updateImageTransform();
    });
  }

  /**
   * Setup touch event handlers for mobile
   */
  private setupTouchHandlers(): void {
    if (!this.imageContainer) return;

    let touches: Touch[] = [];
    let swipeStartX = 0;
    let swipeStartY = 0;

    this.imageContainer.addEventListener('touchstart', (e: TouchEvent) => {
      touches = Array.from(e.touches);

      if (touches.length === 1) {
        // Single touch - potential swipe or pan
        swipeStartX = touches[0].clientX;
        swipeStartY = touches[0].clientY;

        // Double-tap zoom removed - conflicts with tap navigation

        // Start pan if zoomed
        if (this.zoomState.scale > this.MIN_ZOOM) {
          this.zoomState.isDragging = true;
          this.zoomState.dragStartX =
            touches[0].clientX - this.zoomState.translateX;
          this.zoomState.dragStartY =
            touches[0].clientY - this.zoomState.translateY;
        }
      } else if (touches.length === 2) {
        // Two fingers - pinch zoom
        e.preventDefault();
        this.zoomState.lastTouchDistance = this.getTouchDistance(
          touches[0],
          touches[1]
        );
      }
    });

    this.imageContainer.addEventListener('touchmove', (e: TouchEvent) => {
      touches = Array.from(e.touches);

      if (touches.length === 1 && this.zoomState.isDragging) {
        // Panning with velocity tracking
        e.preventDefault();
        const currentTime = Date.now();
        const currentX = touches[0].clientX;
        const currentY = touches[0].clientY;

        // Calculate velocity
        if (this.zoomState.lastMoveTime > 0) {
          const timeDelta = currentTime - this.zoomState.lastMoveTime;
          if (timeDelta > 0) {
            this.zoomState.velocityX =
              (currentX - this.zoomState.lastMoveX) / timeDelta;
            this.zoomState.velocityY =
              (currentY - this.zoomState.lastMoveY) / timeDelta;
          }
        }

        this.zoomState.translateX = currentX - this.zoomState.dragStartX;
        this.zoomState.translateY = currentY - this.zoomState.dragStartY;
        this.zoomState.lastMoveTime = currentTime;
        this.zoomState.lastMoveX = currentX;
        this.zoomState.lastMoveY = currentY;

        this.constrainToBounds();
        this.updateImageTransform();
      } else if (touches.length === 2) {
        // Pinch zoom
        e.preventDefault();
        const distance = this.getTouchDistance(touches[0], touches[1]);
        const scale = distance / this.zoomState.lastTouchDistance;
        const newScale = this.zoomState.scale * scale;

        const centerX = (touches[0].clientX + touches[1].clientX) / 2;
        const centerY = (touches[0].clientY + touches[1].clientY) / 2;

        this.zoomTo(newScale, centerX, centerY, false); // No animation during pinch
        this.zoomState.lastTouchDistance = distance;
      }
    });

    this.imageContainer.addEventListener('touchend', (e: TouchEvent) => {
      const remainingTouches = Array.from(e.touches);

      if (remainingTouches.length === 0) {
        // Check for swipe
        if (
          this.zoomState.scale <= this.MIN_ZOOM &&
          !this.zoomState.isDragging
        ) {
          const touchEndX = e.changedTouches[0].clientX;
          const touchEndY = e.changedTouches[0].clientY;
          const deltaX = touchEndX - swipeStartX;
          const deltaY = touchEndY - swipeStartY;

          // Detect tap (minimal movement)
          if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
            // Determine which part of the image was tapped
            const tapX = e.changedTouches[0].clientX;
            const tapY = e.changedTouches[0].clientY;

            // Get navigation action based on tap position and rotation
            const navDirection = this.getNavigationFromTap(tapX, tapY);

            if (navDirection === 'fullscreen') {
              // Tap in center area - toggle fullscreen
              if (this.isFullscreen) {
                this.exitFullscreen();
              } else {
                this.enterFullscreen();
              }
            } else if (navDirection !== null) {
              // Tap on left/right (or top/bottom if rotated) - navigate
              this.navigate(navDirection);
            }
            return;
          }

          // Detect horizontal swipe (threshold: 50px, max vertical: 100px)
          if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 100) {
            if (deltaX > 0) {
              this.navigate(-1); // Swipe right -> previous
            } else {
              this.navigate(1); // Swipe left -> next
            }
          }
        }

        // Apply momentum if there's velocity
        if (
          this.zoomState.isDragging &&
          this.zoomState.scale > this.MIN_ZOOM &&
          (Math.abs(this.zoomState.velocityX) > 0.1 ||
            Math.abs(this.zoomState.velocityY) > 0.1)
        ) {
          this.applyMomentum();
        }

        this.zoomState.isDragging = false;
        this.zoomState.velocityX = 0;
        this.zoomState.velocityY = 0;
        this.zoomState.lastMoveTime = 0;
      }

      touches = remainingTouches;
    });
  }

  /**
   * Navigate to a different image
   */
  private navigate(direction: number): void {
    const newIndex = this.currentIndex + direction;

    if (newIndex >= 0 && newIndex < this.images.length) {
      this.currentIndex = newIndex;
      this.updateDisplay();
      this.onNavigate?.(this.currentIndex);
    }
  }

  /**
   * Navigate to a specific index
   */
  private navigateToIndex(index: number): void {
    if (
      index >= 0 &&
      index < this.images.length &&
      index !== this.currentIndex
    ) {
      this.currentIndex = index;
      this.updateDisplay();
      this.onNavigate?.(this.currentIndex);
    }
  }

  /**
   * Update the modal display
   */
  private updateDisplay(changeImage = true): void {
    if (!this.img || !this.meta || !this.promptDiv) return;

    const currentImage = this.images[this.currentIndex];

    if (changeImage) {
      // Apply rotation class immediately before loading image
      // This ensures CSS constraints are correct when image loads
      this.applyImageTransform();

      // Wait for image to load before resetting zoom to ensure correct dimensions
      this.img.onload = () => {
        this.resetZoom(); // Reset zoom after image loads with preserved rotation
      };
      this.img.src = currentImage.imageUrl;
      this.img.alt = currentImage.promptPreview;
      this.promptDiv.textContent = currentImage.promptText;
    }

    // Update metadata
    this.meta.innerHTML = `
      <div class="ai-img-modal-meta-item">
        <span class="ai-img-modal-meta-label">
          ${t('progress.imageIndex', {
            current: String(this.currentIndex + 1),
            total: String(this.images.length),
          })}
        </span>
      </div>
      <div class="ai-img-modal-actions">
        <button class="ai-img-modal-action-btn reset-zoom-btn" title="${t('modal.resetZoom')}" style="display: none;">
          <i class="fa fa-undo"></i> ${t('modal.resetZoom')}
        </button>
        <button class="ai-img-modal-action-btn fullscreen-btn" title="${t('modal.fullscreen')} (F)">
          <i class="fa fa-expand"></i> <span class="fullscreen-text">${t('modal.fullscreen')}</span>
        </button>
        <button class="ai-img-modal-action-btn rotate-btn" title="${t('modal.rotateImage')} (T)">
          <i class="fa fa-rotate-right"></i> ${t('modal.rotateImage')}
        </button>
        <button class="ai-img-modal-action-btn copy-prompt-btn" title="${t('modal.copyPrompt')} (C)">
          <i class="fa fa-copy"></i> ${t('modal.copyPrompt')}
        </button>
        <button class="ai-img-modal-action-btn open-tab-btn" title="${t('modal.openInNewTab')} (O)">
          <i class="fa fa-external-link-alt"></i> ${t('modal.openInNewTab')}
        </button>
        <button class="ai-img-modal-action-btn download-btn" title="${t('modal.download')} (D)">
          <i class="fa fa-download"></i> ${t('modal.download')}
        </button>
      </div>
    `;

    // Update navigation buttons
    this.updateNavButtons();

    // Preload neighboring images
    this.preloadImage(this.currentIndex - 1);
    this.preloadImage(this.currentIndex + 1);

    // Re-attach action button handlers
    this.attachActionHandlers();
  }

  /**
   * Update navigation button states
   */
  private updateNavButtons(): void {
    if (this.prevBtn) {
      this.prevBtn.disabled = this.currentIndex <= 0;
    }
    if (this.nextBtn) {
      this.nextBtn.disabled = this.currentIndex >= this.images.length - 1;
    }
  }

  /**
   * Preload an image by index
   */
  private preloadImage(index: number): void {
    if (index < 0 || index >= this.images.length) return;
    const pre = new Image();
    pre.src = this.images[index].imageUrl;
  }

  /**
   * Attach action button handlers
   */
  private attachActionHandlers(): void {
    if (!this.meta) return;

    const resetZoomBtn = this.meta.querySelector(
      '.reset-zoom-btn'
    ) as HTMLButtonElement;
    this.fullscreenBtn = this.meta.querySelector(
      '.fullscreen-btn'
    ) as HTMLButtonElement;
    this.rotateBtn = this.meta.querySelector(
      '.rotate-btn'
    ) as HTMLButtonElement;
    const copyPromptBtn = this.meta.querySelector('.copy-prompt-btn');
    const downloadBtn = this.meta.querySelector('.download-btn');
    const openTabBtn = this.meta.querySelector('.open-tab-btn');

    // Show/hide reset button based on zoom state
    const updateResetButton = () => {
      if (resetZoomBtn) {
        resetZoomBtn.style.display =
          this.zoomState.scale > this.MIN_ZOOM ? 'flex' : 'none';
      }
    };
    updateResetButton();

    resetZoomBtn?.addEventListener('click', () => {
      this.resetZoom();
      updateResetButton();
    });

    copyPromptBtn?.addEventListener('click', () => {
      const currentImage = this.images[this.currentIndex];
      this.copyPromptToClipboard(currentImage.promptText);
    });

    downloadBtn?.addEventListener('click', () => {
      const currentImage = this.images[this.currentIndex];
      this.downloadImage(
        currentImage.imageUrl,
        `image-${this.currentIndex + 1}.png`
      );
      // Toast is shown inside downloadImage method based on platform
    });

    openTabBtn?.addEventListener('click', () => {
      try {
        const currentImage = this.images[this.currentIndex];
        window.open(currentImage.imageUrl, '_blank', 'noopener,noreferrer');
      } catch (e) {
        logger.warn('Failed to open image in new tab', e);
      }
    });

    // Fullscreen button
    this.fullscreenBtn?.addEventListener('click', () => {
      this.toggleFullscreen();
    });

    // Rotate button
    this.rotateBtn?.addEventListener('click', () => {
      this.rotateImage();
    });
  }

  /**
   * Copy prompt text to clipboard
   */
  private async copyPromptToClipboard(text: string): Promise<void> {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        this.showToast(t('modal.copiedToClipboard'));
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          this.showToast(t('modal.copiedToClipboard'));
        } catch (err) {
          this.showToast(t('modal.copyFailed'), 'error');
        } finally {
          document.body.removeChild(textarea);
        }
      }
    } catch (err) {
      logger.error('Failed to copy to clipboard', err);
      this.showToast(t('modal.copyFailed'), 'error');
    }
  }

  /**
   * Show a toast notification
   */
  private showToast(
    message: string,
    type: 'success' | 'error' = 'success'
  ): void {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `ai-img-modal-toast ai-img-modal-toast-${type}`;
    toast.textContent = message;

    // Add to container or backdrop
    const container = this.container || this.backdrop;
    if (container) {
      container.appendChild(toast);

      // Trigger animation
      setTimeout(() => {
        toast.classList.add('show');
      }, 10);

      // Remove after animation
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
          toast.remove();
        }, 300);
      }, 2000);
    }
  }

  /**
   * Check if device is iOS
   */
  private isIOS(): boolean {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }

  /**
   * Toggle fullscreen mode
   */
  private async toggleFullscreen(): Promise<void> {
    if (this.isFullscreen) {
      await this.exitFullscreen();
    } else {
      await this.enterFullscreen();
    }
  }

  /**
   * Enter fullscreen mode
   */
  private async enterFullscreen(): Promise<void> {
    if (!this.backdrop) return;

    try {
      // Request fullscreen on backdrop (parent element) instead of container
      // This way the entire modal hierarchy is in fullscreen context
      if (this.backdrop.requestFullscreen) {
        await this.backdrop.requestFullscreen();
      } else if ((this.backdrop as any).webkitRequestFullscreen) {
        await (this.backdrop as any).webkitRequestFullscreen();
      } else if ((this.backdrop as any).mozRequestFullScreen) {
        await (this.backdrop as any).mozRequestFullScreen();
      } else if ((this.backdrop as any).msRequestFullscreen) {
        await (this.backdrop as any).msRequestFullscreen();
      }
      this.isFullscreen = true;
      if (this.container) {
        this.container.classList.add('ai-img-fullscreen-active');
      }
      this.backdrop.classList.add('ai-img-fullscreen-active');
      this.updateFullscreenButton();
      logger.debug('Entered fullscreen mode');
    } catch (err) {
      logger.warn('Failed to enter fullscreen', err);
    }
  }

  /**
   * Exit fullscreen mode
   */
  private async exitFullscreen(): Promise<void> {
    try {
      // Try standard Fullscreen API with vendor prefixes
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        await (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
      this.isFullscreen = false;
      if (this.container) {
        this.container.classList.remove('ai-img-fullscreen-active');
      }
      this.backdrop?.classList.remove('ai-img-fullscreen-active');
      this.updateFullscreenButton();
      logger.debug('Exited fullscreen mode');
    } catch (err) {
      logger.warn('Failed to exit fullscreen', err);
    }
  }

  /**
   * Update fullscreen button state
   */
  private updateFullscreenButton(): void {
    if (!this.fullscreenBtn) return;

    const icon = this.fullscreenBtn.querySelector('i');
    const text = this.fullscreenBtn.querySelector('.fullscreen-text');

    if (this.isFullscreen) {
      icon?.classList.remove('fa-expand');
      icon?.classList.add('fa-compress');
      if (text) text.textContent = t('modal.exitFullscreen');
      this.fullscreenBtn.title = `${t('modal.exitFullscreen')} (F)`;
    } else {
      icon?.classList.remove('fa-compress');
      icon?.classList.add('fa-expand');
      if (text) text.textContent = t('modal.fullscreen');
      this.fullscreenBtn.title = `${t('modal.fullscreen')} (F)`;
    }
  }

  /**
   * Rotate the image 90 degrees clockwise
   */
  private rotateImage(): void {
    ImageModalViewer.rotationDegrees =
      (ImageModalViewer.rotationDegrees + 90) % 360;
    this.updateImageTransform();
    logger.debug(
      `Rotated image to ${ImageModalViewer.rotationDegrees} degrees`
    );
  }

  /**
   * Apply rotation and zoom transform to the image
   * Adds CSS class to swap dimensions when rotated 90° or 270°
   */
  private applyImageTransform(): void {
    if (!this.img || !this.imageContainer) return;

    // Toggle CSS class for 90°/270° rotation
    const isRotated90or270 =
      ImageModalViewer.rotationDegrees === 90 ||
      ImageModalViewer.rotationDegrees === 270;

    if (isRotated90or270) {
      this.img.classList.add('rotated-90-270');

      // For rotated images, set explicit dimensions based on container size
      // Use requestAnimationFrame to ensure container has correct dimensions
      requestAnimationFrame(() => {
        if (!this.img || !this.imageContainer) return;
        const rect = this.imageContainer.getBoundingClientRect();
        // When rotated 90°/270°, swap width/height constraints
        this.img.style.maxWidth = `${rect.height}px`;
        this.img.style.maxHeight = `${rect.width}px`;
      });
    } else {
      this.img.classList.remove('rotated-90-270');
      // Reset to CSS defaults
      this.img.style.maxWidth = '';
      this.img.style.maxHeight = '';
    }

    // Apply rotation, zoom, and pan transforms
    const {scale, translateX, translateY} = this.zoomState;
    this.img.style.transform = `
      translate(${translateX}px, ${translateY}px)
      scale(${scale})
      rotate(${ImageModalViewer.rotationDegrees}deg)
    `;
  }

  /**
   * Determine navigation direction based on tap position and image rotation
   * @param tapX - X coordinate of tap in viewport
   * @param tapY - Y coordinate of tap in viewport
   * @returns -1 for previous, 1 for next, 'fullscreen' for center tap, null for no action
   */
  private getNavigationFromTap(
    tapX: number,
    tapY: number
  ): -1 | 1 | 'fullscreen' | null {
    if (!this.img || !this.imageContainer) return null;

    // Get image bounds
    const imgRect = this.img.getBoundingClientRect();

    // Check if tap is within image bounds
    if (
      tapX < imgRect.left ||
      tapX > imgRect.right ||
      tapY < imgRect.top ||
      tapY > imgRect.bottom
    ) {
      return null; // Tap outside image
    }

    // Calculate relative position within image (0 to 1)
    const relX = (tapX - imgRect.left) / imgRect.width;
    const relY = (tapY - imgRect.top) / imgRect.height;

    // Define tap zones (30% on each edge for navigation, 40% center for fullscreen)
    const edgeZone = 0.3;

    // Determine which logical "side" was tapped based on rotation
    // For 0°: left = previous, right = next
    // For 90°: top = previous, bottom = next
    // For 180°: right = previous, left = next
    // For 270°: bottom = previous, top = next

    let isPrevious = false;
    let isNext = false;

    switch (ImageModalViewer.rotationDegrees) {
      case 0:
        // Normal orientation: left/right
        isPrevious = relX < edgeZone;
        isNext = relX > 1 - edgeZone;
        break;
      case 90:
        // Rotated 90° clockwise: visual left is physical top
        isPrevious = relY < edgeZone;
        isNext = relY > 1 - edgeZone;
        break;
      case 180:
        // Rotated 180°: visual left is physical right
        isPrevious = relX > 1 - edgeZone;
        isNext = relX < edgeZone;
        break;
      case 270:
        // Rotated 270° clockwise: visual left is physical bottom
        isPrevious = relY > 1 - edgeZone;
        isNext = relY < edgeZone;
        break;
      default:
        // Unknown rotation, use default left/right
        isPrevious = relX < edgeZone;
        isNext = relX > 1 - edgeZone;
    }

    if (isPrevious) return -1;
    if (isNext) return 1;
    return 'fullscreen'; // Center tap
  }

  /**
   * Check if device is mobile
   */
  private isMobile(): boolean {
    return window.innerWidth <= 768;
  }

  /**
   * Download an image (with iOS fallback)
   */
  private downloadImage(url: string, filename: string): void {
    if (this.isIOS()) {
      // iOS doesn't support download attribute, open in new tab instead
      window.open(url, '_blank');
      this.showToast(t('modal.openedForSaving'));
    } else {
      // Standard download for other platforms
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      this.showToast(t('modal.downloadStarted'));
    }
  }

  // Zoom and pan helpers
  private updateImageTransform(): void {
    if (!this.img) return;

    // Apply rotation and zoom transform
    this.applyImageTransform();
    this.img.style.transformOrigin = 'center center';

    // Update cursor based on zoom state
    const {scale} = this.zoomState;
    if (scale > this.MIN_ZOOM) {
      this.img.style.cursor = this.zoomState.isDragging ? 'grabbing' : 'grab';
      this.img.classList.add('zoomed');
    } else {
      this.img.style.cursor = 'zoom-in';
      this.img.classList.remove('zoomed');
    }

    // Update zoom indicator
    this.updateZoomIndicator();
  }

  private constrainToBounds(): void {
    if (!this.img || !this.imageContainer) return;

    if (this.zoomState.scale <= this.MIN_ZOOM) {
      this.zoomState.translateX = 0;
      this.zoomState.translateY = 0;
      return;
    }

    // With center transform origin, constraints are simpler
    const containerRect = this.imageContainer.getBoundingClientRect();

    // Calculate the actual displayed image dimensions (accounting for object-fit: contain)
    const imgAspect = this.img.naturalWidth / this.img.naturalHeight;
    const containerAspect = containerRect.width / containerRect.height;

    let displayedWidth: number;
    let displayedHeight: number;

    if (imgAspect > containerAspect) {
      // Image is wider - fits to width
      displayedWidth = containerRect.width;
      displayedHeight = containerRect.width / imgAspect;
    } else {
      // Image is taller - fits to height
      displayedHeight = containerRect.height;
      displayedWidth = containerRect.height * imgAspect;
    }

    // When scaled, how much does the image extend beyond its original size?
    const scaledWidth = displayedWidth * this.zoomState.scale;
    const scaledHeight = displayedHeight * this.zoomState.scale;

    // Maximum distance the image center can move from container center
    // This ensures edges of scaled image align with container edges
    const maxX = Math.max(0, (scaledWidth - containerRect.width) / 2);
    const maxY = Math.max(0, (scaledHeight - containerRect.height) / 2);

    // Constrain the translation
    this.zoomState.translateX = Math.max(
      -maxX,
      Math.min(maxX, this.zoomState.translateX)
    );
    this.zoomState.translateY = Math.max(
      -maxY,
      Math.min(maxY, this.zoomState.translateY)
    );
  }

  private resetZoom(): void {
    this.zoomState.scale = this.MIN_ZOOM;
    this.zoomState.translateX = 0;
    this.zoomState.translateY = 0;
    this.updateImageTransform();
  }

  private applyMomentum(): void {
    if (!this.img) return;

    const friction = 0.92; // Deceleration factor
    const minVelocity = 0.1;

    const animate = () => {
      // Apply velocity to translation
      this.zoomState.translateX += this.zoomState.velocityX * 16; // 16ms per frame
      this.zoomState.translateY += this.zoomState.velocityY * 16;

      // Apply friction
      this.zoomState.velocityX *= friction;
      this.zoomState.velocityY *= friction;

      // Constrain bounds
      this.constrainToBounds();
      this.updateImageTransform();

      // Continue animation if velocity is significant
      if (
        Math.abs(this.zoomState.velocityX) > minVelocity ||
        Math.abs(this.zoomState.velocityY) > minVelocity
      ) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  private zoomTo(
    newScale: number,
    centerX?: number,
    centerY?: number,
    animate = true
  ): void {
    if (!this.img || !this.imageContainer) return;

    const oldScale = this.zoomState.scale;
    newScale = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, newScale));

    if (
      centerX !== undefined &&
      centerY !== undefined &&
      oldScale !== newScale
    ) {
      // With center transform origin, the math is much simpler
      const containerRect = this.imageContainer.getBoundingClientRect();

      // Get the click point relative to the container center
      const clickX = centerX - (containerRect.left + containerRect.width / 2);
      const clickY = centerY - (containerRect.top + containerRect.height / 2);

      // Calculate how this point moves when we scale
      const scaleRatio = newScale / oldScale;

      // The point on the image that was clicked needs to stay in the same place
      // So we adjust the translation to compensate for the scale change
      this.zoomState.translateX =
        clickX + (this.zoomState.translateX - clickX) * scaleRatio;
      this.zoomState.translateY =
        clickY + (this.zoomState.translateY - clickY) * scaleRatio;
    }

    this.zoomState.scale = newScale;
    this.constrainToBounds();

    // Add smooth transition for zoom
    if (animate) {
      this.img.classList.add('zooming');
      setTimeout(() => {
        this.img?.classList.remove('zooming');
      }, 300);
    }

    this.updateImageTransform();
  }

  private updateZoomIndicator(): void {
    if (!this.zoomIndicator) return;

    if (this.zoomState.scale === this.MIN_ZOOM) {
      this.zoomIndicator.style.display = 'none';
      return;
    }

    const zoomPercent = Math.round(this.zoomState.scale * 100);
    this.zoomIndicator.textContent = `${zoomPercent}%`;
    this.zoomIndicator.style.display = 'block';

    // Auto-hide after 1 second
    if (this.zoomIndicatorTimeout !== null) {
      clearTimeout(this.zoomIndicatorTimeout);
    }
    this.zoomIndicatorTimeout = window.setTimeout(() => {
      if (this.zoomIndicator) {
        this.zoomIndicator.style.display = 'none';
      }
    }, 1000);
  }

  private getTouchDistance(touch1: Touch, touch2: Touch): number {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Close the modal viewer
   */
  public close(): void {
    // Exit fullscreen if currently in fullscreen mode
    if (this.isFullscreen) {
      this.exitFullscreen();
    }

    // Clean up event handlers (must match capture flag used in addEventListener)
    if (this.boundHandlers.keydown) {
      document.removeEventListener('keydown', this.boundHandlers.keydown, true);
    }
    if (this.boundHandlers.mousemove) {
      document.removeEventListener('mousemove', this.boundHandlers.mousemove);
    }
    if (this.boundHandlers.mouseup) {
      document.removeEventListener('mouseup', this.boundHandlers.mouseup);
    }
    if (this.boundHandlers.fullscreenchange) {
      document.removeEventListener(
        'fullscreenchange',
        this.boundHandlers.fullscreenchange
      );
      document.removeEventListener(
        'webkitfullscreenchange',
        this.boundHandlers.fullscreenchange
      );
      document.removeEventListener(
        'mozfullscreenchange',
        this.boundHandlers.fullscreenchange
      );
      document.removeEventListener(
        'MSFullscreenChange',
        this.boundHandlers.fullscreenchange
      );
    }

    // Clear timeout
    if (this.zoomIndicatorTimeout !== null) {
      clearTimeout(this.zoomIndicatorTimeout);
    }

    // Remove modal from DOM
    if (this.backdrop) {
      this.backdrop.remove();
    }

    // Restore background scroll
    document.body.classList.remove('ai-img-modal-open');

    // Call close callback
    this.onClose?.();

    logger.debug('Modal viewer closed');
  }

  /**
   * Update images in the modal (for dynamic updates)
   */
  public updateImages(images: ModalImage[]): void {
    this.images = images;
    // Ensure current index is still valid
    if (this.currentIndex >= images.length) {
      this.currentIndex = images.length - 1;
    }
    this.updateDisplay(false);
  }
}

/**
 * Open an image modal viewer
 */
export function openImageModal(options: ModalViewerOptions): ImageModalViewer {
  return new ImageModalViewer(options);
}
