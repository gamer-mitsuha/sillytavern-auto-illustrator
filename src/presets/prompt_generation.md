# Image Prompt Generation Task

Your task is to analyze the current message and generate image prompts for key visual scenes.

You will receive:
1. **Context** - Previous messages in the conversation (for reference only)
2. **Current Message** - The message to generate image prompts for

**CRITICAL**: Only generate prompts for scenes in the **Current Message**. Use the context to understand character appearances, settings, and ongoing situations, but INSERT_AFTER/INSERT_BEFORE must reference text that exists in the Current Message only.

## Input Format

The user will provide input in this format:

```
=== CONTEXT ===
[Previous messages for reference]

=== CURRENT MESSAGE ===
[The message to generate prompts for]
```

## Instructions

1. **Understand Context**: Read the context to understand:
   - Character descriptions (appearance, clothing, personality)
   - Current setting and environment
   - Ongoing plot and situations
   - Relationships between characters

2. **Identify Visual Scenes in Current Message**: {{FREQUENCY_GUIDELINES}}

3. **Generate Image Prompts**: {{PROMPT_WRITING_GUIDELINES}}

4. **Specify Context for Insertion**: For each prompt, provide surrounding text snippets
   - **CRITICAL**: `insertAfter` and `insertBefore` must be DIRECTLY ADJACENT in the original message
   - When concatenated, they must form a continuous substring: `insertAfter + insertBefore`
   - Insert prompts at natural boundaries (after sentence endings, between paragraphs)

   **Example from message**: `"She entered the garden. The roses were in full bloom."`
   - ✅ CORRECT:
     - insertAfter: `"entered the garden. "`
     - insertBefore: `"The roses were in"`
     - Combined: `"entered the garden. The roses were in"` ← exists in message
   - ❌ WRONG:
     - insertAfter: `"entered the garden."`
     - insertBefore: `"The roses were in"`
     - Combined: `"entered the garden.The roses were in"` ← missing space!

   - Copy text EXACTLY including all spaces, punctuation, capitalization
   - `insertAfter`: Ends at the insertion point (often includes trailing space after period)
   - `insertBefore`: Starts from the insertion point
   - Choose unique snippets (15-30 characters each recommended)
   - Verification: Search for `insertAfter + insertBefore` in message → must find exactly once

4. **Output Format**: Use plain text with delimiters - simple and robust for any text content:

```
---PROMPT---
TEXT: your prompt here
INSERT_AFTER: exact text before insertion
INSERT_BEFORE: exact text after insertion
REASONING: why this scene needs illustration
---PROMPT---
TEXT: another prompt
INSERT_AFTER: ...
INSERT_BEFORE: ...
REASONING: ...
---END---
```

## Important Rules

1. **Use Plain Text Delimiter Format**:
   - Start each prompt with `---PROMPT---`
   - End the entire response with `---END---`
   - Each field uses `FIELD_NAME: value` format (uppercase field names)
   - No special escaping needed - newlines, quotes, any characters work naturally
   - Do NOT wrap in code blocks or add extra text
2. **Unique Context Snippets**: Ensure INSERT_AFTER/INSERT_BEFORE combinations are unique and unambiguous
3. **Always Include REASONING**: Helps understand why each scene was chosen
4. **Complete All Fields**: Every prompt must have TEXT, INSERT_AFTER, INSERT_BEFORE, and REASONING

## Example

**Input:**
```
=== CONTEXT ===
Character: Elena, a young mage with long silver hair and blue eyes.
She has been traveling through the countryside.

=== CURRENT MESSAGE ===
She stepped into the rose garden. Her dress flowed in the breeze. They reached the mountain lake. The water was perfectly still.
```

**Output:**
```
---PROMPT---
TEXT: 1girl, long silver hair, blue eyes, white dress, standing in rose garden, surrounded by blooming roses, afternoon sunlight, gentle breeze, soft focus, highly detailed, best quality, masterpiece
INSERT_AFTER: into the rose garden.
INSERT_BEFORE: Her dress flowed in
REASONING: Character Elena in garden setting - using context for her appearance (silver hair, blue eyes)
---PROMPT---
TEXT: no humans, mountain lake, crystal clear water, snow-capped peaks, sunset, orange sky, reflections on water, scenic vista, highly detailed, 8k, masterpiece
INSERT_AFTER: the mountain lake.
INSERT_BEFORE: The water was perfectly
REASONING: Landscape scene from current message - natural resting point in the journey
---END---
```

Note:
- Context provided Elena's appearance, which was used in the first prompt
- INSERT_AFTER and INSERT_BEFORE reference text from the CURRENT MESSAGE only
- Both form continuous substrings in the current message
- This format handles any text naturally - newlines, quotes, special characters all work without escaping

Now analyze the provided context and current message, then generate appropriate image prompts with context-based insertion points.
