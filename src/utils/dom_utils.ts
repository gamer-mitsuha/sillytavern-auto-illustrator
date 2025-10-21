/**
 * DOM Utility Functions
 * Reusable utilities for DOM manipulation and querying
 */

/**
 * HTML-encodes a string by replacing special characters with their corresponding HTML entities
 * This is necessary when embedding strings in HTML attributes to prevent syntax errors.
 *
 * Order matters: & must be encoded first to avoid double-encoding
 *
 * @param str - The string to encode
 * @returns The HTML-encoded string
 *
 * @example
 * ```typescript
 * const encoded = htmlEncode('Tom & Jerry say "hello"');
 * // Returns: 'Tom &amp; Jerry say &quot;hello&quot;'
 * ```
 */
export function htmlEncode(str: string): string {
  return str
    .replace(/&/g, '&amp;') // Must be first to avoid double-encoding
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * HTML-decodes a string by replacing common HTML entities with their corresponding characters
 * This is necessary because the browser automatically decodes HTML entities in attributes,
 * so we need to decode our comparison strings to match.
 *
 * Order matters: & must be decoded last to avoid double-decoding
 *
 * @param str - The string to decode
 * @returns The HTML-decoded string
 *
 * @example
 * ```typescript
 * const decoded = htmlDecode('Tom &amp; Jerry say &quot;hello&quot;');
 * // Returns: 'Tom & Jerry say "hello"'
 * ```
 */
export function htmlDecode(str: string): string {
  return str
    .replace(/&gt;/g, '>') // Decode other entities first
    .replace(/&lt;/g, '<')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&'); // Must be last to avoid double-decoding
}

/**
 * Finds an image element by its src attribute within a container element.
 * This function handles special cases that prevent using querySelector:
 * 1. Data URIs with fragment identifiers (# characters break CSS selectors)
 * 2. HTML entity encoding (message text has &amp; but browser decodes to &)
 *
 * Implementation:
 * - Queries all <img> elements in the container
 * - HTML-decodes the target src to match browser's decoded version
 * - Compares both the .src property and getAttribute('src') for robustness
 *
 * @param container - The container element to search within
 * @param targetSrc - The target src attribute value (may be HTML-encoded)
 * @returns The matching image element, or null if not found
 *
 * @example
 * ```typescript
 * const messageEl = document.querySelector('.mes[mesid="1"]');
 * const imgSrc = 'data:image/svg+xml;base64,...#promptId=abc&amp;ts=123';
 * const img = findImageBySrc(messageEl, imgSrc);
 * if (img) {
 *   img.addEventListener('click', handleClick);
 * }
 * ```
 */
export function findImageBySrc(
  container: HTMLElement,
  targetSrc: string
): HTMLImageElement | null {
  // HTML-decode the src attribute (browser decodes &amp; → & when parsing HTML)
  // This ensures the comparison works with the browser's decoded version
  const decodedSrc = htmlDecode(targetSrc);

  // Query all images and find by comparing src attributes
  // NOTE: Cannot use querySelector with data URIs containing '#' as it breaks CSS selector syntax
  const allImages = container.querySelectorAll('img');

  for (let i = 0; i < allImages.length; i++) {
    const candidate = allImages[i] as HTMLImageElement;

    // Compare both .src property and getAttribute('src') for robustness
    // .src returns the absolute URL, getAttribute returns the literal attribute value
    if (
      candidate.src === decodedSrc ||
      candidate.getAttribute('src') === decodedSrc
    ) {
      return candidate;
    }
  }

  return null;
}
