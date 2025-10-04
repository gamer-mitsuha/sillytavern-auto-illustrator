## Objective

- Build a SillyTavern UI Extension that automatically generates inline images based on the context / story.

## MVP

- Before the prompt is sent to LLM for generating the response, edit the prompt to instruct the LLM to also generate image generation prompts inline of the response. For example, generate an image describing the character / story / background every 200-300 words.
- Parse the response to extract the image generation prompts. For each image generation prompt, send it to the image generation model. Then replace each image generation prompt with the corresponding generated image inline.

## Implementation details For MVP

- Monitor the `GENERATE_AFTER_COMBINE_PROMPTS` event to inject the image generation meta prompts.
  - This event is emitted after all prompts are combined but before being sent to the LLM.
  - The meta-prompt is injected as a separate system message right before the last message in the chat array.
  - This approach guarantees the prompt injection happens before the prompt is sent to the LLM.
- Image generation prompt format
  - The meta prompt should instruct the LLM to output with a special format like `<img_prompt="actual prompt">`.
- Monitor the `MESSAGE_RECEIVED` event, and extract the image generation prompts from the response.
  - This can be done by regex match that can detect `<img_prompt="actual prompt">`.
- For each image generation prompt, use the `sd` SlashCommand to generate an image. E.g., `const imageUrl = await SlashCommandParser.commands['sd'].callback({ quiet: 'true' }, prompt);`
  - Then replace each image generation prompt with the actual image. This can be done by adding a html image tag like `<img src="${imageUrl}" title="${prompt}" alt="${prompt}">`.
- Finally emit a `MESSAGE_EDITED` event.
  - This is to trigger other existing regex patterns (if any) that "Run on Edit". In particular, this would help prevent problems with incorrect rendering for regexes that only "Alter Chat Display".

## Future extension

- Allow user to choose where to insert the meta prompt
- Optimize the meta prompt for image generation
- Faster rendering
  - Try to parse the response periodically to allow displaying images faster, e.g., once the 1st image generation prompt is detected, send it to the image generation model and then display the generated image as soon as possible.
- Character consistency control
- Independent generation of "image generation prompts"
- Default meta prompts for various image generation models
- More stable history management
  - Instead of replacing the image generation prompt with the actual image, try to keep the image generation prompt (to let LLM recognize these prompts were actually generated in the previous responses), and add the new image tag containing the generated image after it.
  - We can make the image generation prompt invisible using CSS.

## References
- https://docs.sillytavern.app/for-contributors/writing-extensions/
- https://docs.sillytavern.app/extensions/stable-diffusion/
- https://docs.sillytavern.app/extensions/regex/
