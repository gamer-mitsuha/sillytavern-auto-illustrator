# NovelAI 4.5 FULL Image Prompt Generation Guide

Generate image prompts for NovelAI Diffusion 4.5 Full using structured tag-based prompts. Insert prompts at natural narrative points, approximately every 250 words or at major scene changes.

**IMPORTANT: Generate image prompts frequently throughout the story - aim for approximately one prompt every 250 words or at each major scene change.**

**CRITICAL MULTI-CHARACTER RULE: When a scene has 2 or more characters present, you MUST use the pipe `|` separator syntax. This is NOT optional - it is required for proper multi-character generation.**

---

## Core Philosophy: Tags as Foundation, Prose for Nuance

NovelAI is trained on Danbooru's tag system. **Tag-based prompts** (comma-separated) provide the most precise and controllable results for most use cases.

**Tags are superior for:**
- Character consistency and specific attributes
- Style control and art medium selection
- Precise visual elements (colors, clothing, objects)
- Reproducible and predictable results

**Natural language can enhance prompts for:**
- Complex scenes with specific moods and atmospheres (e.g., "a sense of tension and anticipation")
- Intricate relationships between characters (e.g., "a knight protecting a child from a dragon")
- Nuanced descriptions that tags alone might not capture
- Creative exploration beyond standard conventions

**Best practice: Hybrid approach**
- Start with natural language for scene/mood/relationships
- Follow with tags for precision: quality tags, style tags, specific attributes
- Example: `A majestic tiger stalking through tropical rainforest, dappled sunlight, masterpiece, best quality, cinematic lighting, vibrant colors, detailed fur`

**However, for most prompts in story illustration, tag-based format is recommended for consistency and control.**

---

## Format Requirements

**Format:** `<!--img-prompt="your description here"-->`

**Frequency:** Insert prompts approximately **every 250 words** or at major scene changes. Don't skip scenes - each significant moment should have a visual prompt.

**Example:**
```
Story text continues.
<!--img-prompt="1girl, bedroom, sitting, long hair, smiling, very aesthetic, masterpiece, best quality, highres, no text, no watermark"-->
More story text.
```

---

## Prompt Structure

Every prompt should follow this order for optimal results:

1. **Subject count tags** (MANDATORY): `1girl`, `2boys`, `1boy, 1girl`, `no humans`
2. **Character specifics**: Character names, series tags if known
3. **Quality & aesthetic tags** (MANDATORY): `very aesthetic, masterpiece, best quality, highres, no text, no watermark`
4. **Style tags**: Art medium, artist style, art movement
5. **Composition**: Shot type, angle, pose
6. **Environment**: Location, background details
7. **Lighting**: Light type, effects
8. **Color scheme**: Dominant colors, color style
9. **Detailed descriptors**: Clothing, expression, hair, eyes, accessories

**Tag order matters:** Earlier tags have stronger influence. This is a "priority instruction list", not a "bag of words".

---

## Mandatory Quality Tags

**ALWAYS include these in EVERY prompt for high-quality output:**

NovelAI's official default quality tags (recommended to use all):
- `very aesthetic` - Enhanced aesthetic quality
- `masterpiece` - Most powerful aesthetic tag for V4.5
- `best quality` - Essential quality baseline
- `highres` - High resolution output
- `no text` - Prevents text artifacts in image
- `no watermark` - Prevents watermark artifacts

Additional optional quality tag:
- `absurdres` - Absolute high resolution quality

**Recommended quality tag string:** `very aesthetic, masterpiece, best quality, highres, no text, no watermark`

---

## Subject Count Tags (MANDATORY)

**Always start prompts with:**
- `no humans` - No people (landscapes, objects)
- `1girl` / `1boy` / `1other` - Single character
- `2girls` / `2boys` / `1boy, 1girl` - Two characters
- `3girls` / `2girls, 1boy` etc. - Three+ characters (max 6)

---

## Style Control Tags

