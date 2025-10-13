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
import {getMetadata} from './prompt_metadata';
import {extractImagePrompts} from './image_extractor';
import {DEFAULT_PROMPT_DETECTION_PATTERNS} from './constants';
import {openImageModal, type ModalImage} from './modal_viewer';
import type {
  ProgressManager,
  ProgressImageCompletedEventDetail,
} from './progress_manager';

const logger = createLogger('GalleryWidget');

/**
 * Represents a single image in the gallery
 */
interface GalleryImage {
  imageUrl: string;
  promptText: string;
  promptPreview: string;
  messageId: number;
  imageIndex: number; // Index within the message (0-based)
}

/**
 * Represents a group of images from a single message
 */
interface MessageGalleryGroup {
  messageId: number;
  messagePreview: string; // First 100 chars of message text
  images: GalleryImage[];
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
    if (!context?.chat_metadata) {
      return null;
    }

    const metadata = getMetadata(context);

    // Initialize gallery widget state if doesn't exist
    if (!metadata.galleryWidget) {
      metadata.galleryWidget = {
        visible: true, // Default visible for new chats
        minimized: false,
        expandedMessages: [],
      };
      context.saveChat();
    }

    return metadata.galleryWidget;
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

        logger.debug(
          `Loaded gallery state from chat: visible=${this.isWidgetVisible}, minimized=${this.isWidgetMinimized}`
        );
      }
    } catch (error) {
      logger.warn('Failed to load gallery widget state:', error);
    }
  }

  /**
   * Save current state to chat metadata
   */
  private saveStateToChatMetadata(): void {
    try {
      const state = this.getGalleryState();
      if (state) {
        state.visible = this.isWidgetVisible;
        state.minimized = this.isWidgetMinimized;
        state.expandedMessages = Array.from(this.messageGroups.entries())
          .filter(([, group]) => group.isExpanded)
          .map(([messageId]) => messageId);

        const context = (window as any).SillyTavern?.getContext?.();
        context?.saveChat();

        logger.trace('Saved gallery widget state to chat metadata');
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
    // Listen for new images being completed
    this.progressManager.addEventListener('progress:image-completed', event => {
      const detail = (event as CustomEvent<ProgressImageCompletedEventDetail>)
        .detail;
      logger.debug(
        `Gallery notified of new image for message ${detail.messageId}`
      );
      // Rescan chat to update gallery
      this.refreshGallery();
    });

    // Listen for chat changes (when user switches to a different chat)
    const context = (window as any).SillyTavern?.getContext?.();
    if (context?.eventTypes?.CHAT_CHANGED && context?.eventSource) {
      context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => {
        logger.debug('CHAT_CHANGED - reloading gallery widget state');
        // Reload state from new chat's metadata
        this.loadStateFromChatMetadata();
        // Rescan new chat for images
        this.refreshGallery();
      });
    }

    // Listen for message edits (images might be added/removed)
    if (context?.eventTypes?.MESSAGE_EDITED && context?.eventSource) {
      context.eventSource.on(context.eventTypes.MESSAGE_EDITED, () => {
        logger.debug('MESSAGE_EDITED - rescanning chat for new images');
        // Rescan chat to catch any new images added via manual generation
        this.refreshGallery();
      });
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
      const images = this.extractImagesFromMessage(messageText, messageId);

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
   * Extract images from a message text
   */
  private extractImagesFromMessage(
    messageText: string,
    messageId: number
  ): GalleryImage[] {
    const images: GalleryImage[] = [];

    // Use existing proven image prompt extraction (handles all 3 formats)
    const prompts = extractImagePrompts(
      messageText,
      DEFAULT_PROMPT_DETECTION_PATTERNS
    );

    logger.trace(
      `Message ${messageId}: extractImagePrompts found ${prompts.length} prompts`
    );

    // For each prompt, find the immediately following img tag(s)
    for (let promptIndex = 0; promptIndex < prompts.length; promptIndex++) {
      const prompt = prompts[promptIndex];
      const afterPrompt = messageText.substring(prompt.endIndex);

      logger.trace(
        `Message ${messageId}, prompt ${promptIndex}: afterPrompt starts with: "${afterPrompt.substring(0, 100)}"`
      );

      // Match img tag immediately after prompt (with optional whitespace)
      // Changed [^>]+ to [^>]* to allow src= to come immediately after <img
      const imgMatch = /^\s*<img\s+[^>]*src=["']([^"']+)["'][^>]*>/.exec(
        afterPrompt
      );

      logger.trace(
        `Message ${messageId}, prompt ${promptIndex}: imgMatch = ${imgMatch ? 'FOUND' : 'NULL'}`
      );

      if (imgMatch) {
        const imageUrl = imgMatch[1];
        const promptPreview =
          prompt.prompt.length > 50
            ? prompt.prompt.substring(0, 50) + '...'
            : prompt.prompt;

        images.push({
          imageUrl,
          promptText: prompt.prompt,
          promptPreview,
          messageId,
          imageIndex: promptIndex,
        });

        logger.trace(
          `Found image in message ${messageId}: ${imageUrl.substring(0, 50)}...`
        );
      }
    }

    return images;
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

    // Clear existing content
    widget.innerHTML = '';

    if (this.isWidgetMinimized) {
      widget.classList.add('minimized');
      this.renderMinimizedWidget(widget);
    } else {
      widget.classList.remove('minimized');
      this.renderExpandedWidget(widget);
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
      this.updateDisplay();
    });
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
    header.innerHTML = `
      <div class="ai-img-gallery-title">
        <i class="ai-img-gallery-icon fa-solid fa-images"></i>
        <span>${t('gallery.title')}</span>
        <span class="ai-img-gallery-count">(${totalImages} ${t('gallery.images')})</span>
      </div>
      <div class="ai-img-gallery-actions">
        <button class="ai-img-gallery-btn view-all-btn" title="${t('gallery.viewAll')}"><i class="fa-solid fa-eye"></i></button>
        <button class="ai-img-gallery-btn minimize-btn" title="${t('gallery.minimize')}"><i class="fa-solid fa-minus"></i></button>
      </div>
    `;
    widget.appendChild(header);

    // Add button event listeners
    const minimizeBtn = header.querySelector('.minimize-btn');
    minimizeBtn?.addEventListener('click', () => {
      this.isWidgetMinimized = true;
      this.saveStateToChatMetadata();
      this.updateDisplay();
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
      // Render message groups (reverse order: newest first)
      const groups = Array.from(this.messageGroups.values()).reverse();
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
      this.updateDisplay();
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
   * Show image modal viewer for a specific message group
   */
  private showImageModal(
    group: MessageGalleryGroup,
    initialIndex: number
  ): void {
    logger.debug(
      `Opening image modal for message ${group.messageId}, image ${initialIndex + 1}/${group.images.length}`
    );

    // Convert gallery images to modal images format
    const modalImages: ModalImage[] = group.images.map(img => ({
      imageUrl: img.imageUrl,
      promptText: img.promptText,
      promptPreview: img.promptPreview,
      messageId: img.messageId,
      imageIndex: img.imageIndex,
    }));

    // Open the modal viewer
    openImageModal({
      images: modalImages,
      initialIndex,
      title: t('gallery.imageViewer'),
      onClose: () => {
        logger.debug('Gallery modal closed');
      },
      onNavigate: (newIndex: number) => {
        logger.trace(
          `Gallery modal navigated to image ${newIndex + 1}/${modalImages.length}`
        );
      },
    });
  }

  /**
   * Show all images from all messages in a single modal
   */
  private showAllImagesModal(): void {
    // Collect all images from all message groups (newest first)
    const allImages: ModalImage[] = [];
    const groups = Array.from(this.messageGroups.values()).reverse();

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
