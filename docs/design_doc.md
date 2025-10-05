## Objective

- Build a SillyTavern UI Extension that automatically generates inline images based on the context / story.

## MVP

- Before the prompt is sent to LLM for generating the response, edit the prompt to instruct the LLM to also generate image generation prompts inline of the response. For example, generate an image describing the character / story / background every 200-300 words.
- Parse the response to extract the image generation prompts. For each image generation prompt, send it to the image generation model. Then replace each image generation prompt with the corresponding generated image inline.

## Implementation details For MVP

- Use SillyTavern's `setExtensionPrompt` API to inject the image generation meta prompts.
  - The meta-prompt is registered with position=1 (in-chat) and depth=0 (last message).
  - A filter function controls whether the prompt is injected based on the extension's enabled status.
  - This approach integrates properly with SillyTavern's prompt management system.
- Image generation prompt format
  - The meta prompt should instruct the LLM to output with a special format like `<img_prompt="actual prompt">`.
- Monitor the `MESSAGE_RECEIVED` event, and extract the image generation prompts from the response.
  - This can be done by regex match that can detect `<img_prompt="actual prompt">`.
- For each image generation prompt, use the `sd` SlashCommand to generate an image. E.g., `const imageUrl = await SlashCommandParser.commands['sd'].callback({ quiet: 'true' }, prompt);`
  - Then replace each image generation prompt with the actual image. This can be done by adding a html image tag like `<img src="${imageUrl}" title="${prompt}" alt="${prompt}">`.
- Finally emit a `MESSAGE_EDITED` event.
  - This is to trigger other existing regex patterns (if any) that "Run on Edit". In particular, this would help prevent problems with incorrect rendering for regexes that only "Alter Chat Display".

## Implemented Features Beyond MVP

### Streaming Image Generation ✅
- **Real-time prompt detection**: Monitors streaming messages and detects `<img_prompt>` tags as they appear
- **Background generation**: Generates images while LLM continues streaming (deferred insertion mode)
- **Two-way handshake**: Coordinates insertion after BOTH streaming completes AND all images are generated
- **Atomic insertion**: All images inserted in single operation to prevent race conditions
- **Event coordination**: Emits MESSAGE_UPDATED and MESSAGE_EDITED for proper rendering

### Chat History Pruning ✅
- **Automatic cleanup**: Removes generated `<img>` tags from chat history before sending to LLM
- **Preserves prompts**: Keeps `<img_prompt>` tags so LLM can track what was generated
- **Context management**: Prevents bloated context from image data

### Advanced Settings ✅
- **Streaming toggle**: Enable/disable streaming mode
- **Poll interval**: Configurable prompt detection frequency (100-1000ms)
- **Concurrency control**: Limit simultaneous image generations (1-5)
- **Sequential processing**: Prevents rate limiting with ordered generation

## Future Extensions

- Allow user to choose where to insert the meta prompt
- Optimize the meta prompt for image generation
- Character consistency control
- Independent generation of "image generation prompts"
- Default meta prompts for various image generation models
- CSS styling for image generation prompts (invisible but preserved in history)

## References
- https://docs.sillytavern.app/for-contributors/writing-extensions/
- https://docs.sillytavern.app/extensions/stable-diffusion/
- https://docs.sillytavern.app/extensions/regex/
