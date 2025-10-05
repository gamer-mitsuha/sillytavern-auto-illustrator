/**
 * Chat History Pruner Module
 * Removes generated images from chat history before sending to LLM
 */

/**
 * Prunes generated images from chat history
 * Only removes <img> tags that immediately follow <img_prompt> tags in assistant messages
 * Preserves user-uploaded images and all user messages unchanged
 *
 * @param chat - Array of chat messages to process
 * @returns Modified chat array (original is modified in-place)
 */
export function pruneGeneratedImages(
  chat: Array<{role: string; content: string}>
): Array<{role: string; content: string}> {
  console.log('[Auto Illustrator] Pruning generated images from chat history');

  for (const message of chat) {
    // Only process assistant messages
    if (message.role === 'user' || message.role === 'system') {
      continue;
    }

    // Look for pattern: <img_prompt="...">OPTIONAL_WHITESPACE<img src="..." ...>
    // This regex finds img tags that immediately follow img_prompt tags
    const pattern =
      /<img_prompt="[^"]*">\s*<img\s+src="[^"]*"[^>]*title="[^"]*"[^>]*alt="[^"]*"[^>]*>/g;

    const originalContent = message.content;
    message.content = message.content.replace(pattern, match => {
      // Extract just the img_prompt part
      const promptMatch = match.match(/<img_prompt="[^"]*">/);
      return promptMatch ? promptMatch[0] : match;
    });

    if (originalContent !== message.content) {
      console.log(
        '[Auto Illustrator] Pruned generated images from assistant message'
      );
    }
  }

  return chat;
}
