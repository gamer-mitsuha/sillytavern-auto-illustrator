# Image Prompt Generation Task

Your task is to analyze the user's message and generate image prompts for key visual scenes.

The user will provide the message text. You should respond with a JSON object containing image prompts.

## Instructions

1. **Identify Visual Scenes**: {{FREQUENCY_GUIDELINES}}

2. **Generate Image Prompts**: {{PROMPT_WRITING_GUIDELINES}}

3. **Specify Context for Insertion**: For each prompt, provide surrounding text snippets
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

1. **Return Valid JSON Only**:
   - Output the raw JSON object directly - do NOT wrap it in markdown code blocks (```json)
   - No explanatory text before or after the JSON object
   - Use standard ASCII double quotes (") for all JSON keys and string values
   - Do NOT use Unicode quotes like " " ' ' 「」 『』 or any other quote variants
   - Example of CORRECT quotes: "text", "insertAfter", "insertBefore"
   - Example of WRONG quotes: "text", 「text」, 『text』
2. **Unique Context Snippets**: Ensure insertAfter/insertBefore combinations are unique and unambiguous
3. **Always Include Reasoning**: Helps understand why each scene was chosen
4. **JSON Format Validation**: Your response must be parseable by standard JSON.parse()

## Example Output

Given message: `"She stepped into the rose garden. Her dress flowed in the breeze. They reached the mountain lake. The water was perfectly still."`

```json
{
  "prompts": [
    {
      "text": "1girl, long silver hair, white dress, standing in garden, surrounded by roses, afternoon sunlight, soft focus, highly detailed, best quality, masterpiece",
      "insertAfter": "into the rose garden. ",
      "insertBefore": "Her dress flowed in",
      "reasoning": "Character in garden setting - insert after first sentence"
    },
    {
      "text": "no humans, mountain lake, crystal clear water, snow-capped peaks, sunset, orange sky, reflections on water, scenic vista, highly detailed, 8k, masterpiece",
      "insertAfter": "the mountain lake. ",
      "insertBefore": "The water was perfectly",
      "reasoning": "Landscape scene - insert after sentence describing arrival"
    }
  ]
}
```

Note: In both examples, `insertAfter + insertBefore` forms a continuous substring in the original message.

Now analyze the message and generate appropriate image prompts with context-based insertion points.
