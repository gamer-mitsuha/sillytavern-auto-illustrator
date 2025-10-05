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
export function updateExtensionPrompt(
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): void {
  console.log('[Auto Illustrator] Updating extension prompt', {
    enabled: settings.enabled,
    metaPromptLength: settings.metaPrompt.length,
    hasSetExtensionPrompt: typeof context.setExtensionPrompt === 'function',
  });

  if (typeof context.setExtensionPrompt !== 'function') {
    console.error(
      '[Auto Illustrator] setExtensionPrompt function not available in context'
    );
    return;
  }

  // Set or clear the extension prompt based on enabled status
  // Parameters: key, value, position, depth, scan, role
  // Don't use filter parameter - explicitly set/clear instead
  const scan = false;
  const role = 0; // SYSTEM

  if (settings.enabled) {
    // Set the prompt when enabled
    console.log('[Auto Illustrator] Setting extension prompt (enabled)');
    context.setExtensionPrompt(
      EXTENSION_PROMPT_KEY, // key
      settings.metaPrompt, // value
      1, // position: 1 = in-chat at depth
      1, // depth: 1 message before end
      scan, // scan: explicitly false
      role // role: explicitly SYSTEM (0)
    );
  } else {
    // Clear the prompt when disabled (set empty string)
    console.log('[Auto Illustrator] Clearing extension prompt (disabled)');
    context.setExtensionPrompt(
      EXTENSION_PROMPT_KEY, // key
      '', // value: empty string clears the prompt
      1, // position: 1 = in-chat at depth
      1, // depth: 1 message before end
      scan, // scan: explicitly false
      role // role: explicitly SYSTEM (0)
    );
  }

  // Verify the prompt was registered by checking extensionPrompts
  const registeredPrompt = context.extensionPrompts?.[EXTENSION_PROMPT_KEY];

  console.log('[Auto Illustrator] Extension prompt configured', {
    key: EXTENSION_PROMPT_KEY,
    enabled: settings.enabled,
    registered: !!registeredPrompt,
    hasValue: !!registeredPrompt?.value,
    promptDetails: registeredPrompt,
  });
}
