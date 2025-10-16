/**
 * Mode Utilities
 * Helper functions for prompt generation mode checks
 */

/**
 * Checks if prompt generation mode is independent API
 * (supports both new name and legacy alias)
 * @param mode - The prompt generation mode to check
 * @returns True if mode is independent-api or llm-post (legacy)
 */
export function isIndependentApiMode(mode: string | undefined): boolean {
  return mode === 'independent-api' || mode === 'llm-post';
}
