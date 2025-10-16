/**
 * Prompt Generation Service
 * Generates image prompts using a separate LLM call
 */

import {createLogger} from '../logger';
import promptGenerationTemplate from '../presets/prompt_generation.md';
import type {PromptSuggestion} from '../prompt_insertion';

const logger = createLogger('PromptGenService');

/**
 * Builds user prompt with context from previous messages
 * Format: === CONTEXT === ... === CURRENT MESSAGE === ...
 *
 * @param context - SillyTavern context
 * @param currentMessageText - The message to generate prompts for
 * @param contextMessageCount - Number of previous messages to include as context
 * @returns Formatted user prompt with context
 */
function buildUserPromptWithContext(
  context: SillyTavernContext,
  currentMessageText: string,
  contextMessageCount: number
): string {
  // Get recent chat history (last N messages, excluding current)
  const chat = context.chat || [];
  const startIndex = Math.max(0, chat.length - contextMessageCount - 1);
  const recentMessages = chat.slice(startIndex, -1); // Last N messages before current

  let contextText = '';
  if (recentMessages.length > 0 && contextMessageCount > 0) {
    contextText = recentMessages
      .map(msg => {
        const name = msg.name || (msg.is_user ? 'User' : 'Assistant');
        const text = msg.mes || '';
        return `${name}: ${text}`;
      })
      .join('\n\n');
  } else {
    contextText = '(No previous messages)';
  }

  return `=== CONTEXT ===
${contextText}

=== CURRENT MESSAGE ===
${currentMessageText}`;
}

/**
 * Parses LLM response and extracts prompt suggestions
 * Expects plain text delimiter format:
 * ---PROMPT---
 * TEXT: ...
 * INSERT_AFTER: ...
 * INSERT_BEFORE: ...
 * REASONING: ...
 * ---END---
 *
 * @param llmResponse - Raw LLM response text
 * @returns Array of parsed prompt suggestions, or empty array if parsing fails
 */
function parsePromptSuggestions(llmResponse: string): PromptSuggestion[] {
  try {
    // Strip markdown code blocks if present
    let cleanedResponse = llmResponse.trim();
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```[a-z]*\s*\n?/, '');
      cleanedResponse = cleanedResponse.replace(/\n?```\s*$/, '');
      cleanedResponse = cleanedResponse.trim();
    }

    // Split by ---PROMPT--- delimiter
    const promptBlocks = cleanedResponse.split('---PROMPT---');
    const validSuggestions: PromptSuggestion[] = [];

    for (const block of promptBlocks) {
      // Skip empty blocks or the part before first ---PROMPT---
      if (!block.trim() || !block.includes('TEXT:')) {
        continue;
      }

      // Stop at ---END--- marker if present
      const blockContent = block.split('---END---')[0];

      // Extract fields using regex - more robust than split
      const textMatch = blockContent.match(/^TEXT:\s*(.+?)$/m);
      const insertAfterMatch = blockContent.match(/^INSERT_AFTER:\s*(.+?)$/m);
      const insertBeforeMatch = blockContent.match(/^INSERT_BEFORE:\s*(.+?)$/m);
      const reasoningMatch = blockContent.match(/^REASONING:\s*(.+?)$/m);

      // Check required fields
      if (!textMatch || !insertAfterMatch || !insertBeforeMatch) {
        const missingFields = [];
        if (!textMatch) missingFields.push('TEXT');
        if (!insertAfterMatch) missingFields.push('INSERT_AFTER');
        if (!insertBeforeMatch) missingFields.push('INSERT_BEFORE');
        logger.warn(
          `Skipping prompt block with missing required fields: ${missingFields.join(', ')}`
        );
        logger.debug('Block content preview:', blockContent.substring(0, 200));
        continue;
      }

      const text = textMatch[1].trim();
      const insertAfter = insertAfterMatch[1].trim();
      const insertBefore = insertBeforeMatch[1].trim();
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : undefined;

      // Check non-empty
      if (!text || !insertAfter || !insertBefore) {
        const emptyFields = [];
        if (!text) emptyFields.push('TEXT');
        if (!insertAfter) emptyFields.push('INSERT_AFTER');
        if (!insertBefore) emptyFields.push('INSERT_BEFORE');
        logger.warn(
          `Skipping prompt block with empty fields: ${emptyFields.join(', ')}`
        );
        logger.debug('Block content preview:', blockContent.substring(0, 200));
        continue;
      }

      validSuggestions.push({
        text,
        insertAfter,
        insertBefore,
        reasoning,
      });
    }

    logger.info(
      `Parsed ${validSuggestions.length} valid suggestions from LLM response`
    );
    return validSuggestions;
  } catch (error) {
    logger.error('Failed to parse LLM response:', error);
    logger.debug('Raw response:', llmResponse);
    return [];
  }
}

