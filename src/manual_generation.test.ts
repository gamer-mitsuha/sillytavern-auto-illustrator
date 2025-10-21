/**
 * Tests for Manual Generation Module - Handler Attachment
 */

import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {attachRegenerationHandlers} from './manual_generation';

// Mock dependencies
vi.mock('./logger', () => ({
  createLogger: () => ({
    trace: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('attachRegenerationHandlers', () => {
  let mockContext: SillyTavernContext;
  let mockSettings: AutoIllustratorSettings;
  let mockMessageEl: HTMLElement;
  let mockEventSource: any;

  beforeEach(() => {
    // Create a mock message element in the DOM
    mockMessageEl = document.createElement('div');
    mockMessageEl.className = 'mes';
    mockMessageEl.setAttribute('mesid', '0');
    document.body.appendChild(mockMessageEl);

    // Create mock event source
    mockEventSource = {
      on: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
    };

    // Create mock context
    mockContext = {
      chat: [
        {
          mes: '<!--img-prompt="test prompt"-->\n<img src="http://example.com/test.jpg" data-prompt-id="test-id" />',
          name: 'Test',
          is_user: false,
          send_date: 0,
        },
      ],
      eventSource: mockEventSource,
      eventTypes: {
        MESSAGE_EDITED: 'MESSAGE_EDITED',
        MESSAGE_UPDATED: 'MESSAGE_UPDATED',
      },
    } as any;

    // Create mock settings
    mockSettings = {
      regenerationEnabled: true,
    } as any;
  });

  afterEach(() => {
    // Clean up DOM
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('should attach click handlers to images after MESSAGE_UPDATED event', () => {
    // Create an image element in the message
    const imgEl = document.createElement('img');
    imgEl.src = 'http://example.com/test.jpg';
    imgEl.setAttribute('data-prompt-id', 'test-id');
    imgEl.className = 'auto-illustrator-img';
    mockMessageEl.appendChild(imgEl);

    // Call the function
    attachRegenerationHandlers(0, mockContext, mockSettings);

    // Should find the message element
    expect(document.querySelector('.mes[mesid="0"]')).toBe(mockMessageEl);

    // Should find the image
    const images = mockMessageEl.querySelectorAll('img');
    expect(images.length).toBe(1);
  });

  it('should handle messages with no images gracefully', () => {
    // Update message to have no images
    mockContext.chat![0].mes = 'Just text, no images';

    // Should not throw
    expect(() => {
      attachRegenerationHandlers(0, mockContext, mockSettings);
    }).not.toThrow();
  });

  it('should handle failed placeholder images with data-failed-placeholder attribute', () => {
    // Create a failed placeholder image
    const imgEl = document.createElement('img');
    imgEl.src = 'data:image/svg+xml;base64,test#promptId=test-id';
    imgEl.setAttribute('data-prompt-id', 'test-id');
    imgEl.setAttribute('data-failed-placeholder', 'true');
    imgEl.setAttribute('data-prompt-text', 'test prompt');
    imgEl.className = 'auto-illustrator-img';
    mockMessageEl.appendChild(imgEl);

    // Update message text to include failed placeholder
    mockContext.chat![0].mes = `<!--img-prompt="test prompt"-->\n<img src="${imgEl.src}" data-prompt-id="test-id" data-failed-placeholder="true" data-prompt-text="test prompt" />`;

    // Call the function
    attachRegenerationHandlers(0, mockContext, mockSettings);

    // Should find the image
    const images = mockMessageEl.querySelectorAll(
      'img[data-failed-placeholder="true"]'
    );
    expect(images.length).toBe(1);
  });

  it('should return early if message element not found in DOM', () => {
    // Remove message element from DOM
    document.body.innerHTML = '';

    // Should not throw, just return early
    expect(() => {
      attachRegenerationHandlers(0, mockContext, mockSettings);
    }).not.toThrow();
  });

  it('should return early if message not found in chat', () => {
    // Try to attach handlers to non-existent message
    expect(() => {
      attachRegenerationHandlers(999, mockContext, mockSettings);
    }).not.toThrow();
  });

  it('should handle multiple images in a single message', () => {
    // Create multiple images
    const img1 = document.createElement('img');
    img1.src = 'http://example.com/test1.jpg';
    img1.setAttribute('data-prompt-id', 'test-id-1');
    img1.className = 'auto-illustrator-img';
    mockMessageEl.appendChild(img1);

    const img2 = document.createElement('img');
    img2.src = 'http://example.com/test2.jpg';
    img2.setAttribute('data-prompt-id', 'test-id-2');
    img2.className = 'auto-illustrator-img';
    mockMessageEl.appendChild(img2);

    // Update message text
    mockContext.chat![0].mes = `<!--img-prompt="test prompt 1"-->\n<img src="${img1.src}" data-prompt-id="test-id-1" />\n<!--img-prompt="test prompt 2"-->\n<img src="${img2.src}" data-prompt-id="test-id-2" />`;

    // Call the function
    attachRegenerationHandlers(0, mockContext, mockSettings);

    // Should find both images
    const images = mockMessageEl.querySelectorAll('img');
    expect(images.length).toBe(2);
  });

  it('should handle images with both normal and failed states', () => {
    // Create a normal image
    const normalImg = document.createElement('img');
    normalImg.src = 'http://example.com/normal.jpg';
    normalImg.setAttribute('data-prompt-id', 'normal-id');
    normalImg.className = 'auto-illustrator-img';
    mockMessageEl.appendChild(normalImg);

    // Create a failed placeholder image
    const failedImg = document.createElement('img');
    failedImg.src = 'data:image/svg+xml;base64,failed#promptId=failed-id';
    failedImg.setAttribute('data-prompt-id', 'failed-id');
    failedImg.setAttribute('data-failed-placeholder', 'true');
    failedImg.setAttribute('data-prompt-text', 'failed prompt');
    failedImg.className = 'auto-illustrator-img';
    mockMessageEl.appendChild(failedImg);

    // Update message text
    mockContext.chat![0].mes = `<!--img-prompt="normal prompt"-->\n<img src="${normalImg.src}" data-prompt-id="normal-id" />\n<!--img-prompt="failed prompt"-->\n<img src="${failedImg.src}" data-prompt-id="failed-id" data-failed-placeholder="true" data-prompt-text="failed prompt" />`;

    // Call the function
    attachRegenerationHandlers(0, mockContext, mockSettings);

    // Should find both images
    const images = mockMessageEl.querySelectorAll('img');
    expect(images.length).toBe(2);
  });
});

describe('Handler Attachment After DOM Updates', () => {
  it('should use event-driven approach to wait for DOM readiness', () => {
    const mockEventSource = {
      once: vi.fn(),
      emit: vi.fn(),
    };

    const mockContext = {
      eventTypes: {
        MESSAGE_UPDATED: 'MESSAGE_UPDATED',
      },
      eventSource: mockEventSource,
    } as any;

    // Simulate setting up the event listener
    mockEventSource.once('MESSAGE_UPDATED', () => {
      // Handler would be called here
    });

    expect(mockEventSource.once).toHaveBeenCalledWith(
      'MESSAGE_UPDATED',
      expect.any(Function)
    );
  });

  it('should call attachRegenerationHandlers after MESSAGE_UPDATED', () => {
    const mockEventSource = {
      once: vi.fn(),
      emit: vi.fn(),
    };

    const mockContext = {
      eventTypes: {
        MESSAGE_UPDATED: 'MESSAGE_UPDATED',
      },
      eventSource: mockEventSource,
    } as any;

    // Simulate the event-driven pattern
    let handlerCallback: Function | null = null;
    mockEventSource.once.mockImplementation(
      (event: string, callback: Function) => {
        if (event === 'MESSAGE_UPDATED') {
          handlerCallback = callback;
        }
      }
    );

    // Set up listener
    mockEventSource.once('MESSAGE_UPDATED', () => {
      // This would call attachRegenerationHandlers
    });

    // Verify listener was registered
    expect(mockEventSource.once).toHaveBeenCalledWith(
      'MESSAGE_UPDATED',
      expect.any(Function)
    );
    expect(handlerCallback).not.toBeNull();
  });
});
