/**
 * Tests for DOM Utility Functions
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {htmlEncode, htmlDecode, findImageBySrc} from './dom_utils';

describe('htmlEncode', () => {
  it('should encode & to &amp;', () => {
    expect(htmlEncode('foo&bar')).toBe('foo&amp;bar');
  });

  it('should encode " to &quot;', () => {
    expect(htmlEncode('foo"bar')).toBe('foo&quot;bar');
  });

  it("should encode ' to &#39;", () => {
    expect(htmlEncode("foo'bar")).toBe('foo&#39;bar');
  });

  it('should encode < to &lt;', () => {
    expect(htmlEncode('foo<bar')).toBe('foo&lt;bar');
  });

  it('should encode > to &gt;', () => {
    expect(htmlEncode('foo>bar')).toBe('foo&gt;bar');
  });

  it('should encode multiple special characters in one string', () => {
    expect(htmlEncode('Tom & Jerry say "hello" <tag>')).toBe(
      'Tom &amp; Jerry say &quot;hello&quot; &lt;tag&gt;'
    );
  });

  it('should handle strings with no special characters', () => {
    expect(htmlEncode('plain text')).toBe('plain text');
  });

  it('should handle empty strings', () => {
    expect(htmlEncode('')).toBe('');
  });

  it('should encode & first to avoid double-encoding', () => {
    // If & was not encoded first, we might get &&amp; instead of &amp;
    expect(htmlEncode('a&b&c')).toBe('a&amp;b&amp;c');
  });
});

describe('htmlDecode', () => {
  it('should decode &amp; to &', () => {
    expect(htmlDecode('foo&amp;bar')).toBe('foo&bar');
  });

  it('should decode &lt; to <', () => {
    expect(htmlDecode('foo&lt;bar')).toBe('foo<bar');
  });

  it('should decode &gt; to >', () => {
    expect(htmlDecode('foo&gt;bar')).toBe('foo>bar');
  });

  it('should decode &quot; to "', () => {
    expect(htmlDecode('foo&quot;bar')).toBe('foo"bar');
  });

  it("should decode &#39; to '", () => {
    expect(htmlDecode('foo&#39;bar')).toBe("foo'bar");
  });

  it('should decode multiple entities in one string', () => {
    expect(htmlDecode('&lt;div&gt;Hello &amp; Goodbye&lt;/div&gt;')).toBe(
      '<div>Hello & Goodbye</div>'
    );
  });

  it('should handle strings with no entities', () => {
    expect(htmlDecode('plain text')).toBe('plain text');
  });

  it('should handle empty strings', () => {
    expect(htmlDecode('')).toBe('');
  });

  it('should handle data URI with fragment identifier and encoded ampersand', () => {
    const encoded = 'data:image/svg+xml;base64,ABC#promptId=123&amp;ts=456';
    const decoded = 'data:image/svg+xml;base64,ABC#promptId=123&ts=456';
    expect(htmlDecode(encoded)).toBe(decoded);
  });

  it('should decode &amp; last to avoid double-decoding', () => {
    // If &amp; was decoded first, &amp;lt; would become &lt; instead of <
    expect(htmlDecode('&amp;lt;&amp;gt;')).toBe('&lt;&gt;');
  });
});

describe('htmlEncode and htmlDecode round-trip', () => {
  it('should be inverses of each other', () => {
    const testCases = [
      'plain text',
      'Tom & Jerry',
      'Say "hello" & \'goodbye\'',
      '<div>content</div>',
      'data:image/svg+xml;base64,ABC#promptId=123&ts=456',
      'Mixed: <tag attr="value">Text & more\'s text</tag>',
    ];

    testCases.forEach(testCase => {
      const encoded = htmlEncode(testCase);
      const decoded = htmlDecode(encoded);
      expect(decoded).toBe(testCase);
    });
  });
});

describe('findImageBySrc', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should find image by exact src match', () => {
    const img = document.createElement('img');
    img.src = 'http://example.com/test.jpg';
    container.appendChild(img);

    const found = findImageBySrc(container, 'http://example.com/test.jpg');
    expect(found).toBe(img);
  });

  it('should find image by HTML-decoded src', () => {
    const img = document.createElement('img');
    // Browser automatically decodes when setting src
    img.setAttribute('src', 'http://example.com/test.jpg?a=1&b=2');
    container.appendChild(img);

    // Message text has HTML-encoded version
    const found = findImageBySrc(
      container,
      'http://example.com/test.jpg?a=1&amp;b=2'
    );
    expect(found).toBe(img);
  });

  it('should find image with data URI containing fragment identifier', () => {
    const img = document.createElement('img');
    const dataUri = 'data:image/svg+xml;base64,ABC#promptId=test123&ts=456';
    img.setAttribute('src', dataUri);
    container.appendChild(img);

    const found = findImageBySrc(container, dataUri);
    expect(found).toBe(img);
  });

  it('should find image with data URI containing fragment and encoded ampersand', () => {
    const img = document.createElement('img');
    // Browser decodes the ampersand
    const decodedUri = 'data:image/svg+xml;base64,ABC#promptId=test&ts=456';
    img.setAttribute('src', decodedUri);
    container.appendChild(img);

    // Message text has encoded version
    const encodedUri = 'data:image/svg+xml;base64,ABC#promptId=test&amp;ts=456';
    const found = findImageBySrc(container, encodedUri);
    expect(found).toBe(img);
  });

  it('should return null when no matching image found', () => {
    const img = document.createElement('img');
    img.src = 'http://example.com/test1.jpg';
    container.appendChild(img);

    const found = findImageBySrc(container, 'http://example.com/test2.jpg');
    expect(found).toBeNull();
  });

  it('should return null when container has no images', () => {
    const found = findImageBySrc(container, 'http://example.com/test.jpg');
    expect(found).toBeNull();
  });

  it('should find the correct image among multiple images', () => {
    const img1 = document.createElement('img');
    img1.src = 'http://example.com/test1.jpg';
    container.appendChild(img1);

    const img2 = document.createElement('img');
    img2.src = 'http://example.com/test2.jpg';
    container.appendChild(img2);

    const img3 = document.createElement('img');
    img3.src = 'http://example.com/test3.jpg';
    container.appendChild(img3);

    const found = findImageBySrc(container, 'http://example.com/test2.jpg');
    expect(found).toBe(img2);
  });

  it('should handle images with special characters in src', () => {
    const img = document.createElement('img');
    const specialSrc = 'http://example.com/test?foo=<bar>&baz="qux"';
    img.setAttribute('src', specialSrc);
    container.appendChild(img);

    const encodedSrc =
      'http://example.com/test?foo=&lt;bar&gt;&amp;baz=&quot;qux&quot;';
    const found = findImageBySrc(container, encodedSrc);
    expect(found).toBe(img);
  });
});
