# Image Prompt Generation Task

Your task is to analyze the following assistant message and generate image prompts for key visual scenes.

## Message to Analyze

{{MESSAGE_TEXT}}

## Instructions

1. **Identify Visual Scenes**: Find 0-5 key visual moments in the message that are worth illustrating
   - Focus on scenes with clear visual descriptions
   - Prioritize major scene transitions, character introductions, or significant moments
   - Skip if the message has no visual content (pure dialogue, abstract concepts)

2. **Generate Tag-Based Prompts**: For each scene, create a tag-based image generation prompt
   - Use comma-separated tags in priority order
   - Structure: `[count], [character details], [action/pose], [environment], [lighting], [style], [quality tags]`
   - Always start with subject count: `1girl`, `2boys`, `1girl 1boy`, `no humans`, etc.
   - End with quality tags: `highly detailed`, `best quality`, `masterpiece`
   - Keep prompts concise: 15-40 tags ideal

3. **Specify Context for Insertion**: For each prompt, provide surrounding text snippets
   - **CRITICAL**: Copy text EXACTLY as it appears in the message (preserve punctuation, capitalization, spacing)
   - `insertAfter`: 10-30 character text snippet BEFORE where prompt should be inserted
   - `insertBefore`: 10-30 character text snippet AFTER where prompt should be inserted
   - Choose unique snippets that appear only once in the message
   - Include distinctive words, avoid generic phrases like "the", "and", "a" alone
   - The snippets should be adjacent or near-adjacent in the original text
   - Test: Search for `insertAfter` + `insertBefore` in the message - should find exactly one match

4. **Output Format**: Return a valid JSON object with this exact structure:

```json
{
  "prompts": [
    {
      "text": "1girl, long silver hair, blue dress, forest, sunset, soft lighting, highly detailed, best quality, masterpiece",
      "insertAfter": "walked through the ancient forest",
      "insertBefore": "under the canopy of trees",
      "reasoning": "Key visual: character entering forest at sunset"
    }
  ]
}
```

## Tag-Based Prompt Guidelines

### Subject Count (Always First Tag)
**Single character:**
- `1girl` / `1boy` / `1other`

**Multiple characters:**
- `2girls` / `2boys` / `1boy, 1girl`
- `3girls` / `2girls, 1boy` / `3boys`

**No humans:**
- `no humans` (for landscapes, objects, animals only)

### Character Details
**Hair:**
- Length: `long hair`, `short hair`, `medium hair`
- Style: `ponytail`, `braided hair`, `twin tails`, `wavy hair`
- Color: `black hair`, `blonde hair`, `silver hair`, `red hair`, `blue hair`

**Eyes:**
- `blue eyes`, `brown eyes`, `green eyes`, `red eyes`, `purple eyes`, `golden eyes`

**Body:**
- `slender`, `athletic`, `muscular`, `petite`, `curvy`

**Clothing:**
- Casual: `t-shirt`, `jeans`, `hoodie`, `sweater`, `dress`
- Formal: `suit`, `tie`, `formal dress`, `evening gown`
- Fantasy: `armor`, `robe`, `cloak`, `mage outfit`

### Expression & Pose
**Expressions:**
- `smiling`, `laughing`, `serious`, `sad`, `angry`, `surprised`
- `gentle smile`, `looking at viewer`, `looking away`

**Poses:**
- `standing`, `sitting`, `walking`, `running`, `jumping`, `lying down`
- `arms crossed`, `hand on hip`, `arms raised`

### Environment
**Indoor:** `bedroom`, `living room`, `kitchen`, `library`, `cafe`, `classroom`
**Outdoor:** `forest`, `beach`, `mountain`, `field`, `garden`, `city`, `street`
**Fantasy:** `castle`, `dungeon`, `ruins`, `temple`, `spaceship`
**Background:** `detailed background`, `simple background`, `blurred background`

### Lighting
- `sunlight`, `natural light`, `moonlight`, `sunset`, `golden hour`
- `soft lighting`, `dramatic lighting`, `volumetric lighting`
- `backlighting`, `rim lighting`

### Time & Weather
- Time: `morning`, `afternoon`, `evening`, `sunset`, `night`
- Weather: `sunny`, `cloudy`, `rainy`, `snowy`, `foggy`

### Art Style (Optional)
- `anime`, `anime style`, `digital art`, `concept art`, `illustration`
- `photorealistic`, `cinematic`, `dramatic`

### Quality Tags (Always Include)
**Essential:**
- `highly detailed`, `best quality`, `masterpiece`
- `absurdres`, `highres`, `8k`

## Important Rules

1. **Return Valid JSON Only**: No explanatory text before or after the JSON object
2. **Generate 0-5 Prompts**: Return empty array `{"prompts": []}` if no visual scenes warrant illustration
3. **Unique Context Snippets**: Ensure insertAfter/insertBefore combinations are unique and unambiguous
4. **Keep Prompts Concise**: 15-40 tags, focus on important visual elements
5. **Always Include Quality Tags**: Every prompt should end with quality modifiers
6. **Subject Count First**: Every prompt should start with 1girl/2boys/no humans/etc.

## Example Output

```json
{
  "prompts": [
    {
      "text": "1girl, long silver hair, white dress, standing in garden, surrounded by roses, afternoon sunlight, soft focus, highly detailed, best quality, masterpiece",
      "insertAfter": "She stepped into the rose garden",
      "insertBefore": "admiring the blooming flowers",
      "reasoning": "Character introduction in garden setting"
    },
    {
      "text": "no humans, mountain lake, crystal clear water, snow-capped peaks, sunset, orange sky, reflections on water, scenic vista, highly detailed, 8k, masterpiece",
      "insertAfter": "They reached the mountain lake",
      "insertBefore": "The water was perfectly still",
      "reasoning": "Landscape description of mountain lake at sunset"
    }
  ]
}
```

Now analyze the message and generate appropriate image prompts with context-based insertion points.
