/**
 * Internationalization Module
 * Provides translation helpers for the Auto Illustrator extension
 */

/**
 * Cached reference to SillyTavern's translate function
 */
let translateFn: ((text: string, key?: string | null) => string) | null = null;

/**
 * Initialize the i18n module with SillyTavern context
 * @param context - SillyTavern context
 */
export function initializeI18n(context: SillyTavernContext): void {
  translateFn = context.translate;
}

/**
 * Translates a key to the current locale
 * @param key - Translation key
 * @param replacements - Optional object with replacement values for placeholders
 * @returns Translated string
 */
export function t(
  key: string,
  replacements?: Record<string, string | number>
): string {
  // Use SillyTavern's translate function
  // First argument is the default text (fallback), second is the key
  const translatedText = translateFn ? translateFn(key, key) : key;

  // If no replacements, return as is
  if (!replacements) {
    return translatedText;
  }

  // Replace placeholders like {count}, {name}, etc.
  let result = translatedText;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replace(
      new RegExp(`\\{${placeholder}\\}`, 'g'),
      String(value)
    );
  }

  return result;
}

/**
 * Helper to format plural forms
 * For Chinese, plural forms are the same as singular, but we keep count in the string
 * @param count - Number to check
 * @param key - Translation key
 * @param replacements - Optional object with replacement values
 * @returns Translated string with count
 */
export function tCount(
  count: number,
  key: string,
  replacements?: Record<string, string | number>
): string {
  return t(key, {...replacements, count});
}
