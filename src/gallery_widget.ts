/**
 * Gallery Widget Module
 * Displays all generated images in the current chat, grouped by messages
 *
 * Architecture: Permanent widget separate from progress widget
 * - Scans chat messages to find all generated images
 * - Groups images by assistant message
 * - Provides thumbnail grid and modal viewer
 * - Reuses UI components from progress widget for consistency
 */

import {createLogger} from './logger';
import {t} from './i18n';
import {openImageModal, type ModalImage} from './modal_viewer';
import type {
  ProgressManager,
  ProgressImageCompletedEventDetail,
} from './progress_manager';
import {extractImagesFromMessage} from './image_utils';

const logger = createLogger('GalleryWidget');

/**
 * Represents a group of images from a single message
 */
interface MessageGalleryGroup {
  messageId: number;
  messagePreview: string; // First 100 chars of message text
  images: ModalImage[];
  isExpanded: boolean;
}

/**
 * Gallery Widget View
 * Displays all generated images grouped by messages
 */
export class GalleryWidgetView {
  private progressManager: ProgressManager;
  private messageGroups: Map<number, MessageGalleryGroup> = new Map();
  private isWidgetVisible = true; // Default visible for new chats
  private isWidgetMinimized = false;
  private messageOrder: 'newest-first' | 'oldest-first' = 'newest-first';

  constructor(manager: ProgressManager) {
    this.progressManager = manager;
    this.loadStateFromChatMetadata();
    this.setupEventListeners();
    logger.debug('GalleryWidgetView initialized');
  }

  /**
   * Get gallery widget state from chat metadata
   */
  private getGalleryState() {
    const context = (window as any).SillyTavern?.getContext?.();
    if (!context) {
      return null;
    }

    // Use proper SillyTavern API to access chat metadata
    const {chatMetadata} = context;
    if (!chatMetadata) {
      return null;
    }

    // Ensure auto_illustrator subobject exists
    if (!chatMetadata.auto_illustrator) {
      chatMetadata.auto_illustrator = {};
    }

    // Initialize gallery widget state if doesn't exist
    if (!chatMetadata.auto_illustrator.galleryWidget) {
      logger.info(
        '[Gallery] Initializing new gallery widget state in metadata'
      );
      chatMetadata.auto_illustrator.galleryWidget = {
        visible: true, // Default visible for new chats
        minimized: false,
        expandedMessages: [],
        messageOrder: 'newest-first',
      };
    }

    // Ensure messageOrder exists (for backwards compatibility)
    if (!chatMetadata.auto_illustrator.galleryWidget.messageOrder) {
      chatMetadata.auto_illustrator.galleryWidget.messageOrder = 'newest-first';
    }

    // Log the actual state we're returning from metadata
    logger.trace(
      `[Gallery] getGalleryState returning: ${JSON.stringify(chatMetadata.auto_illustrator.galleryWidget)}`
    );
    return chatMetadata.auto_illustrator.galleryWidget;
  }

  /**
   * Load saved state from chat metadata
   */
  private loadStateFromChatMetadata(): void {
    try {
      const state = this.getGalleryState();
      if (state) {
        this.isWidgetVisible = state.visible;
        this.isWidgetMinimized = state.minimized;
        this.messageOrder = state.messageOrder || 'newest-first';

        logger.info(
          `[Gallery] Loaded state from chat metadata: visible=${this.isWidgetVisible}, minimized=${this.isWidgetMinimized}, messageOrder=${this.messageOrder}, expandedMessages=${state.expandedMessages?.length || 0}`
        );
      } else {
        logger.warn('[Gallery] No state found in chat metadata');
      }
    } catch (error) {
      logger.warn('Failed to load gallery widget state:', error);
    }
  }

