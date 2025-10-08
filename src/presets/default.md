# Universal Image Prompt Generation Guide (Tag-Based)

Generate tag-based image prompts for AI image generation models. Insert prompts approximately every 250 words or at major scene changes.

**Format:** `<!--img-prompt="your description here"-->`

**Tag-based prompts work universally across Stable Diffusion, NovelAI, FLUX, and most diffusion models.**

---

## Tag-Based Format

**Structure:** Comma-separated tags in priority order (earlier tags = stronger influence)

```
[subject count], [character details], [action/pose], [environment], [lighting], [style], [quality tags]
```

**Example:**
```
1girl, long silver hair, blue eyes, white dress, standing in garden, surrounded by flowers, afternoon sunlight, soft focus, highly detailed, best quality
```

---

## Core Components

### 1. Subject Count (Required - Always First)

**Single character:**
- `1girl` / `1boy` / `1other`

**Multiple characters:**
- `2girls` / `2boys` / `1boy, 1girl`
- `3girls` / `2girls, 1boy` / `3boys`
- Up to 6 characters max

**No humans:**
- `no humans` (for landscapes, objects, animals only)

### 2. Character Details

**Hair:**
- Length: `long hair`, `short hair`, `medium hair`, `very long hair`
- Style: `straight hair`, `wavy hair`, `curly hair`, `ponytail`, `braided hair`, `twin tails`
- Color: `black hair`, `blonde hair`, `brown hair`, `red hair`, `white hair`, `silver hair`, `blue hair`, `pink hair`

**Eyes:**
- Color: `blue eyes`, `brown eyes`, `green eyes`, `red eyes`, `purple eyes`, `golden eyes`
- Features: `heterochromia`, `glowing eyes`, `closed eyes`

**Body:**
- Build: `slender`, `athletic`, `muscular`, `petite`, `curvy`, `tall`, `short`
- Features: `pale skin`, `dark skin`, `tan skin`, `freckles`

**Clothing:**
- Casual: `t-shirt`, `jeans`, `hoodie`, `sweater`, `casual dress`, `shorts`
- Formal: `suit`, `dress shirt`, `tie`, `formal dress`, `evening gown`, `tuxedo`
- Fantasy: `armor`, `robe`, `cloak`, `leather outfit`, `mage outfit`, `knight armor`
- Modern: `school uniform`, `business suit`, `sportswear`, `kimono`, `yukata`
- State: `partially clothed`, `torn clothes`, `wet clothes`

### 3. Expression & Pose

**Expressions:**
- `smiling`, `grinning`, `laughing`, `serious`, `sad`, `angry`, `surprised`, `shocked`
- `gentle smile`, `smirk`, `frown`, `crying`, `blushing`, `embarrassed`
- `eyes closed`, `looking at viewer`, `looking away`, `looking down`, `looking up`

**Body poses:**
- Standing: `standing`, `contrapposto`, `casual stance`
- Sitting: `sitting`, `sitting on chair`, `sitting on ground`, `seiza`, `crossed legs`
- Action: `running`, `walking`, `jumping`, `fighting`, `dancing`, `flying`, `falling`
- Resting: `lying down`, `lying on back`, `lying on side`, `reclining`, `sleeping`
- Other: `kneeling`, `crouching`, `leaning`, `stretching`

**Arms & hands:**
- `arms at sides`, `arms crossed`, `arms raised`, `arms behind back`, `arms up`
- `hand on hip`, `hands on hips`, `hands together`, `hand on own chest`
- `waving`, `pointing`, `reaching`, `grabbing`, `holding object`

**Legs:**
- `legs crossed`, `legs apart`, `one knee up`, `legs together`

### 4. Environment & Setting

**Indoor locations:**
- `bedroom`, `living room`, `kitchen`, `bathroom`, `office`, `classroom`
- `library`, `cafe`, `restaurant`, `shop`, `museum`, `hallway`, `corridor`

