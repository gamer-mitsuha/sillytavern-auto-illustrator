# Image Prompt Writing Guidelines (LLM Mode)

Generate image prompts using a structured tag-based format. Focus on clear visual descriptions with specific details.

## Core Approach: Tag-Based Format

Use comma-separated tags for precise and controllable results:

- **Structure:** `[subject count], [character details], [action/pose], [environment], [lighting], [style], [quality tags]`
- Always start with subject count: `1girl`, `2boys`, `1boy, 1girl`, `no humans`, etc.
- Always end with quality tags: `highly detailed`, `best quality`, `masterpiece`
- Keep prompts concise: 15-40 tags is ideal

## Subject Count (Always First Tag)

**Single subject:**
- `1girl` / `1boy` / `1other` - One character
- `no humans` - Landscapes, objects, animals only

**Multiple subjects:**
- `2girls` / `2boys` / `1boy, 1girl` - Two characters
- `3girls` / `2girls, 1boy` - Three characters
- Maximum 6 characters recommended

## Character Details

### Hair:
- **Length:** `long hair`, `short hair`, `very long hair`
- **Style:** `ponytail`, `twin braids`, `messy hair`, `straight hair`, `wavy hair`
- **Color:** `black hair`, `blonde hair`, `silver hair`, `red hair`, `brown hair`

### Eyes:
`blue eyes`, `brown eyes`, `green eyes`, `red eyes`, `purple eyes`, `golden eyes`

### Body Type:
`slender`, `athletic`, `muscular`, `petite`, `tall`

### Clothing:
- **Casual:** `t-shirt`, `jeans`, `dress`, `sweater`, `hoodie`
- **Formal:** `suit`, `formal dress`, `business attire`, `tuxedo`
- **Fantasy:** `armor`, `robe`, `cloak`, `cape`
- **Traditional:** `kimono`, `hanfu`, `qipao`, `yukata`

## Expression & Pose

### Expressions:
- `smiling`, `serious expression`, `surprised`, `gentle smile`, `laughing`, `determined look`
- `looking at viewer`, `eyes closed`, `looking away`, `looking up`, `looking down`

### Poses:
- **Standing:** `standing`, `arms crossed`, `hand on hip`, `arms at sides`
- **Sitting:** `sitting`, `sitting on chair`, `kneeling`, `crouching`
- **Dynamic:** `walking`, `running`, `jumping`, `reaching`
- **Arms:** `arms raised`, `one arm raised`, `hands clasped`, `hand in hair`

## Environment & Setting

### Indoor locations:
`bedroom`, `living room`, `kitchen`, `office`, `library`, `classroom`, `cafe`

### Outdoor locations:
`garden`, `forest`, `beach`, `mountain`, `city street`, `park`, `field`

### Background details:
- `detailed background`, `simple background`, `white background`, `gradient background`
- `indoors`, `outdoors`, `scenery`

## Lighting

### Light types:
- `sunlight`, `moonlight`, `candlelight`, `artificial light`, `natural light`
- `morning light`, `afternoon sun`, `sunset`, `golden hour`, `dusk`

### Light effects:
- `soft lighting`, `dramatic lighting`, `rim lighting`, `backlighting`
- `dappled sunlight`, `light rays`, `volumetric lighting`, `god rays`

### Atmosphere:
`warm lighting`, `cool lighting`, `moody lighting`, `bright`, `dim`

## Composition & Framing

### Shot types (always specify):
- `portrait` - Head and shoulders only
- `upper body` - From waist up
- `cowboy shot` - From mid-thigh up
- `full body` - Entire body visible

### Camera angles:
- `from above`, `from below`, `from side`, `from behind`
- `straight-on`, `dutch angle`, `bird's eye view`, `worm's eye view`

### Distance:
`close-up`, `medium shot`, `wide shot`, `extreme close-up`

## Style & Medium

