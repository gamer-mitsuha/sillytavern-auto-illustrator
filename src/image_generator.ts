/**
 * Image Generator Module
 * Handles image generation using the SD slash command and replacing prompts with images
 */

import {extractImagePrompts} from './image_extractor';

/**
 * Generates an image using the SD slash command
 * @param prompt - Image generation prompt
 * @param context - SillyTavern context
 * @returns URL of generated image or null on failure
 */
export async function generateImage(
  prompt: string,
  context: SillyTavernContext
): Promise<string | null> {
  console.log('[Auto Illustrator] Generating image for prompt:', prompt);

  try {
    const sdCommand = context.SlashCommandParser?.commands?.['sd'];
    if (!sdCommand) {
      console.error('[Auto Illustrator] SD command not available');
      console.log(
        '[Auto Illustrator] Available commands:',
        Object.keys(context.SlashCommandParser?.commands || {})
      );
      return null;
    }

    console.log('[Auto Illustrator] Calling SD command...');
    const imageUrl = await sdCommand.callback({quiet: 'true'}, prompt);
    console.log('[Auto Illustrator] Generated image URL:', imageUrl);
    return imageUrl;
  } catch (error) {
    console.error('[Auto Illustrator] Error generating image:', error);
    return null;
  }
}

/**
 * Replaces all image prompts in text with actual generated images
 * @param text - Text containing image prompts
 * @param context - SillyTavern context
 * @returns Text with prompts replaced by image tags
 */
export async function replacePromptsWithImages(
  text: string,
  context: SillyTavernContext
): Promise<string> {
  const matches = extractImagePrompts(text);

  console.log(
    '[Auto Illustrator] Found',
    matches.length,
    'image prompts to process'
  );

  if (matches.length === 0) {
    return text;
  }

  console.log(
    '[Auto Illustrator] Extracted prompts:',
    matches.map(m => m.prompt)
  );

  // Generate images sequentially to avoid rate limiting
  const imageUrls: (string | null)[] = [];
  for (const match of matches) {
    const imageUrl = await generateImage(match.prompt, context);
    imageUrls.push(imageUrl);
  }

  console.log(
    '[Auto Illustrator] Generated',
    imageUrls.filter(u => u).length,
    'images successfully'
  );

  // Replace prompts with images in reverse order to preserve indices
  let result = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const imageUrl = imageUrls[i];

    if (imageUrl) {
      // Create image tag with title and alt attributes
      const imgTag = `<img src="${imageUrl}" title="${match.prompt}" alt="${match.prompt}">`;
      result =
        result.substring(0, match.startIndex) +
        imgTag +
        result.substring(match.endIndex);
      console.log(
        '[Auto Illustrator] Replaced prompt at index',
        i,
        'with image'
      );
    } else {
      // Remove the prompt tag if image generation failed
      result =
        result.substring(0, match.startIndex) +
        result.substring(match.endIndex);
      console.log('[Auto Illustrator] Removed failed prompt at index', i);
    }
  }

  return result;
}