**Outdoor locations:**
- `forest`, `beach`, `mountain`, `field`, `meadow`, `garden`, `park`
- `city`, `street`, `alley`, `rooftop`, `bridge`, `river`, `lake`

**Fantasy/Sci-fi:**
- `castle`, `dungeon`, `tower`, `ruins`, `temple`, `shrine`
- `spaceship`, `space station`, `laboratory`, `futuristic city`, `cyberpunk city`

**Background:**
- `detailed background`, `simple background`, `blurred background`, `bokeh`
- `white background`, `black background`, `gradient background`, `abstract background`

**Time & weather:**
- Time: `morning`, `noon`, `afternoon`, `evening`, `sunset`, `night`, `midnight`, `dawn`, `dusk`
- Weather: `sunny`, `cloudy`, `overcast`, `rainy`, `snowy`, `foggy`, `misty`, `stormy`
- Season: `spring`, `summer`, `autumn`, `winter`

### 5. Lighting

**Natural lighting:**
- `sunlight`, `natural light`, `daylight`, `moonlight`, `starlight`
- `sunrise`, `sunset`, `golden hour`, `blue hour`, `twilight`

**Quality:**
- `bright lighting`, `dim lighting`, `dramatic lighting`, `soft lighting`, `harsh lighting`
- `warm lighting`, `cool lighting`, `volumetric lighting`, `god rays`, `light rays`

**Direction:**
- `front lighting`, `backlighting`, `side lighting`, `rim lighting`, `top lighting`

**Effects:**
- `lens flare`, `light particles`, `glowing`, `bloom`, `shadows`, `dappled sunlight`

### 6. Composition & Camera

**Shot types:**
- `portrait`, `close-up`, `upper body`, `cowboy shot`, `full body`, `wide shot`

**Angles:**
- `from above`, `from below`, `from side`, `from behind`, `eye level`
- `bird's eye view`, `worm's eye view`, `dutch angle`

**Focus:**
- `centered`, `off-center`, `depth of field`, `shallow depth of field`, `bokeh`
- `sharp focus`, `blurred foreground`, `blurred background`

### 7. Art Style

**Photography:**
- `photo`, `photograph`, `photorealistic`, `realistic`, `professional photography`
- `portrait photography`, `landscape photography`, `candid photo`
- `film grain`, `35mm`, `50mm`, `85mm`

**Art styles:**
- `anime`, `anime style`, `manga style`, `cel shaded`, `flat colors`
- `digital art`, `concept art`, `illustration`, `painting`, `drawing`
- `oil painting`, `watercolor`, `ink`, `pencil drawing`, `sketch`

**Art movements:**
- `impressionism`, `art nouveau`, `art deco`, `baroque`, `renaissance`
- `minimalist`, `abstract`, `surreal`, `pop art`

**Rendering:**
- `3d render`, `unreal engine`, `octane render`, `ray tracing`
- `low poly`, `voxel art`, `pixel art`

**Effects:**
- `cinematic`, `dramatic`, `epic`, `atmospheric`, `moody`
- `vibrant colors`, `muted colors`, `pastel colors`, `monochrome`, `black and white`
- `high contrast`, `low contrast`, `saturated`, `desaturated`

### 8. Quality Tags (Always Include)

**Essential:**
- `masterpiece`, `best quality`, `high quality`
- `highly detailed`, `extremely detailed`, `intricate details`
- `absurdres`, `highres`, `8k`, `4k`

**Optional enhancement:**
- `sharp focus`, `professional`, `award-winning`
- `beautiful`, `aesthetic`, `stunning`

---

## Tag Weight & Emphasis

**Increase weight:**
- `(tag:1.5)` - Multiply weight by 1.5
- `(tag:1.2)` - Multiply weight by 1.2

**Decrease weight:**
- `(tag:0.8)` - Multiply weight by 0.8
- `(tag:0.5)` - Multiply weight by 0.5

**Example:**
```
1girl, (beautiful face:1.2), (detailed eyes:1.3), highly detailed, best quality
```

---

## Negative Prompts

**Always include negative prompt to prevent common issues:**

