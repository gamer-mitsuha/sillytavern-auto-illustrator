/**
 * Prompt Injector Module
 * Handles injection of meta-prompts to instruct the LLM to generate image prompts inline
 */

/**
 * Generates the default meta prompt template
 * @param wordInterval - Number of words between image generation prompts
 * @returns The default meta prompt string
 */
export function getDefaultMetaPrompt(wordInterval: number): string {
  return `
IMPORTANT INSTRUCTION: As you generate your response, you MUST include image generation prompts inline with your narrative.

Every ${wordInterval} words (approximately), insert an image generation prompt using this EXACT format:
<img_prompt="detailed description of the scene, character, or setting to visualize">

Rules for image prompts:
1. Use the exact format: <img_prompt="your description here">
2. The description should be detailed and visual, describing what should be in the image
3. Focus on visual elements: character appearance, setting, atmosphere, actions, etc.
4. Keep descriptions concise but descriptive (1-2 sentences)
5. Generate prompts naturally within the flow of your narrative

Example:
The sun was setting over the ancient castle <img_prompt="medieval stone castle silhouette against orange and purple sunset sky, dramatic lighting, fantasy atmosphere"> as the knight approached the gates. The heavy wooden doors creaked open...
`.trim();
}

/**
 * Checks if prompt injection should occur based on settings
 * @param settings - Extension settings
 * @returns True if prompt should be injected
 */
export function shouldInjectPrompt(settings: AutoIllustratorSettings): boolean {
  return settings.enabled;
}

/**
 * Injects meta-prompt into chat array (modifies in-place)
 * Always injects as a separate system message right before the last message
 * @param chat - Chat array to modify
 * @param settings - Extension settings
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function injectPrompt(
  chat: any[],
  settings: AutoIllustratorSettings
): void {
  if (!shouldInjectPrompt(settings)) {
    return;
  }

  if (chat.length === 0) {
    return;
  }

  // Calculate insertion index (before the last message)
  const insertIndex = chat.length - 1;

  // Check if meta-prompt is already injected at this position
  if (
    insertIndex > 0 &&
    chat[insertIndex - 1].is_system &&
    chat[insertIndex - 1].mes?.includes('<img_prompt=')
  ) {
    // Already injected, skip
    return;
  }

  // Create a separate system message with the meta-prompt
  const systemMessage = {
    role: 'system', // For API (OpenAI, etc.)
    mes: settings.metaPrompt, // For ST UI
    is_system: true, // For ST internal logic
    is_user: false,
    name: 'system',
    send_date: new Date().toISOString(),
  };

  // Insert before the last message
  chat.splice(insertIndex, 0, systemMessage);
}

/**
 * Creates a handler for GENERATE_AFTER_COMBINE_PROMPTS event
 * @param getSettings - Function to get current settings
 * @returns Event handler function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPromptInjectionHandler(
  getSettings: () => AutoIllustratorSettings
): (chat: any[]) => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (chat: any[]) => {
    const settings = getSettings();
    injectPrompt(chat, settings);
  };
}
