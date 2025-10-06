/**
 * Image Extractor Module
 * Handles extraction of image generation prompts from LLM responses
 */

import type {ImagePromptMatch} from './types';
import {createImagePromptRegex, unescapePromptQuotes} from './regex';

/**
 * Checks if the text contains any image prompts
 * @param text - Text to check
 * @returns True if text contains image prompts
 */
export function hasImagePrompts(text: string): boolean {
  // Create a new regex instance to avoid state issues with global flag
  const regex = createImagePromptRegex();
  return regex.test(text);
}

/**
 * Extracts all image generation prompts from text
 * @param text - Text containing image prompts
 * @returns Array of image prompt matches with positions
 */
export function extractImagePrompts(text: string): ImagePromptMatch[] {
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
