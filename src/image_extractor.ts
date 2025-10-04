/**
 * Image Extractor Module
 * Handles extraction of image generation prompts from LLM responses
 */

/**
 * Regular expression to match image prompts in the format: <img_prompt="...">
 * Matches both escaped and regular quotes within the prompt
 */
const IMAGE_PROMPT_REGEX = /<img_prompt="([^"\\]*(?:\\.[^"\\]*)*)"\s*>/g;

/**
 * Checks if the text contains any image prompts
 * @param text - Text to check
 * @returns True if text contains image prompts
 */
export function hasImagePrompts(text: string): boolean {
  // Create a new regex instance to avoid state issues with global flag
  const regex = new RegExp(IMAGE_PROMPT_REGEX.source, IMAGE_PROMPT_REGEX.flags);
  return regex.test(text);
}

/**
 * Extracts all image generation prompts from text
 * @param text - Text containing image prompts
 * @returns Array of image prompt matches with positions
 */
export function extractImagePrompts(text: string): ImagePromptMatch[] {
  const matches: ImagePromptMatch[] = [];
  const regex = new RegExp(IMAGE_PROMPT_REGEX.source, IMAGE_PROMPT_REGEX.flags);

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      prompt: match[1].replace(/\\"/g, '"'), // Unescape quotes
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return matches;
}
