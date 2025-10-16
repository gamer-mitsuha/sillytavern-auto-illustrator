# Image Prompt Generation Task

Your task is to analyze the following assistant message and generate image prompts for key visual scenes.

## Message to Analyze

{{MESSAGE_TEXT}}

## Instructions

1. **Identify Visual Scenes**: {{FREQUENCY_GUIDELINES}}

2. **Generate Image Prompts**: {{PROMPT_WRITING_GUIDELINES}}

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
      "text": "your prompt here",
      "insertAfter": "exact text before insertion",
      "insertBefore": "exact text after insertion",
      "reasoning": "why this scene needs illustration"
    }
  ]
}
```

## Important Rules

1. **Return Valid JSON Only**: No explanatory text before or after the JSON object
2. **Unique Context Snippets**: Ensure insertAfter/insertBefore combinations are unique and unambiguous
3. **Always Include Reasoning**: Helps understand why each scene was chosen

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
