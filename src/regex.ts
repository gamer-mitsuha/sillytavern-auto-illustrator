/**
 * Regex Patterns Module (v2)
 * Centralized regular expressions and string manipulation utilities
 *
 * This module provides a single source of truth for all regex patterns
 * and related string utilities used throughout the extension.
 */

/**
 * Pattern for matching HTML comment-style image prompts
 * This is the default and preferred format: <!--img-prompt="..."-->
 *
 * Supports escaped quotes within the prompt text.
 * Examples:
 * - <!--img-prompt="a beautiful sunset"-->
 * - <!--img-prompt="a \"quoted\" word"-->
 */
export const IMG_PROMPT_COMMENT_PATTERN =
  /<!--img-prompt="([^"\\]*(?:\\.[^"\\]*)*)"\s*-->/g;

/**
 * Pattern for matching image tags
 * Matches <img> tags with optional leading whitespace
 *
 * Examples:
 * - <img src="...">
 * - <img src="..." alt="..." class="...">
 * -   <img src="...">
 */
export const IMG_TAG_PATTERN = /\s*<img\s+[^>]*>/g;

/**
 * Pattern for matching image tags at the start of a line
 * Similar to IMG_TAG_PATTERN but anchored to line start
 *
 * Examples:
 * - <img src="..."> (at start)
 * -   <img src="..."> (with leading whitespace)
 */
export const IMG_TAG_AT_START_PATTERN = /^\s*<img\s+[^>]*>/g;

/**
 * Pattern for matching regex special characters
 * Used to escape strings before using them in RegExp constructor
 *
 * Matches: . * + ? ^ $ { } ( ) | [ ] \
 */
export const REGEX_SPECIAL_CHARS_PATTERN = /[.*+?^${}()|[\]\\]/g;

/**
 * Escapes special regex characters in a string
 *
 * Converts a plain string into a regex-safe string by escaping
 * all special regex characters. Useful when you need to match
 * a literal string within a regex pattern.
 *
 * @param str - String to escape
 * @returns Escaped string safe for use in regex
 *
 * @example
 * const escaped = escapeRegexSpecialChars('file.txt');
 * // Returns: 'file\\.txt'
 * const regex = new RegExp(escaped);
 */
export function escapeRegexSpecialChars(str: string): string {
  return str.replace(REGEX_SPECIAL_CHARS_PATTERN, '\\$&');
}

/**
 * Escapes special characters for safe use in HTML attributes
 *
 * Converts characters that have special meaning in HTML to their
 * entity equivalents to prevent injection and ensure proper rendering.
 *
 * @param str - String to escape
 * @returns HTML-safe string
 *
 * @example
 * const escaped = escapeHtmlAttribute('Say "Hello" & goodbye');
 * // Returns: 'Say &quot;Hello&quot; &amp; goodbye'
 */
export function escapeHtmlAttribute(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Unescapes quotes in an extracted prompt string
 *
 * Helper function to convert escaped quotes (\") back to regular quotes (")
 * after extracting from a regex capture group.
 *
 * @param prompt - Prompt string with escaped quotes
 * @returns Prompt string with unescaped quotes
 *
 * @example
 * const unescaped = unescapePromptQuotes('a \\"quoted\\" word');
 * // Returns: 'a "quoted" word'
 */
export function unescapePromptQuotes(prompt: string): string {
  return prompt.replace(/\\"/g, '"');
}

/**
 * Creates a combined regex from multiple pattern strings
 *
 * Combines multiple regex pattern strings into a single regex with alternation (|).
 * Each pattern becomes a non-capturing group in the combined pattern.
 *
 * @param patterns - Array of regex pattern strings (without delimiters or flags)
 * @returns Combined RegExp with global flag
 *
 * @example
 * const patterns = ['<img-prompt="([^"]*)">', '<!--img-prompt="([^"]*)"-->'];
 * const regex = createCombinedPromptRegex(patterns);
 * // Results in: /(?:<img-prompt="([^"]*)">) | (?:<!--img-prompt="([^"]*)"-->)/g
 */
export function createCombinedPromptRegex(patterns: string[]): RegExp {
  const combinedPattern = patterns.map(p => `(?:${p})`).join('|');
  return new RegExp(combinedPattern, 'g');
}

/**
 * Extracts all image prompts from text using multiple detection patterns
 *
 * Searches text for image prompt tags matching any of the provided patterns.
 * Returns detailed match information including prompt text and position.
 *
 * @param text - Text to search for image prompts
 * @param patterns - Array of regex pattern strings to match against
 * @returns Array of matches with prompt text and position information
 *
 * @example
 * const text = '<img-prompt="sunset"><!--img-prompt="forest"-->';
 * const patterns = ['<img-prompt="([^"]*)">', '<!--img-prompt="([^"]*)"-->'];
 * const matches = extractImagePromptsMultiPattern(text, patterns);
 * // Returns: [
 * //   {prompt: 'sunset', fullMatch: '<img-prompt="sunset">', startIndex: 0, endIndex: 23},
 * //   {prompt: 'forest', fullMatch: '<!--img-prompt="forest"-->', startIndex: 23, endIndex: 49}
 * // ]
 */
export function extractImagePromptsMultiPattern(
  text: string,
  patterns: string[]
): Array<{
  prompt: string;
  fullMatch: string;
  startIndex: number;
  endIndex: number;
}> {
  const regex = createCombinedPromptRegex(patterns);
  const results: Array<{
    prompt: string;
    fullMatch: string;
    startIndex: number;
    endIndex: number;
  }> = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Prevent infinite loop if regex matches empty string (indicates malformed pattern)
    if (match[0].length === 0) {
      break;
    }

    // Find the first defined capture group (the prompt text)
    const prompt = match.slice(1).find(g => g !== undefined);
    if (prompt && prompt.trim().length > 0) {
      results.push({
        prompt: unescapePromptQuotes(prompt.trim()),
        fullMatch: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  }

  return results;
}