### Art Medium
- `oil painting (medium)` - Oil painting texture
- `watercolor (medium)` - Watercolor transparency
- `ink (medium)` - Ink/pen drawing style
- `sketch` - Sketch/rough style
- `anime screencap` - Anime screenshot style
- `game cg` - Game CG style

### Art Style
- `art nouveau` - Decorative curves, organic forms
- `impressionism` - Light/shadow emphasis
- `ukiyo-e` - Japanese woodblock print
- `realistic` / `photorealistic` - Photographic realism

### Coloring
- `monochrome` - Black and white
- `pastel colors` - Soft, low saturation colors
- `limited palette` - Few colors, unified look
- `high contrast` - Strong light/dark contrast

### Special Effects
- `bokeh` - Blurred background with light spots
- `lens flare` - Light flare effect
- `chromatic aberration` - Color fringing effect
- `motion blur` - Speed/movement blur

---

## Special Tags

**Year tags:** `year XXXX` - Mimic art style from specific year
- Example: `year 2014` for 2014 anime aesthetics

**Location tag:** `location` - Combines indoor/outdoor, indicates specific scene needed

**Dataset tags (MUST be at very start):**
- `fur dataset` - For furry/kemono art
- `background dataset` - For landscapes, no people, photographic style

---

## Tag Emphasis System

### Bracket Emphasis
- `{tag}` - Strengthen by ×1.05
- `{{tag}}` - Strengthen by ×1.1025
- `[tag]` - Weaken by ÷1.05
- `[[tag]]` - Weaken by ÷1.1025

### Numerical Emphasis
- `1.5::tag::` - Multiply weight by 1.5
- `0.5::tag::` - Multiply weight by 0.5
- `-1::tag::` - Negative weight (removes/inverts concept)

**Negative weight examples:**
- `-1::hat::` - Remove hat from character
- `-1::monochrome::` - Force colorful image
- `-2.5::flat color::` - Add detailed shading

**In Undesired Content:** Emphasis works in reverse - `{tag}` means avoid more strongly

---

## Multi-Character Prompting (2+ characters)

**CRITICAL: When scenes involve 2+ characters, ALWAYS use the pipe `|` separator syntax for best results.**

**❌ WRONG - Do NOT use this format for multi-character scenes:**
```
1boy, 1girl, indoors, living room, close-up, emilia (re:zero), long silver hair, purple eyes, white dress, flushed cheeks, arms around neck, looking at viewer, short dark hair, casual clothes, gentle expression, very aesthetic, masterpiece, best quality, highres, no text, no watermark
```
*This format will confuse the AI about which features belong to which character! Both characters' features are mixed together without clear separation.*

**✅ CORRECT - ALWAYS use pipe separators for 2+ characters:**
```
1boy, 1girl, indoors, living room, close-up, intimate distance, very aesthetic, masterpiece, best quality, highres, no text, no watermark | girl, emilia (re:zero), long silver hair, purple eyes, white dress, flushed cheeks, source#embrace, arms around neck, looking at viewer | boy, short dark hair, casual clothes, target#embrace, close to her, gentle expression
```

**Structure:** `base prompt | character 1 | character 2 | ...`

**Base prompt must include:**
- Subject count tags (MANDATORY): `2girls`, `1boy, 1girl`, `3boys`, etc.
- Quality tags (MANDATORY): `very aesthetic, masterpiece, best quality, highres, no text, no watermark`
- Scene, location, lighting
- Spatial positioning: `side by side`, `facing each other`, `close together`

**Each character prompt must include:**
- Character type (no number): `girl`, `boy`, `other`
- Character name if known: `character_name (series_name)`
- Physical features: hair color, eye color, body type
- Clothing, expression, pose
- Body framing: `upper body`, `full body`, `portrait`
- **Action tags with prefixes when interacting (see below)**

**Interaction action tag prefixes:**

Use these when characters interact physically or socially:

- `source#[action]` - The character actively performing/initiating the action
- `target#[action]` - The character passively receiving the action
- `mutual#[action]` - Both characters doing the action together simultaneously

**Common interaction actions:**

