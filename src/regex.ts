/**
 * Regex Patterns Module
 * Centralized regular expressions for image prompt tags
 *
 * This module provides reusable regex patterns to avoid duplication and ensure
 * consistency across the codebase when matching img_prompt tags and related patterns.
 */

/**
 * Matches the img_prompt tag with its content: <img_prompt="...">
 *
 * Capture groups:
 * - Group 1: The prompt content (supports escaped quotes)
 *
 * Examples:
 * - <img_prompt="sunset scene"> → captures "sunset scene"
 * - <img_prompt="character saying \"hello\""> → captures "character saying \"hello\""
 *
 * Note: Use createImagePromptRegex() to get a fresh instance for iteration
 */
export const IMAGE_PROMPT_PATTERN =
  /<img_prompt="([^"\\]*(?:\\.[^"\\]*)*)"\s*>/g;

/**
 * Matches an img_prompt tag (without capturing the content)
 *
 * Used for simple matching without needing to extract the prompt text.
 *
 * Examples:
 * - <img_prompt="any text here">
 * - <img_prompt="">
 */
export const IMAGE_PROMPT_TAG_PATTERN = /<img_prompt="[^"]*">/;

/**
 * Matches an img_prompt tag followed by an img tag (for pruning)
 *
 * Pattern: <img_prompt="...">OPTIONAL_WHITESPACE<img ...>
 *
 * This is used to identify generated images that should be removed from
 * chat history before sending to the LLM. It matches the complete sequence
 * of prompt tag + generated image tag.
 *
 * Examples:
 * - <img_prompt="test">\n<img src="..." title="..." alt="...">
 * - <img_prompt="scene"> <img src="...">
 * - <img_prompt="test"><img src="..." class="foo" id="bar">
 */
export const IMAGE_PROMPT_WITH_IMG_PATTERN =
  /<img_prompt="[^"]*">\s*<img\s+[^>]*>/g;

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
