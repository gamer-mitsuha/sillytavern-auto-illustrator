/**
 * Image Extractor Module
 * Handles extraction of image generation prompts from LLM responses
 */

import type {ImagePromptMatch} from './types';
import {
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

  const regex = createCombinedPromptRegex(patterns);
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

  return extractImagePromptsMultiPattern(text, patterns);
}
