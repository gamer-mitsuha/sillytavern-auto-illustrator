/**
 * Test Helper Functions
 * Utilities for creating mock objects in tests
 */

/**
 * Creates a partial mock SillyTavern context for testing
 * This allows tests to only specify the properties they need
 */
export function createMockContext(
  partial: Partial<SillyTavernContext> = {}
): SillyTavernContext {
  return partial as SillyTavernContext;
}
