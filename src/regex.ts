/**
 * Regex Patterns Module
 * Centralized regular expressions for image prompt tags
 *
 * This module provides reusable regex patterns to avoid duplication and ensure
 * consistency across the codebase when matching img-prompt tags and related patterns.
 */

/**
 * Matches the img-prompt tag with its content: <img-prompt="...">
 *
 * Capture groups:
 * - Group 1: The prompt content (supports escaped quotes)
 *
 * Examples:
 * - <img-prompt="sunset scene"> → captures "sunset scene"
 * - <img-prompt="character saying \"hello\""> → captures "character saying \"hello\""
 *
 * Note: Use createImagePromptRegex() to get a fresh instance for iteration
 */
export const IMAGE_PROMPT_PATTERN =
  /<img-prompt="([^"\\]*(?:\\.[^"\\]*)*)"\s*>/g;

/**
 * Matches an img-prompt tag (without capturing the content)
 *
 * Used for simple matching without needing to extract the prompt text.
 *
 * Examples:
 * - <img-prompt="any text here">
 * - <img-prompt="">
 */
export const IMAGE_PROMPT_TAG_PATTERN = /<img-prompt="[^"]*">/;

/**
 * Matches an img-prompt tag followed by an img tag (for pruning)
 *
 * Pattern: <img-prompt="...">OPTIONAL_WHITESPACE<img ...>
 *
 * This is used to identify generated images that should be removed from
 * chat history before sending to the LLM. It matches the complete sequence
 * of prompt tag + generated image tag.
 *
 * Examples:
 * - <img-prompt="test">\n<img src="..." title="..." alt="...">
 * - <img-prompt="scene"> <img src="...">
 * - <img-prompt="test"><img src="..." class="foo" id="bar">
 */
export const IMAGE_PROMPT_WITH_IMG_PATTERN =
  /<img-prompt="[^"]*">\s*<img\s+[^>]*>/g;

/**
 * Creates a fresh RegExp instance for IMAGE_PROMPT_PATTERN
 *
 * Use this when you need to iterate over matches with exec() or test()
 * to avoid state issues with the global flag.
 *
 * @returns New RegExp instance
 */
export function createImagePromptRegex(): RegExp {
  return new RegExp(IMAGE_PROMPT_PATTERN.source, IMAGE_PROMPT_PATTERN.flags);
}

/**
 * Creates a fresh RegExp instance for IMAGE_PROMPT_WITH_IMG_PATTERN
 *
 * Use this when you need to iterate over matches with exec() or replace()
 * to avoid state issues with the global flag.
 *
 * @returns New RegExp instance
 */
export function createImagePromptWithImgRegex(): RegExp {
  return new RegExp(
    IMAGE_PROMPT_WITH_IMG_PATTERN.source,
    IMAGE_PROMPT_WITH_IMG_PATTERN.flags
  );
}

/**
 * Unescapes quotes in an extracted prompt string
 *
 * Helper function to convert escaped quotes (\\") back to regular quotes (")
 * after extracting from the regex capture group.
 *
 * @param prompt - Prompt string with escaped quotes
 * @returns Prompt string with unescaped quotes
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
