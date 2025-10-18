/**
 * Tests for StreamingPreviewWidget
 */

import {describe, it, expect, beforeEach, vi} from 'vitest';
import {StreamingPreviewWidget} from './streaming_preview_widget';
import {progressManager} from './progress_manager';

// Mock modules
vi.mock('./logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('./i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('./modal_viewer', () => ({
  openImageModal: vi.fn(),
}));

describe('StreamingPreviewWidget', () => {
  let widget: StreamingPreviewWidget;
  const mockPatterns = ['<img-prompt="([^"]+)">'];

  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = '';

    // Clear localStorage
    localStorage.clear();

    // Create widget instance
    widget = new StreamingPreviewWidget(progressManager, mockPatterns);
  });

  describe('initialization', () => {
    it('should create widget instance', () => {
      expect(widget).toBeDefined();
    });

    it('should not be visible initially', () => {
      const status = widget.getStatus();
      expect(status.isVisible).toBe(false);
    });

    it('should not be active initially', () => {
      expect(widget.isActive()).toBe(false);
    });
  });

  describe('start', () => {
    it('should start widget for a message', () => {
      widget.start(1);
      const status = widget.getStatus();
      expect(status.isVisible).toBe(true);
      expect(status.messageId).toBe(1);
    });

    it('should mark widget as active', () => {
      widget.start(1);
      expect(widget.isActive()).toBe(true);
    });
  });

  describe('updateText', () => {
    beforeEach(() => {
      widget.start(1);
    });

    it('should update with plain text', () => {
      widget.updateText('Hello world');
      const status = widget.getStatus();
      expect(status.segmentCount).toBeGreaterThan(0);
    });

    it('should detect image prompts in text', () => {
      widget.updateText('Some text <img-prompt="a cat"> more text');
      const status = widget.getStatus();
      // Should create segments: text, image, text
      expect(status.segmentCount).toBe(3);
    });

    it('should handle multiple prompts', () => {
      widget.updateText(
        'First <img-prompt="cat"> middle <img-prompt="dog"> last'
      );
      const status = widget.getStatus();
      // Should create segments: text, image, text, image, text
      expect(status.segmentCount).toBe(5);
    });

    it('should not update if text unchanged', () => {
      widget.updateText('Hello');
      const status1 = widget.getStatus();
      widget.updateText('Hello');
      const status2 = widget.getStatus();
      expect(status1.segmentCount).toBe(status2.segmentCount);
    });

    it('should not update if widget not visible', () => {
      widget.close();
      widget.updateText('Hello');
      const status = widget.getStatus();
      expect(status.segmentCount).toBe(0);
    });
  });

  describe('markComplete', () => {
    it('should mark streaming as complete', () => {
      widget.start(1);
      widget.updateText('Test text');
      widget.markComplete();
      // Widget should remain visible
      expect(widget.isActive()).toBe(true);
    });
  });

  describe('close', () => {
    it('should close and hide widget', () => {
      widget.start(1);
      widget.updateText('Test text');
      widget.close();

      expect(widget.isActive()).toBe(false);
      const status = widget.getStatus();
      expect(status.isVisible).toBe(false);
      expect(status.messageId).toBe(-1);
    });

    it('should clear segments', () => {
      widget.start(1);
      widget.updateText('Test <img-prompt="cat"> text');
      widget.close();

      const status = widget.getStatus();
      expect(status.segmentCount).toBe(0);
    });
  });

  describe('toggleMinimize', () => {
    it('should toggle minimize state', () => {
      widget.start(1);
      const status1 = widget.getStatus();
      const initialState = status1.isMinimized;

      widget.toggleMinimize();
      const status2 = widget.getStatus();
      expect(status2.isMinimized).toBe(!initialState);

      widget.toggleMinimize();
      const status3 = widget.getStatus();
      expect(status3.isMinimized).toBe(initialState);
    });
  });

  describe('clearState', () => {
    it('should clear widget state on chat change', () => {
      widget.start(1);
      widget.updateText('Test text');
      widget.clearState();

      expect(widget.isActive()).toBe(false);
      const status = widget.getStatus();
      expect(status.isVisible).toBe(false);
      expect(status.segmentCount).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return current widget status', () => {
      const status = widget.getStatus();
      expect(status).toHaveProperty('isVisible');
      expect(status).toHaveProperty('isMinimized');
      expect(status).toHaveProperty('messageId');
      expect(status).toHaveProperty('segmentCount');
    });

    it('should reflect widget state changes', () => {
      const status1 = widget.getStatus();
      expect(status1.isVisible).toBe(false);

      widget.start(5);
      const status2 = widget.getStatus();
      expect(status2.isVisible).toBe(true);
      expect(status2.messageId).toBe(5);

      widget.updateText('Test <img-prompt="cat"> text');
      const status3 = widget.getStatus();
      expect(status3.segmentCount).toBe(3);
    });
  });
});