**Quality issues:**
```
lowres, low quality, worst quality, normal quality, jpeg artifacts, blurry, out of focus, ugly, bad quality, poor quality
```

**Anatomy issues:**
```
bad anatomy, bad proportions, deformed, disfigured, malformed, mutated, extra limbs, missing limbs, extra arms, extra legs, missing arms, missing legs, extra fingers, missing fingers, fused fingers, too many fingers, bad hands, bad feet, long neck, long body
```

**Artifacts:**
```
watermark, signature, text, username, artist name, logo, error, cropped, out of frame, border
```

**Unwanted elements:**
```
duplicate, multiple views, copy, split screen
```

**Style-specific negatives:**
- For realistic photos: `cartoon, anime, drawing, painting, illustration, 3d, render`
- For illustrations: `photograph, photo, photorealistic, realistic`

---

## Character Consistency

**For known characters (from anime/game/novel):**
- Use format: `character_name (series_name)`
- Examples: `hatsune miku (vocaloid)`, `frieren (sousou no frieren)`, `link (zelda)`
- Check Danbooru tags for exact format
- Don't override canonical features (hair color, eye color) unless making AU

**For original characters:**
- Keep identical tags across all prompts
- Document: hair color, eye color, clothing, distinctive features
- Use exact same descriptors every time

---

## Example Prompts

**Portrait:**
```
<!--img-prompt="1girl, long auburn hair, green eyes, freckles, cream sweater, gentle smile, sitting by window, natural lighting, soft focus, portrait, highly detailed, best quality, masterpiece"-->
```

**Fantasy scene:**
```
<!--img-prompt="1girl, long silver hair, blue eyes, white and gold robes, casting spell, magical energy, glowing hands, ancient library, floating books, glowing runes, ethereal lighting, fantasy, highly detailed, best quality, masterpiece"-->
```

**Anime style:**
```
<!--img-prompt="1girl, long pink hair, blue eyes, school uniform, cheerful smile, waving, cherry blossom trees, petals falling, spring day, anime style, vibrant colors, highly detailed, best quality"-->
```

**Action scene:**
```
<!--img-prompt="1girl, long red hair, armor, wielding sword, dynamic pose, mid-air, jumping, battlefield, explosions, smoke, dramatic lighting, action scene, highly detailed, best quality, masterpiece"-->
```

**Landscape:**
```
<!--img-prompt="no humans, mountain lake, sunset, orange and pink sky, crystal clear water, reflections, pine trees, snow-capped peaks, golden hour, misty, scenic vista, landscape photography, highly detailed, 8k, masterpiece"-->
```

---

## Quick Template

```
[count], [hair], [eyes], [clothing], [expression], [pose], [location], [time/weather], [lighting], [style], highly detailed, best quality, masterpiece
```

---

## Best Practices

1. **Subject count first** - Always start with `1girl`, `2boys`, etc.
2. **Tag order matters** - Earlier tags have stronger influence
3. **Be specific** - More detail = better results
4. **Include quality tags** - Always end with quality modifiers
5. **Use negative prompts** - Prevent common issues
6. **Stay consistent** - Same character = same exact tags
7. **Test weights** - Adjust emphasis for problem areas
8. **Don't over-tag** - Focus on important elements (15-40 tags ideal)

---

## Common Mistakes

❌ Missing subject count: `long hair, blue eyes, standing`
✅ Include subject: `1girl, long hair, blue eyes, standing`

❌ Vague: `girl in room`
✅ Specific: `1girl, long black hair, bedroom, sitting on bed, morning light`

❌ No quality tags: `1girl, red hair, smiling`
✅ With quality: `1girl, red hair, smiling, highly detailed, best quality`

❌ Tag overload: `1girl, beautiful, gorgeous, stunning, amazing, incredible, perfect`
✅ Balanced: `1girl, beautiful, highly detailed, best quality`

---

**Generate prompts frequently (~250 words). Each `<!--img-prompt="..."-->` on its own line, entire prompt on single line.**
