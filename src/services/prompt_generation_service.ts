/**
 * Prompt Generation Service
 * Generates image prompts using a separate LLM call
 */

import {createLogger} from '../logger';
import promptGenerationTemplate from '../presets/prompt_generation.md';
import type {PromptSuggestion} from '../prompt_insertion';

const logger = createLogger('PromptGenService');

/**
 * LLM response format for prompt generation
 */
interface PromptGenerationResponse {
  prompts: Array<{
    text: string;
    insertAfter: string;
    insertBefore: string;
    reasoning?: string;
  }>;
}

/**
 * Parses LLM response and extracts prompt suggestions
 * Expects JSON format: {prompts: [{text, insertAfter, insertBefore}]}
 *
 * @param llmResponse - Raw LLM response text
 * @returns Array of parsed prompt suggestions, or empty array if parsing fails
 */
function parsePromptSuggestions(llmResponse: string): PromptSuggestion[] {
  try {
    // Strip markdown code blocks if present (```json ... ```)
    let cleanedResponse = llmResponse.trim();
    if (cleanedResponse.startsWith('```')) {
      // Remove opening ```json or ```
      cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*\n/, '');
      // Remove closing ```
      cleanedResponse = cleanedResponse.replace(/\n```\s*$/, '');
    }

    // Try to find JSON block in response (handles cases where LLM adds explanatory text)
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*"prompts"[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : cleanedResponse;

    const parsed: PromptGenerationResponse = JSON.parse(jsonText);

    if (!parsed.prompts || !Array.isArray(parsed.prompts)) {
      logger.error('LLM response missing "prompts" array');
      return [];
    }

    // Validate and filter suggestions
    const validSuggestions: PromptSuggestion[] = [];
    for (const prompt of parsed.prompts) {
      // Check required fields
      if (
        typeof prompt.text !== 'string' ||
        typeof prompt.insertAfter !== 'string' ||
        typeof prompt.insertBefore !== 'string'
      ) {
        logger.warn(
          'Skipping invalid prompt suggestion (missing fields):',
          prompt
        );
        continue;
      }

      // Check non-empty
      if (
        prompt.text.trim() === '' ||
        prompt.insertAfter.trim() === '' ||
        prompt.insertBefore.trim() === ''
      ) {
        logger.warn('Skipping empty prompt suggestion:', prompt);
        continue;
      }

      validSuggestions.push({
        text: prompt.text.trim(),
        insertAfter: prompt.insertAfter.trim(),
        insertBefore: prompt.insertBefore.trim(),
        reasoning: prompt.reasoning?.trim(),
      });
    }

    logger.info(
      `Parsed ${validSuggestions.length} valid suggestions from LLM response`
    );
    return validSuggestions;
  } catch (error) {
    logger.error('Failed to parse LLM response as JSON:', error);
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

  // User prompt is just the message text to analyze
  const userPrompt = messageText;

  logger.debug('Calling LLM for prompt generation (using generateRaw)');

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
