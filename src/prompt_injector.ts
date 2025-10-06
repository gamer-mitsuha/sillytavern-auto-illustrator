/**
 * Prompt Injector Module
 * Handles injection of meta-prompts to instruct the LLM to generate image prompts inline
 */

import {createLogger} from './logger';

const logger = createLogger('PromptInjector');

const EXTENSION_PROMPT_KEY = 'auto_illustrator';

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
  logger.info('Updating extension prompt', {
    enabled: settings.enabled,
    metaPromptLength: settings.metaPrompt.length,
    hasSetExtensionPrompt: typeof context.setExtensionPrompt === 'function',
  });

  if (typeof context.setExtensionPrompt !== 'function') {
    logger.error('setExtensionPrompt function not available in context');
    return;
  }

  // Set or clear the extension prompt based on enabled status
  // Parameters: key, value, position, depth, scan, role
  // Don't use filter parameter - explicitly set/clear instead
  const scan = false;
  const role = 0; // SYSTEM

  if (settings.enabled) {
    // Set the prompt when enabled
    logger.info('Setting extension prompt (enabled)');
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
    logger.info('Clearing extension prompt (disabled)');
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

  logger.info('Extension prompt configured', {
    key: EXTENSION_PROMPT_KEY,
    enabled: settings.enabled,
    registered: !!registeredPrompt,
    hasValue: !!registeredPrompt?.value,
    promptDetails: registeredPrompt,
  });
}
