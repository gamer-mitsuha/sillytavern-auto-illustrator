/**
 * Regex Patterns Module
 * Centralized regular expressions for image prompt tags
 *
 * This module provides reusable regex patterns to avoid duplication and ensure
 * consistency across the codebase when matching img-prompt tags and related patterns.
 */

/**
 * Matches an img-prompt tag (without capturing the content)
 *
 * Used for simple matching without needing to extract the prompt text.
 * Note: This pattern is kept for backward compatibility with old test cases.
 * Production code should use DEFAULT_PROMPT_DETECTION_PATTERNS instead.
 *
 * Examples:
 * - <img-prompt="any text here">
 * - <img-prompt="">
 */
export const IMAGE_PROMPT_TAG_PATTERN = /<img-prompt="[^"]*">/;

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
