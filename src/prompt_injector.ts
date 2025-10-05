/**
 * Prompt Injector Module
 * Handles injection of meta-prompts to instruct the LLM to generate image prompts inline
 */

const EXTENSION_PROMPT_KEY = 'auto_illustrator';

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
 * Updates the extension prompt injection based on settings
 * Uses SillyTavern's setExtensionPrompt API with a filter function to control injection
 * @param context - SillyTavern extension context
 * @param settings - Extension settings
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function updateExtensionPrompt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  settings: AutoIllustratorSettings
): void {
  console.log('[Auto Illustrator] Updating extension prompt', {
    enabled: settings.enabled,
    metaPromptLength: settings.metaPrompt.length,
  });

  // Set the extension prompt with a filter function that checks if enabled
  // Parameters: key, value, position, depth, role, scan, filter
  context.setExtensionPrompt(
    EXTENSION_PROMPT_KEY, // key
    settings.metaPrompt, // value
    1, // position: 1 = in-chat with custom depth
    0, // depth: 0 = last message in context
    context.extensionPromptRoles?.SYSTEM ?? 0, // role: SYSTEM
    false, // scan: don't include in world info scan
    () => settings.enabled // filter: only inject if extension is enabled
  );

  console.log('[Auto Illustrator] Extension prompt configured', {
    key: EXTENSION_PROMPT_KEY,
    willInject: settings.enabled,
  });
}