  /**
   * Save current state to chat metadata
   */
  private async saveStateToChatMetadata(): Promise<void> {
    try {
      const state = this.getGalleryState();
      if (state) {
        state.visible = this.isWidgetVisible;
        state.minimized = this.isWidgetMinimized;
        state.messageOrder = this.messageOrder;
        state.expandedMessages = Array.from(this.messageGroups.entries())
          .filter(([, group]) => group.isExpanded)
          .map(([messageId]) => messageId);

        // Use proper SillyTavern API to save metadata
        const context = (window as any).SillyTavern?.getContext?.();
        if (context?.saveMetadata) {
          await context.saveMetadata();

          logger.info(
            `[Gallery] Saved state to chat metadata: visible=${this.isWidgetVisible}, minimized=${this.isWidgetMinimized}, messageOrder=${this.messageOrder}, expandedMessages=${state.expandedMessages.length}`
          );
        } else {
          logger.warn(
            '[Gallery] Cannot save metadata - saveMetadata function not available'
          );
        }
      } else {
        logger.warn('[Gallery] Cannot save state - no chat metadata available');
      }
    } catch (error) {
      logger.warn('Failed to save gallery widget state:', error);
    }
  }

  /**
   * Load expanded messages state from chat metadata
   */
  private loadExpandedState(): Set<number> {
    try {
      const state = this.getGalleryState();
      if (state && state.expandedMessages) {
        return new Set(state.expandedMessages);
      }
    } catch (error) {
      logger.warn('Failed to load expanded messages state:', error);
    }
    return new Set<number>();
  }

  /**
   * Setup event listeners for auto-updates
   */
  private setupEventListeners(): void {
    // Listen for new images being completed during streaming (for live preview)
    this.progressManager.addEventListener('progress:image-completed', event => {
      const detail = (event as CustomEvent<ProgressImageCompletedEventDetail>)
        .detail;
      logger.debug(
        `Gallery notified of new image for message ${detail.messageId}`
      );
      // Rescan chat to update gallery
      this.refreshGallery();
    });

    const context = (window as any).SillyTavern?.getContext?.();

    // Listen for MESSAGE_EDITED event (when images are inserted into messages)
    // This catches regeneration and any other message modifications
    if (context?.eventTypes?.MESSAGE_EDITED && context?.eventSource) {
      context.eventSource.on(
        context.eventTypes.MESSAGE_EDITED,
        (messageId: number) => {
          logger.debug(
            `Gallery notified of MESSAGE_EDITED for message ${messageId}`
          );
          // Rescan chat to update gallery with newly inserted images
          this.refreshGallery();
        }
      );
      logger.info(
        '[Gallery] Successfully registered MESSAGE_EDITED event listener'
      );
    } else {
      logger.warn(
        '[Gallery] Could not register MESSAGE_EDITED listener - event system not available'
      );
    }

    // Listen for chat changes (when user switches to a different chat)
    if (context?.eventTypes?.CHAT_CHANGED && context?.eventSource) {
      context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => {
        logger.info(
          '=== [Gallery] CHAT_CHANGED EVENT FIRED - reloading gallery widget state ==='
        );
        // Reload state from new chat's metadata
        this.loadStateFromChatMetadata();
        // Rescan new chat for images
        this.refreshGallery();
      });
      logger.info(
        '[Gallery] Successfully registered CHAT_CHANGED event listener'
      );
    } else {
      logger.warn(
        '[Gallery] Could not register CHAT_CHANGED listener - event system not available'
      );
    }

