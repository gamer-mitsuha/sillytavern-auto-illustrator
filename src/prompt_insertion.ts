/**
 * Prompt Insertion Module
 * Inserts image prompt tags into message text using context-based matching
 */

import {createLogger} from './logger';

const logger = createLogger('PromptInsertion');

/**
 * Suggested prompt with context for insertion
 */
export interface PromptSuggestion {
  /** The image generation prompt text */
  text: string;
  /** Text snippet before insertion point (10-40 chars) */
  insertAfter: string;
  /** Text snippet after insertion point (10-40 chars) */
  insertBefore: string;
  /** Optional reasoning for why this prompt was suggested */
  reasoning?: string;
}

/**
 * Result of prompt insertion operation
 */
export interface InsertionResult {
  /** Updated message text with prompt tags inserted */
  updatedText: string;
  /** Number of prompts successfully inserted */
  insertedCount: number;
  /** Suggestions that failed to insert (context not found) */
  failedSuggestions: PromptSuggestion[];
}

/**
 * Escapes special regex characters in a string
 * @param str - String to escape
 * @returns Escaped string safe for use in RegExp constructor
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds the insertion point for a prompt based on context snippets
 * @param messageText - The message text to search
 * @param insertAfter - Text snippet that should appear before insertion point
 * @param insertBefore - Text snippet that should appear after insertion point
 * @returns The character position to insert at, or null if no match found
 */
function findInsertionPoint(
  messageText: string,
  insertAfter: string,
  insertBefore: string
): number | null {
  // Strategy 1: Try exact match first (fastest)
  const afterEscaped = escapeRegex(insertAfter);
  const beforeEscaped = escapeRegex(insertBefore);
  const exactPattern = new RegExp(`(${afterEscaped})(${beforeEscaped})`, 'i');
  const exactMatch = messageText.match(exactPattern);

  if (exactMatch && exactMatch.index !== undefined) {
    return exactMatch.index + exactMatch[1].length;
  }

  // Strategy 2: Try flexible whitespace matching
  // Replace multiple spaces with \s+ to handle whitespace variations
  // This allows "garden. The" to match "garden.  The" or "garden.\nThe"
  const afterFlexible = afterEscaped.replace(/\s+/g, '\\s+');
  const beforeFlexible = beforeEscaped.replace(/\s+/g, '\\s+');
  const flexPattern = new RegExp(
    `(${afterFlexible})(\\s*)(${beforeFlexible})`,
    'i'
  );
  const flexMatch = messageText.match(flexPattern);

  if (!flexMatch || flexMatch.index === undefined) {
    return null; // No match found with either strategy
  }

  // Return position after insertAfter text and any whitespace
  return flexMatch.index + flexMatch[1].length + flexMatch[2].length;
}

/**
 * Creates a prompt tag from a template and prompt text
 * @param tagTemplate - Template string (e.g., "<!--img-prompt=\"{PROMPT}\"-->")
 * @param promptText - The image generation prompt
 * @returns Complete prompt tag
 */
function createPromptTag(tagTemplate: string, promptText: string): string {
  // If template doesn't contain {PROMPT} placeholder, assume it's a regex pattern
  // and construct the tag manually using the standard format
  if (!tagTemplate.includes('{PROMPT}')) {
    // Default to HTML comment format
    return `<!--img-prompt="${promptText}"-->`;
  }

  // Replace {PROMPT} placeholder with actual prompt text
  return tagTemplate.replace(/\{PROMPT\}/g, promptText);
}

/**
 * Inserts image prompt tags into message text using context-based matching
 *
 * For each suggestion, finds the unique match of insertAfter + insertBefore
 * and inserts the prompt tag between them. If multiple matches exist, uses
 * the first occurrence. If no match exists, skips that suggestion.
 *
 * @param messageText - Original message text
 * @param suggestions - Array of prompt suggestions with context
 * @param tagTemplate - Prompt tag template (e.g., "<!--img-prompt=\"{PROMPT}\"-->")
 * @returns Insertion result with updated text and statistics
 *
 * @example
 * const result = insertPromptTagsWithContext(
 *   "She walked through the forest under the moonlight.",
 *   [
 *     {
 *       text: "1girl, forest, moonlight",
 *       insertAfter: "through the forest",
 *       insertBefore: "under the moonlight"
 *     }
 *   ],
 *   "<!--img-prompt=\"{PROMPT}\"-->"
 * );
 * // result.updatedText: "She walked through the forest <!--img-prompt="1girl, forest, moonlight"--> under the moonlight."
 * // result.insertedCount: 1
 */
export function insertPromptTagsWithContext(
  messageText: string,
  suggestions: PromptSuggestion[],
  tagTemplate: string
): InsertionResult {
  logger.debug(
    `Inserting ${suggestions.length} prompt tags using context matching`
  );

  let updatedText = messageText;
  let insertedCount = 0;
  const failedSuggestions: PromptSuggestion[] = [];

  // Track cumulative offset as we insert tags
  // Each insertion shifts subsequent positions
  let cumulativeOffset = 0;

  // Sort suggestions by their intended insertion point to insert from left to right
  // This prevents position issues when multiple insertions occur
  const sortedSuggestions = suggestions.map((suggestion, originalIndex) => {
    const position = findInsertionPoint(
      messageText,
      suggestion.insertAfter,
      suggestion.insertBefore
    );
    return {
      suggestion,
      position,
      originalIndex,
    };
  });

  // Sort by position (nulls go to end)
  sortedSuggestions.sort((a, b) => {
    if (a.position === null) return 1;
    if (b.position === null) return -1;
    return a.position - b.position;
  });

  // Process each suggestion
  for (const {suggestion, position} of sortedSuggestions) {
    if (position === null) {
      // Context not found
      logger.warn(
        `Failed to find insertion point for prompt "${suggestion.text.substring(0, 50)}..."`
      );
      logger.debug(
        `  Looking for: after="${suggestion.insertAfter}" before="${suggestion.insertBefore}"`
      );
      failedSuggestions.push(suggestion);
      continue;
    }

    // Adjust position by cumulative offset from previous insertions
    const adjustedPosition = position + cumulativeOffset;

    // Create prompt tag
    const promptTag = createPromptTag(tagTemplate, suggestion.text);

    // Insert the tag
    updatedText =
      updatedText.substring(0, adjustedPosition) +
      ' ' +
      promptTag +
      ' ' +
      updatedText.substring(adjustedPosition);

    // Update cumulative offset (tag length + 2 spaces)
    cumulativeOffset += promptTag.length + 2;

    insertedCount++;

    logger.debug(
      `Inserted prompt at position ${adjustedPosition}: "${suggestion.text.substring(0, 50)}..."`
    );
  }

  logger.info(
    `Insertion complete: ${insertedCount}/${suggestions.length} prompts inserted`
  );

  if (failedSuggestions.length > 0) {
    logger.warn(`${failedSuggestions.length} prompts failed to insert`);
  }

  return {
    updatedText,
    insertedCount,
    failedSuggestions,
  };
}

/**
 * Validates a prompt suggestion has all required fields
 * @param suggestion - Suggestion to validate
 * @returns True if valid, false otherwise
 */
export function isValidSuggestion(
  suggestion: Partial<PromptSuggestion>
): suggestion is PromptSuggestion {
  return (
    typeof suggestion.text === 'string' &&
    suggestion.text.trim().length > 0 &&
    typeof suggestion.insertAfter === 'string' &&
    suggestion.insertAfter.trim().length > 0 &&
    typeof suggestion.insertBefore === 'string' &&
    suggestion.insertBefore.trim().length > 0
  );
}
