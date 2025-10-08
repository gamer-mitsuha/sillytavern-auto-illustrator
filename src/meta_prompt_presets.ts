/**
 * Meta Prompt Presets Module
 * Manages predefined and custom meta prompt presets
 */

/**
 * Meta prompt preset interface
 */
export interface MetaPromptPreset {
  id: string;
  name: string;
  template: string;
  predefined: boolean;
}

/**
 * Predefined preset IDs
 */
export const PRESET_IDS = {
  DEFAULT: 'default',
  NAI_45_FULL: 'nai-4.5-full',
} as const;

/**
 * Gets the default meta prompt template
 * @returns The default meta prompt string
 */
function getDefaultTemplate(): string {
  return `
IMPORTANT INSTRUCTION: As you generate your response, you MUST include image generation prompts inline with your narrative.

Every 250 words (approximately), insert an image generation prompt using this EXACT format:
<img_prompt="detailed description of the scene, character, or setting to visualize">

Rules for image prompts:
1. Use the exact format: <img_prompt="your description here">
2. The description should be detailed and visual, describing what should be in the image
3. Focus on visual elements: character appearance, setting, atmosphere, actions, etc.
4. Keep descriptions concise but descriptive (1-2 sentences)
5. Generate prompts naturally within the flow of your narrative
6. Must add the danbooru character name if the character is from a game / anime / novel, etc.
7. Use "rating:nsfw" tag for nsfw scenarios

Example:
The sun was setting over the ancient castle <img_prompt="medieval stone castle silhouette against orange and purple sunset sky, dramatic lighting, fantasy atmosphere"> as the knight approached the gates. The heavy wooden doors creaked open...
`.trim();
}

/**
 * Gets the NAI 4.5 Full meta prompt template
 * @returns The NAI 4.5 Full meta prompt string
 */
function getNai45FullTemplate(): string {
  return `
You will be adding image generation prompts to story content for a SillyTavern extension that uses NovelAI Diffusion 4.5 Full (NAI 4.5 Full). Your goal is to insert detailed, consistent image prompts that will generate high-quality visual representations of the story scenes.

Your task is to insert image generation prompts throughout the story content at natural narrative points, approximately every 250 words. These prompts will be used with NAI 4.5 Full, so they should be optimized for that model.

**Image Prompt Format Requirements:**
- Use this EXACT format: <img_prompt="your description here">
- Insert prompts inline with the narrative at natural break points
- Aim for approximately one prompt every 250 words, but prioritize natural placement over exact word count

**Content Guidelines for NAI 4.5 Full:**
1. **Character Consistency**: For the same character, always use identical physical descriptions (hair color, eye color, clothing style, distinctive features), unless their looking changed according to the story. If the character is from an anime/game/novel, include their danbooru tag name.
2. **Visual Details**: Focus on concrete visual elements - character appearance, facial expressions, body language, clothing, setting details, lighting, atmosphere
3. **NAI 4.5 Optimization**: Use descriptive tags that work well with NAI 4.5, including art style descriptors when appropriate (e.g., "anime style", "detailed illustration", "high quality")
4. **Scene Description**: Describe the specific moment or scene being depicted, not general concepts
5. **NSFW Handling**: Add "rating:nsfw" tag for adult content scenarios

**Prompt Content Rules:**
- Keep each description concise but detailed (1-2 sentences maximum)
- Include character names and key visual identifiers
- Describe poses, expressions, and interactions when relevant
- Include environmental details that set the scene
- Maintain consistency in character descriptions throughout
- Use present tense and active descriptions

**Example prompt**
\`\`\`
<img_prompt="morning sunlight filtering through curtains, nilou (genshin impact) sleeping peacefully in bed, long red hair spread on white pillow, closed eyes with long lashes, man with short black hair beside her, soft warm lighting, detailed anime style">
\`\`\`

Provide the complete story content with image prompts properly inserted. Maintain all original text while adding the image generation prompts at appropriate narrative moments.
`.trim();
}

/**
 * Predefined presets array
 */
const PREDEFINED_PRESETS: MetaPromptPreset[] = [
  {
    id: PRESET_IDS.DEFAULT,
    name: 'Default',
    template: getDefaultTemplate(),
    predefined: true,
  },
  {
    id: PRESET_IDS.NAI_45_FULL,
    name: 'NAI 4.5 Full',
    template: getNai45FullTemplate(),
    predefined: true,
  },
];

/**
 * Gets all predefined presets
 * @returns Array of predefined presets
 */
export function getPredefinedPresets(): MetaPromptPreset[] {
  return PREDEFINED_PRESETS;
}

/**
 * Gets a predefined preset by ID
 * @param id - Preset ID
 * @returns Predefined preset or undefined if not found
 */
export function getPredefinedPresetById(
  id: string
): MetaPromptPreset | undefined {
  return PREDEFINED_PRESETS.find(preset => preset.id === id);
}

/**
 * Gets a preset by ID, checking both custom and predefined presets
 * @param id - Preset ID
 * @param customPresets - Array of custom presets
 * @returns Preset object, or default preset if not found
 */
export function getPresetById(
  id: string,
  customPresets: MetaPromptPreset[]
): MetaPromptPreset {
  // Check custom presets first
  const customPreset = customPresets.find(preset => preset.id === id);
  if (customPreset) {
    return customPreset;
  }

  // Check predefined presets
  const predefinedPreset = getPredefinedPresetById(id);
  if (predefinedPreset) {
    return predefinedPreset;
  }

  // Return default preset as fallback
  return PREDEFINED_PRESETS[0];
}

/**
 * Checks if a preset ID is predefined
 * @param id - Preset ID to check
 * @returns True if preset is predefined
 */
export function isPresetPredefined(id: string): boolean {
  return PREDEFINED_PRESETS.some(preset => preset.id === id);
}

/**
 * Checks if a preset name belongs to a predefined preset (case-insensitive)
 * @param name - Preset name to check
 * @returns True if name is a predefined preset name
 */
export function isPredefinedPresetName(name: string): boolean {
  const lowerName = name.toLowerCase();
  return PREDEFINED_PRESETS.some(
    preset => preset.name.toLowerCase() === lowerName
  );
}

/**
 * Gets the default meta prompt template (for backwards compatibility)
 * @returns The default meta prompt string
 */
export function getDefaultMetaPrompt(): string {
  return getDefaultTemplate();
}
