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

  // SillyTavern uses different message format: mes instead of content, is_system instead of role
  // Find system message (is_system: true)
  const systemMessageIndex = chat.findIndex(msg => msg.is_system === true);

  if (systemMessageIndex === -1) {
    // No system message exists, create one at the beginning
    // Use SillyTavern's message structure with both is_system AND role fields
    chat.unshift({
      role: 'system', // For API (OpenAI, etc.)
      mes: settings.metaPrompt, // For ST UI
      is_system: true, // For ST internal logic
      is_user: false,
      name: 'system',
      send_date: new Date().toISOString(),
    });
  } else {
    // System message exists, append to it if not already present
    const systemMessage = chat[systemMessageIndex];
    if (!systemMessage.mes || !systemMessage.mes.includes('<img_prompt=')) {
      systemMessage.mes = systemMessage.mes
        ? `${systemMessage.mes}\n\n${settings.metaPrompt}`
        : settings.metaPrompt;
    }
  }
}
