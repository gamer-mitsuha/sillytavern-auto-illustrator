/**
 * Image Extractor Module
 * Handles extraction of image generation prompts from LLM responses
 */

import type {ImagePromptMatch} from './types';
import {
  createImagePromptRegex,
  unescapePromptQuotes,
  extractImagePromptsMultiPattern,
  createCombinedPromptRegex,
} from './regex';
import {DEFAULT_PROMPT_DETECTION_PATTERNS} from './constants';

/**
 * Checks if the text contains any image prompts
 * @param text - Text to check
 * @param patterns - Optional array of regex pattern strings to use for detection
 * @returns True if text contains image prompts
 */
export function hasImagePrompts(
  text: string,
  patterns: string[] = DEFAULT_PROMPT_DETECTION_PATTERNS
): boolean {
  if (patterns.length === 0) {
    return false;
  }

  // Use multi-pattern regex if multiple patterns are provided
  if (patterns.length > 1) {
    const regex = createCombinedPromptRegex(patterns);
    return regex.test(text);
  }

  // Single pattern - use original regex for backward compatibility
  const regex = createImagePromptRegex();
  return regex.test(text);
}

/**
 * Extracts all image generation prompts from text
 * @param text - Text containing image prompts
 * @param patterns - Optional array of regex pattern strings to use for detection
 * @returns Array of image prompt matches with positions
 */
export function extractImagePrompts(
  text: string,
  patterns: string[] = DEFAULT_PROMPT_DETECTION_PATTERNS
): ImagePromptMatch[] {
  if (patterns.length === 0) {
    return [];
  }

  // Use multi-pattern extraction if multiple patterns are provided
  if (patterns.length > 1) {
    return extractImagePromptsMultiPattern(text, patterns);
  }

  // Single pattern - use original extraction for backward compatibility
  const matches: ImagePromptMatch[] = [];
  const regex = createImagePromptRegex();

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const prompt = unescapePromptQuotes(match[1]).trim();

    // Skip empty prompts (malformed tags during streaming)
    if (prompt.length === 0) {
      continue;
    }

    matches.push({
      fullMatch: match[0],
      prompt: prompt,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return matches;
}
