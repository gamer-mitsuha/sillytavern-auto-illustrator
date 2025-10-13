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
  lastTapTime: number;
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

  // Zoom state
  private zoomState: ZoomState = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    lastTouchDistance: 0,
    lastTapTime: 0,
  };

  // Constants
  private readonly MIN_ZOOM = 1;
  private readonly MAX_ZOOM = 3;
  private readonly ZOOM_STEP = 0.1;
  private readonly DOUBLE_TAP_DELAY = 300; // ms

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
    if (!this.backdrop || !this.container || !this.img || !this.imageContainer) {
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

    // Keyboard navigation
    this.boundHandlers.keydown = ((e: KeyboardEvent) => {
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
      }
    }) as EventListener;
    document.addEventListener('keydown', this.boundHandlers.keydown);

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

    // Desktop: Double-click to zoom
    this.imageContainer.addEventListener('dblclick', (e: MouseEvent) => {
      e.preventDefault();
      if (this.zoomState.scale > this.MIN_ZOOM) {
        this.resetZoom();
      } else {
        this.zoomTo(2, e.clientX, e.clientY);
      }
    });

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

        // Handle double tap
        const now = Date.now();
        if (now - this.zoomState.lastTapTime < this.DOUBLE_TAP_DELAY) {
          e.preventDefault();
          if (this.zoomState.scale > this.MIN_ZOOM) {
            this.resetZoom();
          } else {
            this.zoomTo(2, touches[0].clientX, touches[0].clientY);
          }
        }
        this.zoomState.lastTapTime = now;

        // Start pan if zoomed
        if (this.zoomState.scale > this.MIN_ZOOM) {
          this.zoomState.isDragging = true;
          this.zoomState.dragStartX = touches[0].clientX - this.zoomState.translateX;
          this.zoomState.dragStartY = touches[0].clientY - this.zoomState.translateY;
        }
      } else if (touches.length === 2) {
        // Two fingers - pinch zoom
        e.preventDefault();
        this.zoomState.lastTouchDistance = this.getTouchDistance(touches[0], touches[1]);
      }
    });

    this.imageContainer.addEventListener('touchmove', (e: TouchEvent) => {
      touches = Array.from(e.touches);

      if (touches.length === 1 && this.zoomState.isDragging) {
        // Panning
        e.preventDefault();
        this.zoomState.translateX = touches[0].clientX - this.zoomState.dragStartX;
        this.zoomState.translateY = touches[0].clientY - this.zoomState.dragStartY;
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

        this.zoomTo(newScale, centerX, centerY);
        this.zoomState.lastTouchDistance = distance;
      }
    });

    this.imageContainer.addEventListener('touchend', (e: TouchEvent) => {
      const remainingTouches = Array.from(e.touches);

      if (remainingTouches.length === 0) {
        // Check for swipe
        if (this.zoomState.scale <= this.MIN_ZOOM && !this.zoomState.isDragging) {
          const touchEndX = e.changedTouches[0].clientX;
          const touchEndY = e.changedTouches[0].clientY;
          const deltaX = touchEndX - swipeStartX;
          const deltaY = touchEndY - swipeStartY;

          // Detect horizontal swipe (threshold: 50px, max vertical: 100px)
          if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 100) {
            if (deltaX > 0) {
              this.navigate(-1); // Swipe right -> previous
            } else {
              this.navigate(1); // Swipe left -> next
            }
          }
        }

        this.zoomState.isDragging = false;
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
   * Update the modal display
   */
  private updateDisplay(changeImage = true): void {
    if (!this.img || !this.meta || !this.promptDiv) return;

    const currentImage = this.images[this.currentIndex];

    if (changeImage) {
      this.img.src = currentImage.imageUrl;
      this.img.alt = currentImage.promptPreview;
      this.resetZoom();
      this.promptDiv.textContent = currentImage.promptText;
    }

    // Update metadata
    this.meta.innerHTML = `
      <div class="ai-img-modal-meta-item">
        <span class="ai-img-modal-meta-label">
          ${t('progress.imageIndex', {
            current: String(this.currentIndex + 1),
            total: String(this.images.length)
          })}
        </span>
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

    const resetZoomBtn = this.meta.querySelector('.reset-zoom-btn') as HTMLButtonElement;
    const downloadBtn = this.meta.querySelector('.download-btn');
    const openTabBtn = this.meta.querySelector('.open-tab-btn');

    // Show/hide reset button based on zoom state
    const updateResetButton = () => {
      if (resetZoomBtn) {
        resetZoomBtn.style.display = this.zoomState.scale > this.MIN_ZOOM ? 'flex' : 'none';
      }
    };
    updateResetButton();

    resetZoomBtn?.addEventListener('click', () => {
      this.resetZoom();
      updateResetButton();
    });

    downloadBtn?.addEventListener('click', () => {
      const currentImage = this.images[this.currentIndex];
      this.downloadImage(currentImage.imageUrl, `image-${this.currentIndex + 1}.png`);
    });

    openTabBtn?.addEventListener('click', () => {
      try {
        const currentImage = this.images[this.currentIndex];
        window.open(currentImage.imageUrl, '_blank', 'noopener,noreferrer');
      } catch (e) {
        logger.warn('Failed to open image in new tab', e);
      }
    });
  }

  /**
   * Download an image
   */
  private downloadImage(url: string, filename: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Zoom and pan helpers
  private updateImageTransform(): void {
    if (!this.img) return;

    const {scale, translateX, translateY} = this.zoomState;
    this.img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    this.img.style.transformOrigin = '0 0';

    // Update cursor based on zoom state
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

    const containerRect = this.imageContainer.getBoundingClientRect();
    const naturalWidth = this.img.naturalWidth;
    const naturalHeight = this.img.naturalHeight;
    const scaledWidth = naturalWidth * this.zoomState.scale;
    const scaledHeight = naturalHeight * this.zoomState.scale;

    const maxX = Math.max(0, (scaledWidth - containerRect.width) / 2);
    const maxY = Math.max(0, (scaledHeight - containerRect.height) / 2);

    this.zoomState.translateX = Math.max(-maxX, Math.min(maxX, this.zoomState.translateX));
    this.zoomState.translateY = Math.max(-maxY, Math.min(maxY, this.zoomState.translateY));
  }

  private resetZoom(): void {
    this.zoomState.scale = this.MIN_ZOOM;
    this.zoomState.translateX = 0;
    this.zoomState.translateY = 0;
    this.updateImageTransform();
  }

  private zoomTo(newScale: number, centerX?: number, centerY?: number): void {
    if (!this.img) return;

    const oldScale = this.zoomState.scale;
    newScale = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, newScale));

    if (centerX !== undefined && centerY !== undefined) {
      const rect = this.img.getBoundingClientRect();
      const offsetX = centerX - rect.left;
      const offsetY = centerY - rect.top;

      this.zoomState.translateX -= offsetX * (newScale / oldScale - 1);
      this.zoomState.translateY -= offsetY * (newScale / oldScale - 1);
    }

    this.zoomState.scale = newScale;
    this.constrainToBounds();
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
    // Clean up event handlers
    if (this.boundHandlers.keydown) {
      document.removeEventListener('keydown', this.boundHandlers.keydown);
    }
    if (this.boundHandlers.mousemove) {
      document.removeEventListener('mousemove', this.boundHandlers.mousemove);
    }
    if (this.boundHandlers.mouseup) {
      document.removeEventListener('mouseup', this.boundHandlers.mouseup);
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