**Physical contact:**
- Hugging: `source#hug` (person hugging), `target#hug` (being hugged), `mutual#hug` (both hugging each other)
- Kissing: `source#kiss` (initiating kiss), `target#kiss` (receiving kiss), `mutual#kiss` (both kissing)
- Headpat: `source#headpat` (giving headpat), `target#headpat` (receiving headpat)
- Embrace: `source#embrace` (embracing), `target#embrace` (being embraced)
- Hand holding: `mutual#handholding` (both holding hands)
- Dancing: `mutual#dancing` (dancing together)
- High five: `mutual#high five` (both giving high five)

**Visual interaction:**
- Looking: `source#looking at another` (actively looking), `target#being looked at` (being looked at)

**Social interaction:**
- Communication: `source#talking`, `target#listening`
- Pointing: `source#pointing`, `target#pointed at`
- Laughing: `mutual#laughing` (laughing together)
- Playing: `mutual#playing` (playing together)

**When to use which prefix:**
- If one character is clearly doing something TO another → use `source#` and `target#`
- If both characters are doing the same action together → use `mutual#` for both
- Example: Person A hugging Person B → A gets `source#hug`, B gets `target#hug`
- Example: Two people hugging each other equally → Both get `mutual#hug`

**Why this matters:** Without pipe separators and proper action tags, the AI cannot properly understand which physical features and actions belong to which character, leading to confused or incorrect anatomy.

---

## Composition & Framing

**Always specify framing:**
- `portrait` - Head and shoulders
- `upper body` - Waist up
- `cowboy shot` - Thighs up
- `full body` - Entire body visible
- `from above` / `from below` / `from side` / `from behind` - Camera angle

**Pose details (be specific):**
- Arms: `arms at sides`, `arms crossed`, `arms raised`, `one arm raised`
- Hands: `hands on hips`, `hands clasped`, `hand in hair`, `hands together`
- Legs: `legs crossed`, `legs apart`, `one knee up`
- Sitting: `sitting`, `seiza`, `crossed legs`, `legs to side`
- Standing: `standing`, `contrapposto`, `casual stance`
- Action: `walking`, `running`, `jumping`, `reaching`

**More detail = Better anatomy.** For complex poses, add MORE tags, not fewer.

---

## Negative Prompts (Undesired Content)

**Core principle:** Describe what you DON'T want directly (use `blurry`, not `not sharp`)

**Essential negative prompts:**

**Quality:**
`lowres, worst quality, bad quality, normal quality, low quality, jpeg artifacts, blurry, ugly`

**Anatomy:**
`bad anatomy, bad hands, missing fingers, extra digit, fewer digits, bad feet, malformed limbs, extra limbs, fused fingers, bad proportions`

**Artifacts:**
`text, watermark, signature, username, artist name, error, cropped, out of frame`

**Style issues:**
`monochrome` (if want color), `sketch` (if want finished), `duplicate, mutation, deformed, bad composition`

**Warning:** Over-stuffing negative prompts can reduce AI creativity. Use strategically based on specific needs.

---

## Character Consistency

**For known characters (from anime/game/novel):**
- **CRITICAL: Always use Danbooru character tags** in format: `character_name (series_name)`
- This ensures the AI recognizes the character and generates consistent appearance
- Examples: `nilou (genshin impact)`, `frieren (sousou no frieren)`, `hatsune miku (vocaloid)`
- Check Danbooru to find the exact tag format for the character
- **IMPORTANT: When using character tags, DO NOT override their canonical features (hair color, eye color, etc.) unless intentionally creating an AU version**

**For original characters:**
- Use identical descriptions throughout: hair color, eye color, body type, clothing, distinctive features
- Be consistent with every detail to maintain character appearance across multiple images
- Keep a character reference sheet with exact tags to use consistently

---

## Example Prompts

**Single character:**
```
<!--img-prompt="1girl, bedroom, morning sunlight, sitting on bed, long red hair, purple eyes, peaceful expression, white nightgown, very aesthetic, masterpiece, best quality, highres, no text, no watermark, soft lighting, detailed background"-->
```

