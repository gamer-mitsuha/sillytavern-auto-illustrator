/**
 * Tests for Streaming Monitor Module
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {StreamingMonitor} from './streaming_monitor';
import {ImageGenerationQueue} from './streaming_image_queue';
import {createMockContext} from './test_helpers';
import {getDefaultSettings} from './settings';

describe('StreamingMonitor', () => {
  let monitor: StreamingMonitor;
  let queue: ImageGenerationQueue;
  let mockContext: SillyTavernContext;
  let mockSettings: AutoIllustratorSettings;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new ImageGenerationQueue();
    mockContext = createMockContext({
      chat: [{mes: '', is_user: false}],
      chat_metadata: {},
    });
    mockSettings = getDefaultSettings();
    monitor = new StreamingMonitor(queue, mockContext, mockSettings, 300);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (monitor.isActive()) {
      monitor.stop();
    }
  });

  describe('start', () => {
    it('should start monitoring a message', () => {
      monitor.start(0);

      expect(monitor.isActive()).toBe(true);
      const status = monitor.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.messageId).toBe(0);
    });

    it('should stop previous monitor when starting new one', () => {
      monitor.start(0);
      expect(monitor.isActive()).toBe(true);

      monitor.start(1);
      expect(monitor.isActive()).toBe(true);
      expect(monitor.getStatus().messageId).toBe(1);
    });

    it('should do immediate check on start', () => {
      mockContext.chat[0].mes = '<!--img-prompt="test"-->';

      monitor.start(0);

      // Should detect prompt immediately
      expect(queue.size()).toBe(1);
    });
  });

  describe('stop', () => {
    it('should stop monitoring', () => {
      monitor.start(0);
      expect(monitor.isActive()).toBe(true);

      monitor.stop();

      expect(monitor.isActive()).toBe(false);
      expect(monitor.getStatus().isRunning).toBe(false);
    });

    it('should clear polling interval', () => {
      monitor.start(0);
      const intervalCount = vi.getTimerCount();

      monitor.stop();

      expect(vi.getTimerCount()).toBeLessThan(intervalCount);
    });

    it('should handle stop when not running', () => {
      // Should not throw
      monitor.stop();
      expect(monitor.isActive()).toBe(false);
    });
  });

  describe('prompt detection during polling', () => {
    it('should detect new prompts when text changes', () => {
      mockContext.chat[0].mes = 'Initial text';
      monitor.start(0);

      expect(queue.size()).toBe(0);

      // Simulate streaming text update
      mockContext.chat[0].mes = 'Initial text <!--img-prompt="sunset"-->';
      vi.advanceTimersByTime(300);

      expect(queue.size()).toBe(1);
      expect(queue.getAllPrompts()[0].prompt).toBe('sunset');
    });

    it('should detect multiple prompts in one update', () => {
      mockContext.chat[0].mes = '';
      monitor.start(0);

      mockContext.chat[0].mes =
        '<!--img-prompt="first"--> text <!--img-prompt="second"-->';
      vi.advanceTimersByTime(300);

      expect(queue.size()).toBe(2);
    });

    it('should not re-add prompts already in queue', () => {
      mockContext.chat[0].mes = '<!--img-prompt="test"-->';
      monitor.start(0);

      expect(queue.size()).toBe(1);

      // Same text, should not add duplicate
      vi.advanceTimersByTime(300);

      expect(queue.size()).toBe(1);
    });

    it('should detect new prompts added to existing text', () => {
      mockContext.chat[0].mes = '<!--img-prompt="first"-->';
      monitor.start(0);

      expect(queue.size()).toBe(1);

      // Add new prompt
      mockContext.chat[0].mes =
        '<!--img-prompt="first"--> more text <!--img-prompt="second"-->';
      vi.advanceTimersByTime(300);

      expect(queue.size()).toBe(2);
    });

    it('should not detect prompts if text unchanged', () => {
      mockContext.chat[0].mes = 'Static text';
      monitor.start(0);

      const initialSize = queue.size();

      // Advance time but no text change
      vi.advanceTimersByTime(300);
      vi.advanceTimersByTime(300);
      vi.advanceTimersByTime(300);

      expect(queue.size()).toBe(initialSize);
    });

    it('should handle message becoming undefined', () => {
      monitor.start(0);
      mockContext.chat = [];

      // Should not throw
      vi.advanceTimersByTime(300);

      expect(queue.size()).toBe(0);
    });
  });

  describe('polling interval', () => {
    it('should poll at configured interval', () => {
      monitor.start(0);

      let checkCount = 0;
      mockContext.chat[0].mes = 'test';

      // Set up text change detection
      const originalMes = mockContext.chat[0].mes;
      vi.spyOn(mockContext.chat[0], 'mes', 'get').mockImplementation(() => {
        checkCount++;
        return originalMes;
      });

      // Advance by exactly the interval
      vi.advanceTimersByTime(300);
      const checks1 = checkCount;

      vi.advanceTimersByTime(300);
      const checks2 = checkCount;

      expect(checks2).toBeGreaterThan(checks1);
    });

    it('should use custom polling interval', () => {
      const customMonitor = new StreamingMonitor(
        queue,
        mockContext,
        mockSettings,
        500
      );
      customMonitor.start(0);

      expect(customMonitor.getStatus().intervalMs).toBe(500);

      customMonitor.stop();
    });
  });

  describe('getStatus', () => {
    it('should return correct status when running', () => {
      mockContext.chat[0].mes = 'Some text here';
      monitor.start(0);

      const status = monitor.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.messageId).toBe(0);
      expect(status.lastTextLength).toBe('Some text here'.length);
      expect(status.intervalMs).toBe(300);
    });

    it('should return correct status when stopped', () => {
      monitor.start(0);
      monitor.stop();

      const status = monitor.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.messageId).toBe(-1);
      expect(status.lastTextLength).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty message text', () => {
      mockContext.chat[0].mes = '';
      monitor.start(0);

      vi.advanceTimersByTime(300);

      expect(queue.size()).toBe(0);
    });

    it('should handle malformed prompt tags', () => {
      mockContext.chat[0].mes = '<!--img-prompt="incomplete';
      monitor.start(0);

      vi.advanceTimersByTime(300);

      // Should not crash, just not match
      expect(queue.size()).toBe(0);
    });

    it('should handle prompts with special characters', () => {
      mockContext.chat[0].mes = '<!--img-prompt="test with \\"quotes\\""-->';
      monitor.start(0);

      vi.advanceTimersByTime(300);

      expect(queue.size()).toBe(1);
    });

    it('should handle rapid text updates', () => {
      monitor.start(0);

      // Simulate streaming updates
      mockContext.chat[0].mes = '<!--img-prompt="one"-->';
      vi.advanceTimersByTime(100);

      mockContext.chat[0].mes = '<!--img-prompt="one"--> <!--img-prompt="two"-->';
      vi.advanceTimersByTime(100);

      mockContext.chat[0].mes =
        '<!--img-prompt="one"--> <!--img-prompt="two"--> <!--img-prompt="three"-->';
      vi.advanceTimersByTime(100);

      vi.advanceTimersByTime(100); // Complete one full interval

      expect(queue.size()).toBe(3);
    });
  });

  describe('isActive', () => {
    it('should return true when monitoring', () => {
      monitor.start(0);
      expect(monitor.isActive()).toBe(true);
    });

    it('should return false when stopped', () => {
      monitor.start(0);
      monitor.stop();
      expect(monitor.isActive()).toBe(false);
    });

    it('should return false initially', () => {
      expect(monitor.isActive()).toBe(false);
    });
  });

  describe('finalScan', () => {
    it('should detect prompts added after last poll', () => {
      mockContext.chat[0].mes = 'Initial text';
      monitor.start(0);

      // Wait for initial scan
      vi.advanceTimersByTime(0);

      // Add prompt after polling but before stop
      mockContext.chat[0].mes = 'Initial text <!--img-prompt="last moment"-->';

      // Do final scan
      monitor.finalScan();

      expect(queue.size()).toBe(1);
      expect(queue.getAllPrompts()[0].prompt).toBe('last moment');
    });

    it('should detect multiple prompts in final scan', () => {
      mockContext.chat[0].mes = '';
      monitor.start(0);

      mockContext.chat[0].mes =
        '<!--img-prompt="first"--> <!--img-prompt="second"--> <!--img-prompt="third"-->';

      monitor.finalScan();

      expect(queue.size()).toBe(3);
    });

    it('should not duplicate prompts already detected', () => {
      mockContext.chat[0].mes = '<!--img-prompt="existing"-->';
      monitor.start(0);

      // Initial scan detects the prompt
      expect(queue.size()).toBe(1);

      // Final scan with no new prompts
      monitor.finalScan();

      expect(queue.size()).toBe(1);
    });

    it('should handle final scan when monitor is stopped', () => {
      monitor.start(0);
      monitor.stop();

      // Should not throw
      expect(() => {
        monitor.finalScan();
      }).not.toThrow();
    });

    it('should detect prompt added at very end of stream', () => {
      // Simulate streaming scenario
      mockContext.chat[0].mes = 'Text is streaming';
      monitor.start(0);

      // Advance through several polls
      mockContext.chat[0].mes = 'Text is streaming <!--img-prompt="first"-->';
      vi.advanceTimersByTime(300);

      expect(queue.size()).toBe(1);

      // More streaming
      mockContext.chat[0].mes =
        'Text is streaming <!--img-prompt="first"--> more text';
      vi.advanceTimersByTime(300);

      // Last prompt added after final poll but before GENERATION_ENDED
      mockContext.chat[0].mes =
        'Text is streaming <!--img-prompt="first"--> more text <!--img-prompt="last"-->';

      // Final scan catches it
      monitor.finalScan();

      expect(queue.size()).toBe(2);
      expect(queue.getAllPrompts()[1].prompt).toBe('last');
    });
  });
});