### Art styles:
- `anime style`, `manga style`, `realistic`, `semi-realistic`, `stylized`
- `painterly`, `cel shaded`, `soft shading`, `detailed shading`

### Art mediums:
- `digital art`, `oil painting`, `watercolor`, `pencil sketch`, `ink drawing`
- `concept art`, `illustration`, `character design`

### Color schemes:
- `vibrant colors`, `muted colors`, `pastel colors`, `monochrome`
- `warm colors`, `cool colors`, `limited palette`, `colorful`

## Multi-Character Scenes (2+ Characters)

When prompting scenes with multiple characters, be very specific about:

### Positioning:
- `side by side`, `facing each other`, `back to back`, `standing together`
- `close together`, `far apart`, `in a circle`

### Character differentiation (describe each separately):
```
2girls, garden, afternoon, masterpiece, best quality, first girl with long black hair and blue dress on left, second girl with short blonde hair and red dress on right, both smiling, looking at each other
```

### Interactions:
- `talking`, `holding hands`, `waving`, `pointing at`
- `looking at another`, `reaching toward another`

## Quality & Detail Tags (Mandatory)

Always include these at the end:
- `masterpiece` - Highest quality indicator
- `best quality` - Essential quality baseline
- `highly detailed` - Adds detail and refinement

Additional quality tags:
- `absurdres` - Very high resolution
- `detailed background`, `detailed clothing`, `detailed hair`
- `sharp focus`, `crisp`, `clear`

## Character Consistency

### For known characters from anime/games/novels:
- Use character name and series: `character_name (series_name)`
- Example: `emilia (re:zero)`, `frieren (sousou no frieren)`
- Do not override their canonical appearance (hair/eye color, etc.)

### For original characters:
- Use identical descriptions throughout the story
- Keep consistent: hair color, eye color, body type, distinctive features
- Maintain consistency across all prompts

## Negative Elements to Avoid

Common issues to prevent:
- **Poor anatomy:** bad hands, extra fingers, malformed limbs
- **Poor quality:** blurry, low resolution, artifacts
- **Unwanted elements:** text, watermarks, signatures
- **Art style issues:** sketch lines (if want finished art), inconsistent style

## Example Prompts

### Single character portrait:
```
1girl, bedroom, morning sunlight, sitting on bed, long red hair, purple eyes, peaceful expression, white nightgown, soft lighting, detailed background, masterpiece, best quality, highly detailed
```

### Landscape with no characters:
```
no humans, ancient forest, towering trees, dappled sunlight, moss-covered ground, mysterious atmosphere, fantasy setting, detailed scenery, masterpiece, best quality, highly detailed
```

### Two characters interacting:
```
1boy, 1girl, living room, afternoon, sitting on couch, close together, masterpiece, best quality, soft lighting, warm atmosphere, girl with long silver hair and purple eyes wearing white dress on left leaning against him with head on shoulder smiling, boy with short black hair and blue eyes wearing casual shirt on right with arm around her shoulders looking down at her with gentle smile
```

### Action scene:
```
1girl, outdoor field, sunny day, running, long blonde hair flowing, blue eyes, determined expression, athletic outfit, arms pumping, dynamic pose, motion blur in background, bright lighting, detailed grass and flowers, masterpiece, best quality, highly detailed
```

### Character with detailed environment:
```
1girl, library, afternoon, standing by window, long brown hair, green eyes, reading book, glasses, scholar robes, concentrated expression, bookshelves in background, dust particles in sunbeam, warm sunlight through window, detailed interior, masterpiece, best quality, highly detailed
```

## Critical Reminders

✅ Always include subject count as the first tag

✅ Always include quality tags at the end: `masterpiece`, `best quality`, `highly detailed`

✅ Specify framing: `portrait`, `upper body`, `cowboy shot`, or `full body`

✅ For known characters: Use `character_name (series_name)` format

✅ Tag order matters: Earlier tags have stronger influence

✅ Be specific: More detail = better results

✅ For multiple characters: Clearly describe each character's position and appearance