**No humans landscape:**
```
<!--img-prompt="no humans, ancient forest, towering trees, dappled sunlight, moss-covered ground, mysterious atmosphere, very aesthetic, masterpiece, best quality, highres, no text, no watermark, detailed, fantasy"-->
```

**Two characters with mutual interaction (cuddling):**
```
<!--img-prompt="1boy, 1girl, living room, afternoon, sitting on couch, close together, mutual#cuddling, very aesthetic, masterpiece, best quality, highres, no text, no watermark, soft lighting, warm atmosphere | girl, emilia (re:zero), long silver hair, purple eyes, white dress, leaning against him, head on shoulder, smiling, eyes closed, relaxed expression | boy, short black hair, blue eyes, casual shirt and jeans, arm around her shoulders, gentle smile, looking down at her"-->
```

**Two characters with source/target interaction (embrace):**
```
<!--img-prompt="1boy, 1girl, bedroom, evening, close-up, intimate distance, very aesthetic, masterpiece, best quality, highres, no text, no watermark, soft lighting | girl, emilia (re:zero), long silver hair, purple eyes, white dress, flushed cheeks, source#embrace, arms around his neck, looking up at him, gentle smile | boy, short dark hair, brown eyes, casual shirt, target#embrace, hands on her waist, looking down at her, affectionate expression"-->
```

**Two characters - headpat interaction:**
```
<!--img-prompt="1boy, 1girl, school hallway, afternoon, standing, very aesthetic, masterpiece, best quality, highres, no text, no watermark | boy, tall, short brown hair, school uniform, source#headpat, hand on her head, smiling, looking down at her | girl, shorter, long black hair, school uniform, target#headpat, looking up, blushing, happy expression, hands clasped in front"-->
```

**Group scene - three characters:**
```
<!--img-prompt="3girls, park, sunny day, standing together, cherry blossoms, very aesthetic, masterpiece, best quality, highres, no text, no watermark, vibrant colors, spring atmosphere | girl, long blonde hair, green eyes, sundress, holding ice cream, laughing, looking at friends | girl, short pink hair, blue eyes, casual t-shirt and shorts, peace sign, cheerful smile | girl, medium brown hair, brown eyes, cardigan and skirt, shy smile, holding camera"-->
```

**Action scene - running:**
```
<!--img-prompt="1girl, city street, late afternoon, running, dynamic pose, motion blur background, very aesthetic, masterpiece, best quality, highres, no text, no watermark, cinematic | girl, frieren (sousou no frieren), long white hair flowing, green eyes, mage outfit, determined expression, full body, from side, arms pumping"-->
```

**Character portrait:**
```
<!--img-prompt="1girl, indoor cafe, afternoon window light, portrait, close-up, very aesthetic, masterpiece, best quality, highres, no text, no watermark, bokeh background, warm lighting | girl, long black hair, brown eyes, cozy sweater, holding coffee cup, gentle smile, looking at viewer, soft expression"-->
```

---

## Critical Reminders

- **GENERATE FREQUENTLY: Every ~250 words or major scene change**
- **ALWAYS include official quality tags: `very aesthetic, masterpiece, best quality, highres, no text, no watermark`**
- **ALWAYS include subject count tags: `1girl`, `2boys`, `1boy, 1girl`, etc.**
- **For known characters: MUST use Danbooru character tags `character_name (series_name)` and DO NOT override canonical features**
- **Tag order matters: Earlier tags = stronger influence**
- **🔴 CRITICAL: For 2+ characters, MUST use `|` separator - NO EXCEPTIONS**
- **🔴 CRITICAL: For character interactions, use appropriate action tags:**
  - `source#[action]` for character performing action
  - `target#[action]` for character receiving action  
  - `mutual#[action]` for simultaneous mutual action
- **More specific tags = better anatomy**
- **Complex poses need MAXIMUM detail**
- **Use emphasis system for fine control: `{tag}`, `1.5::tag::`, `-1::tag::`**

---

**Provide the complete story content with image prompts inserted at natural narrative moments. Each `<!--img-prompt="..."-->` tag must be on its own line (no extra blank lines before/after), with entire tag content on a single line.**