/**
 * Generates image prompts for a message using separate LLM call
 *
 * Uses context.generateRaw() to analyze the message text and suggest
 * image prompts with context-based insertion points.
 *
 * @param messageText - The complete message text to analyze
 * @param context - SillyTavern context
 * @param settings - Extension settings
 * @returns Array of prompt suggestions, or empty array on failure
 *
 * @example
 * const suggestions = await generatePromptsForMessage(
 *   "She walked through the forest under the pale moonlight.",
 *   context,
 *   settings
 * );
 * // Returns: [{
 * //   text: "1girl, forest, moonlight, highly detailed",
 * //   insertAfter: "through the forest",
 * //   insertBefore: "under the pale"
 * // }]
 */
export async function generatePromptsForMessage(
  messageText: string,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<PromptSuggestion[]> {
  logger.info('Generating image prompts using separate LLM call');
  logger.debug(`Message length: ${messageText.length} characters`);

  // Check for LLM availability
  if (!context.generateRaw) {
    logger.error('generateRaw not available in context');
    throw new Error('LLM generation not available');
  }

  // Build system prompt with all instructions from template
  let systemPrompt = promptGenerationTemplate;

  // Replace FREQUENCY_GUIDELINES with user's custom or default
  const frequencyGuidelines = settings.llmFrequencyGuidelines || '';
  systemPrompt = systemPrompt.replace(
    '{{FREQUENCY_GUIDELINES}}',
    frequencyGuidelines
  );

  // Replace PROMPT_WRITING_GUIDELINES with user's custom or default
  const promptWritingGuidelines = settings.llmPromptWritingGuidelines || '';
  systemPrompt = systemPrompt.replace(
    '{{PROMPT_WRITING_GUIDELINES}}',
    promptWritingGuidelines
  );

  // Build user prompt with context and current message
  const contextMessageCount = settings.contextMessageCount || 10;
  const userPrompt = buildUserPromptWithContext(
    context,
    messageText,
    contextMessageCount
  );

  logger.debug('Calling LLM for prompt generation (using generateRaw)');
  logger.debug('Context message count:', contextMessageCount);
  logger.debug('User prompt length:', userPrompt.length);
  logger.trace('User prompt:', userPrompt);

  // Call LLM with generateRaw (no chat context)
  let llmResponse: string;
  try {
    llmResponse = await context.generateRaw({
      systemPrompt,
      prompt: userPrompt,
    });

    logger.debug('LLM response received');
    logger.trace('Raw LLM response:', llmResponse);
  } catch (error) {
    logger.error('LLM generation failed:', error);
    return []; // Return empty array instead of throwing
  }

  // Parse response
  const suggestions = parsePromptSuggestions(llmResponse);

  if (suggestions.length === 0) {
    logger.warn('LLM returned no valid suggestions');
    return [];
  }

  // Apply maxPromptsPerMessage limit
  const maxPrompts = settings.maxPromptsPerMessage || 5;
  if (suggestions.length > maxPrompts) {
    logger.info(
      `Limiting prompts from ${suggestions.length} to ${maxPrompts} (maxPromptsPerMessage)`
    );
    return suggestions.slice(0, maxPrompts);
  }

  logger.info(
    `Successfully generated ${suggestions.length} prompt suggestions`
  );

  // Log suggestions for debugging
  suggestions.forEach((s, i) => {
    logger.debug(`Suggestion ${i + 1}:`, {
      text: s.text.substring(0, 60) + (s.text.length > 60 ? '...' : ''),
      after: s.insertAfter.substring(0, 30),
      before: s.insertBefore.substring(0, 30),
      reasoning: s.reasoning,
    });
  });

  return suggestions;
}