    logger.debug('Gallery event listeners setup complete');
  }

  /**
   * Toggle gallery widget visibility
   */
  public toggleVisibility(): void {
    this.isWidgetVisible = !this.isWidgetVisible;
    this.saveStateToChatMetadata();
    this.updateDisplay();
    logger.debug(`Gallery visibility toggled: ${this.isWidgetVisible}`);
  }

  /**
   * Show the gallery widget
   */
  public show(): void {
    this.isWidgetVisible = true;
    this.saveStateToChatMetadata();
    this.refreshGallery();
    logger.debug('Gallery widget shown');
  }

  /**
   * Hide the gallery widget
   */
  public hide(): void {
    this.isWidgetVisible = false;
    this.saveStateToChatMetadata();
    this.updateDisplay();
    logger.debug('Gallery widget hidden');
  }

  /**
   * Refresh gallery by rescanning chat
   */
  public refreshGallery(): void {
    logger.debug('Refreshing gallery...');
    this.scanChatForImages();
    this.updateDisplay();
  }

  /**
   * Scan chat messages to extract all generated images
   */
  private scanChatForImages(): void {
    // Get SillyTavern context
    const context = (window as any).SillyTavern?.getContext?.();
    if (!context?.chat) {
      logger.warn('Cannot scan chat: SillyTavern context not available');
      return;
    }

    const chat = context.chat as any[];
    const newGroups = new Map<number, MessageGalleryGroup>();

    // Load previously expanded state
    const expandedMessages = this.loadExpandedState();

    // Scan each message
    for (let messageId = 0; messageId < chat.length; messageId++) {
      const message = chat[messageId];

      logger.trace(
        `Scanning message ${messageId}: is_user=${message.is_user}, is_system=${message.is_system}, mes_length=${message.mes?.length || 0}`
      );

      // Only process assistant messages
      if (message.is_user || message.is_system) {
        continue;
      }

      const messageText = message.mes || '';
      const images = extractImagesFromMessage(messageText, messageId);

      logger.trace(`Message ${messageId}: found ${images.length} images`);

      if (images.length > 0) {
        // Create message preview (first 100 chars, strip HTML)
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = messageText;
        const plainText = tempDiv.textContent || tempDiv.innerText || '';
        const messagePreview =
          plainText.substring(0, 100) + (plainText.length > 100 ? '...' : '');

        newGroups.set(messageId, {
          messageId,
          messagePreview,
          images,
          isExpanded:
            expandedMessages.has(messageId) ||
            this.messageGroups.get(messageId)?.isExpanded ||
            false,
        });
      }
    }

    this.messageGroups = newGroups;
    logger.debug(
      `Scanned chat: found ${newGroups.size} messages with images (${Array.from(newGroups.values()).reduce((sum, group) => sum + group.images.length, 0)} total images)`
    );
  }

  /**
   * Get message groups in the configured display order
   */
  private getOrderedMessageGroups(): MessageGalleryGroup[] {
    const groups = Array.from(this.messageGroups.values());
    // Newest first is the reverse of natural order (lower message IDs are older)
    return this.messageOrder === 'newest-first' ? groups.reverse() : groups;
  }

  /**
   * Immediately updates the display, bypassing any throttle
   * Used for user-triggered actions that need immediate feedback
   */
  private updateImmediately(): void {
    this.updateDisplay();
  }

  /**
   * Update the gallery display
   */
  private updateDisplay(): void {
    const widget = this.getOrCreateGalleryWidget();

    // Check if we're in an active chat session
    const context = (window as any).SillyTavern?.getContext?.();
    const hasActiveChat =
      context?.chat && Array.isArray(context.chat) && context.chat.length > 0;

    // Hide widget if no active chat or if explicitly hidden by user
    if (!hasActiveChat || !this.isWidgetVisible) {
      widget.style.display = 'none';
      logger.trace(
        hasActiveChat
          ? 'Gallery widget hidden by user'
          : 'Gallery widget hidden - no active chat'
      );
      return;
    }

    widget.style.display = 'flex';

    // Check if we need a full rebuild (minimize state changed or first render)
    const currentMinimizedState = widget.classList.contains('minimized');
    const needsFullRebuild =
      currentMinimizedState !== this.isWidgetMinimized ||
      widget.children.length === 0;

    if (needsFullRebuild) {
      // Full rebuild needed
      widget.innerHTML = '';

      if (this.isWidgetMinimized) {
        widget.classList.add('minimized');
        this.renderMinimizedWidget(widget);
      } else {
        widget.classList.remove('minimized');
        this.renderExpandedWidget(widget);
      }
    } else {
      // Smart update - only update changed parts
      if (this.isWidgetMinimized) {
        this.updateMinimizedWidget(widget);
      } else {
        this.updateExpandedWidget(widget);
      }
    }

    logger.trace('Gallery widget display updated');
  }

  /**
   * Render minimized widget (FAB button)
   */
  private renderMinimizedWidget(widget: HTMLElement): void {
    const totalImages = Array.from(this.messageGroups.values()).reduce(
      (sum, group) => sum + group.images.length,
      0
    );

    widget.innerHTML = `
      <button class="ai-img-gallery-fab" title="${t('gallery.expand')}">
        <i class="ai-img-gallery-fab-icon fa-solid fa-images"></i>
        <span class="ai-img-gallery-fab-badge">${totalImages}</span>
      </button>
    `;

    const fab = widget.querySelector('.ai-img-gallery-fab');
    fab?.addEventListener('click', () => {
      this.isWidgetMinimized = false;
      this.saveStateToChatMetadata();
      this.updateImmediately();
    });
  }

  /**
   * Update minimized widget without full rebuild
   */
  private updateMinimizedWidget(widget: HTMLElement): void {
    const fab = widget.querySelector('.ai-img-gallery-fab');
    if (!fab) {
      // Fallback to full render if structure is missing
      this.renderMinimizedWidget(widget);
      return;
    }

    // Calculate total images
    const totalImages = Array.from(this.messageGroups.values()).reduce(
      (sum, group) => sum + group.images.length,
      0
    );

    // Update badge
    const badge = fab.querySelector('.ai-img-gallery-fab-badge');
    if (badge) {
      badge.textContent = String(totalImages);
    }
  }

  /**
   * Update expanded widget without full rebuild
   */
  private updateExpandedWidget(widget: HTMLElement): void {
    const header = widget.querySelector('.ai-img-gallery-header');
    const content = widget.querySelector('.ai-img-gallery-content');

    if (!header || !content) {
      // Fallback to full render if structure is missing
      this.renderExpandedWidget(widget);
      return;
    }

    // Update total image count in header
    const totalImages = Array.from(this.messageGroups.values()).reduce(
      (sum, group) => sum + group.images.length,
      0
    );
    const countElement = header.querySelector('.ai-img-gallery-count');
    if (countElement) {
      countElement.textContent = `(${totalImages} ${t('gallery.images')})`;
    }

    // Update message groups
    this.updateMessageGroups(content as HTMLElement);
  }

  /**
   * Update message groups in the gallery content
   */
  private updateMessageGroups(content: HTMLElement): void {
    // Create a map of existing group elements
    const existingGroups = new Map<number, HTMLElement>();
    content.querySelectorAll('.ai-img-gallery-message-group').forEach(elem => {
      const messageId = elem.getAttribute('data-message-id');
      if (messageId) {
        existingGroups.set(parseInt(messageId, 10), elem as HTMLElement);
      }
    });

    if (this.messageGroups.size === 0) {
      // No images - show empty state
      content.innerHTML = `<div class="ai-img-gallery-empty">${t('gallery.noImages')}</div>`;
      return;
    }

    // Get groups in display order
    const groups = this.getOrderedMessageGroups();
    const groupIds = new Set(groups.map(g => g.messageId));

    // Remove groups that no longer exist
    for (const [messageId, element] of existingGroups.entries()) {
      if (!groupIds.has(messageId)) {
        element.remove();
        existingGroups.delete(messageId);
      }
    }

    // Update or create each group in order
    let previousElement: HTMLElement | null = null;
    for (const group of groups) {
      let groupElement = existingGroups.get(group.messageId);

      if (!groupElement) {
        // Create new group element
        groupElement = this.renderMessageGroup(group);

        // Insert in correct position
        if (previousElement) {
          previousElement.after(groupElement);
        } else {
          content.prepend(groupElement);
        }
      } else {
        // Update existing group
        this.updateMessageGroupInPlace(groupElement, group);

        // Ensure element is in correct position
        if (previousElement) {
          if (previousElement.nextElementSibling !== groupElement) {
            previousElement.after(groupElement);
          }
        } else {
          if (content.firstElementChild !== groupElement) {
            content.prepend(groupElement);
          }
        }
      }

      previousElement = groupElement;
    }
  }

  /**
   * Update a message group element in place (for expand/collapse)
   */
  private updateMessageGroupInPlace(
    groupElement: HTMLElement,
    group: MessageGalleryGroup
  ): void {
    const header = groupElement.querySelector('.ai-img-gallery-message-header');
    if (!header) return;

    // Update toggle icon
    const toggleBtn = header.querySelector('.ai-img-gallery-message-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = group.isExpanded ? '▼' : '▶';
    }

    // Update image count
    const countElement = header.querySelector('.ai-img-gallery-message-count');
    if (countElement) {
      countElement.textContent = `${group.images.length} ${t('gallery.images')}`;
    }

    // Handle gallery visibility
    let gallery = groupElement.querySelector('.ai-img-gallery-thumbnails');

    if (group.isExpanded) {
      groupElement.classList.add('expanded');
      if (!gallery) {
        // Create gallery if it doesn't exist
        gallery = this.createThumbnailGallery(group);
        groupElement.appendChild(gallery);
      }
    } else {
      groupElement.classList.remove('expanded');
      if (gallery) {
        // Remove gallery if collapsed
        gallery.remove();
      }
    }
  }

  /**
   * Render expanded widget with all message groups
   */
  private renderExpandedWidget(widget: HTMLElement): void {
    const totalImages = Array.from(this.messageGroups.values()).reduce(
      (sum, group) => sum + group.images.length,
      0
    );

    // Create header
    const header = document.createElement('div');
    header.className = 'ai-img-gallery-header';

    const orderIcon =
      this.messageOrder === 'newest-first'
        ? 'fa-arrow-down-9-1'
        : 'fa-arrow-down-1-9';
    const orderTitle =
      this.messageOrder === 'newest-first'
        ? t('gallery.sortOldestFirst')
        : t('gallery.sortNewestFirst');

    header.innerHTML = `
      <div class="ai-img-gallery-title">
        <i class="ai-img-gallery-icon fa-solid fa-images"></i>
        <span>${t('gallery.title')}</span>
        <span class="ai-img-gallery-count">(${totalImages} ${t('gallery.images')})</span>
      </div>
      <div class="ai-img-gallery-actions">
        <button class="ai-img-gallery-btn order-toggle-btn" title="${orderTitle}"><i class="fa-solid ${orderIcon}"></i></button>
        <button class="ai-img-gallery-btn view-all-btn" title="${t('gallery.viewAll')}"><i class="fa-solid fa-eye"></i></button>
        <button class="ai-img-gallery-btn minimize-btn" title="${t('gallery.minimize')}"><i class="fa-solid fa-minus"></i></button>
      </div>
    `;
    widget.appendChild(header);

    // Add button event listeners
    const orderToggleBtn = header.querySelector('.order-toggle-btn');
    orderToggleBtn?.addEventListener('click', () => {
      this.messageOrder =
        this.messageOrder === 'newest-first' ? 'oldest-first' : 'newest-first';
      this.saveStateToChatMetadata();
      this.updateImmediately();
    });

    const minimizeBtn = header.querySelector('.minimize-btn');
    minimizeBtn?.addEventListener('click', () => {
      this.isWidgetMinimized = true;
      this.saveStateToChatMetadata();
      this.updateImmediately();
    });

    const viewAllBtn = header.querySelector('.view-all-btn');
    viewAllBtn?.addEventListener('click', () => {
      this.showAllImagesModal();
    });

    // Create content container
    const content = document.createElement('div');
    content.className = 'ai-img-gallery-content';

    if (this.messageGroups.size === 0) {
      // No images found
      const emptyState = document.createElement('div');
      emptyState.className = 'ai-img-gallery-empty';
      emptyState.textContent = t('gallery.noImages');
      content.appendChild(emptyState);
    } else {
      // Render message groups in configured order
      const groups = this.getOrderedMessageGroups();
      for (const group of groups) {
        const groupElement = this.renderMessageGroup(group);
        content.appendChild(groupElement);
      }
    }

    widget.appendChild(content);
  }

  /**
   * Render a single message group
   */
  private renderMessageGroup(group: MessageGalleryGroup): HTMLElement {
    const container = document.createElement('div');
    container.className = 'ai-img-gallery-message-group';
    container.setAttribute('data-message-id', String(group.messageId));

    // Create group header
    const header = document.createElement('div');
    header.className = 'ai-img-gallery-message-header';

    const toggleIcon = group.isExpanded ? '▼' : '▶';
    header.innerHTML = `
      <button class="ai-img-gallery-message-toggle">${toggleIcon}</button>
      <div class="ai-img-gallery-message-info">
        <span class="ai-img-gallery-message-id">${t('gallery.messageNumber', {number: String(group.messageId + 1)})}</span>
        <span class="ai-img-gallery-message-preview">${group.messagePreview}</span>
      </div>
      <span class="ai-img-gallery-message-count">${group.images.length} ${t('gallery.images')}</span>
    `;
    container.appendChild(header);

    // Add toggle functionality
    header.addEventListener('click', () => {
      group.isExpanded = !group.isExpanded;
      this.saveStateToChatMetadata();
      this.updateImmediately();
    });

    // Create thumbnail gallery if expanded
    if (group.isExpanded) {
      const gallery = this.createThumbnailGallery(group);
      container.appendChild(gallery);
      container.classList.add('expanded');
    }

    return container;
  }

  /**
   * Create thumbnail gallery for a message group
   * Adapted from progress_widget.ts createThumbnailGallery
   */
  private createThumbnailGallery(group: MessageGalleryGroup): HTMLElement {
    const gallery = document.createElement('div');
    gallery.className = 'ai-img-gallery-thumbnails';

    for (let i = 0; i < group.images.length; i++) {
      const image = group.images[i];
      const thumbnail = document.createElement('div');
      thumbnail.className = 'ai-img-gallery-thumbnail';
      thumbnail.title = image.promptText;

      // Add index badge
      const indexBadge = document.createElement('div');
      indexBadge.className = 'ai-img-gallery-thumbnail-index';
      indexBadge.textContent = `${i + 1}/${group.images.length}`;
      thumbnail.appendChild(indexBadge);

      // Create img element
      const img = document.createElement('img');
      img.src = image.imageUrl;
      img.alt = image.promptPreview;
      img.loading = 'lazy';
      thumbnail.appendChild(img);

      // Add click handler to open modal
      thumbnail.addEventListener('click', () => {
        this.showImageModal(group, i);
      });

      gallery.appendChild(thumbnail);
    }

    return gallery;
  }

  /**
   * Show image modal viewer starting from a specific image
   * Opens global viewer with ALL chat images, not just from one message
   */
  private showImageModal(
    group: MessageGalleryGroup,
    initialIndexInGroup: number
  ): void {
    // Collect all images from all message groups in configured order
    const allImages: ModalImage[] = [];
    const groups = this.getOrderedMessageGroups();

    // Track which image was clicked to set initial index
    let initialIndex = 0;
    let foundClickedImage = false;

    for (const g of groups) {
      for (let i = 0; i < g.images.length; i++) {
        const img = g.images[i];

        // Check if this is the clicked image
        if (g.messageId === group.messageId && i === initialIndexInGroup) {
          initialIndex = allImages.length;
          foundClickedImage = true;
        }

        allImages.push({
          imageUrl: img.imageUrl,
          promptText: img.promptText,
          promptPreview: img.promptPreview,
          messageId: img.messageId,
          imageIndex: img.imageIndex,
        });
      }
    }

    if (allImages.length === 0) {
      logger.warn('No images to display in modal');
      return;
    }

    if (!foundClickedImage) {
      logger.warn(
        `Could not find clicked image (message ${group.messageId}, index ${initialIndexInGroup}), defaulting to first image`
      );
      initialIndex = 0;
    }

    logger.debug(
      `Opening global image viewer with ${allImages.length} images from ${groups.length} messages, starting at image ${initialIndex + 1}`
    );

    // Open the modal viewer with all images
    openImageModal({
      images: allImages,
      initialIndex,
      title: t('gallery.imageViewer'),
      onClose: () => {
        logger.debug('Global image viewer closed');
      },
      onNavigate: (newIndex: number) => {
        logger.trace(
          `Global viewer navigated to image ${newIndex + 1}/${allImages.length}`
        );
      },
    });
  }

  /**
   * Show all images from all messages in a single modal
   */
  private showAllImagesModal(): void {
    // Collect all images from all message groups in configured order
    const allImages: ModalImage[] = [];
    const groups = this.getOrderedMessageGroups();

    for (const group of groups) {
      for (const img of group.images) {
        allImages.push({
          imageUrl: img.imageUrl,
          promptText: img.promptText,
          promptPreview: img.promptPreview,
          messageId: img.messageId,
          imageIndex: img.imageIndex,
        });
      }
    }

    if (allImages.length === 0) {
      logger.warn('No images to display in modal');
      return;
    }

    logger.debug(
      `Opening modal with all ${allImages.length} images from ${groups.length} messages`
    );

    // Open the modal viewer with all images
    openImageModal({
      images: allImages,
      initialIndex: 0,
      title: t('gallery.allImages'),
      onClose: () => {
        logger.debug('All images modal closed');
      },
      onNavigate: (newIndex: number) => {
        logger.trace(
          `All images modal navigated to image ${newIndex + 1}/${allImages.length}`
        );
      },
    });
  }

  /**
   * Get or create the gallery widget element
   */
  private getOrCreateGalleryWidget(): HTMLElement {
    const existingWidget = document.getElementById('ai-img-gallery-global');
    if (existingWidget) {
      return existingWidget;
    }

    // Create new gallery widget
    const widget = document.createElement('div');
    widget.id = 'ai-img-gallery-global';
    widget.className = 'ai-img-gallery-widget-global';
    widget.style.display = 'none'; // Start hidden
    widget.setAttribute('role', 'complementary');
    widget.setAttribute('aria-label', 'Image Gallery');

    // Find #sheld to insert widget
    const sheld = document.getElementById('sheld');
    if (!sheld) {
      logger.error('Could not find #sheld, appending to body');
      document.body.appendChild(widget);
    } else {
      // Insert at the beginning of sheld (top of chat area)
      sheld.insertBefore(widget, sheld.firstChild);
      logger.debug('Created gallery widget and inserted into #sheld');
    }

    return widget;
  }
}

// Singleton gallery instance (initialized lazily)
let galleryInstance: GalleryWidgetView | null = null;

/**
 * Initialize the gallery widget
 */
export function initializeGalleryWidget(manager: ProgressManager): void {
  if (galleryInstance) {
    logger.warn('Gallery widget already initialized');
    return;
  }

  galleryInstance = new GalleryWidgetView(manager);
  logger.info('Gallery widget initialized');
}

/**
 * Get the gallery widget instance
 */
export function getGalleryWidget(): GalleryWidgetView | null {
  return galleryInstance;
}
