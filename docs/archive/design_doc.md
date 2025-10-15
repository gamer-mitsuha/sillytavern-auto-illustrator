## Objective

- Build a SillyTavern UI Extension that automatically generates inline images based on the context / story.

## MVP

- Before the prompt is sent to LLM for generating the response, edit the prompt to instruct the LLM to also generate image generation prompts inline of the response. For example, generate an image describing the character / story / background every 200-300 words.
- Parse the response to extract the image generation prompts. For each image generation prompt, send it to the image generation model. Then replace each image generation prompt with the corresponding generated image inline.

## Implementation details For MVP

- **Meta-prompt injection via CHAT_COMPLETION_PROMPT_READY event**:
  - Directly injects meta-prompt as the last system message in the chat array
  - Uses generation type tracking (GENERATION_STARTED/GENERATION_ENDED) to filter quiet and impersonate generations
  - Guarantees last position regardless of other extensions
  - Only applies to chat completion APIs (OpenAI, Claude, Google, etc.)
- **Image generation prompt format**:
  - The meta prompt instructs the LLM to output with a special format like `<img-prompt="actual prompt">`.
- **Message monitoring**:
  - Monitor the `MESSAGE_RECEIVED` event, and extract the image generation prompts from the response.
  - This can be done by regex match that can detect `<img-prompt="actual prompt">`.
- **Image generation**:
  - For each image generation prompt, use the `sd` SlashCommand to generate an image. E.g., `const imageUrl = await SlashCommandParser.commands['sd'].callback({ quiet: 'true' }, prompt);`
  - Then replace each image generation prompt with the actual image. This can be done by adding a html image tag like `<img src="${imageUrl}" title="${prompt}" alt="${prompt}">`.
- **DOM update sequence**:
  1. Emit `MESSAGE_EDITED` event (triggers regex "Run on Edit" scripts)
  2. Call `updateMessageBlock()` to re-render the message DOM
  3. Emit `MESSAGE_UPDATED` event (notify other extensions)
  - This sequence ensures proper rendering and regex compatibility.

## Implemented Features Beyond MVP

### Streaming Image Generation ✅
- **Real-time prompt detection**: Monitors streaming messages and detects `<img-prompt>` tags as they appear
- **Background generation**: Generates images while LLM continues streaming (deferred insertion mode)
- **Two-way handshake**: Coordinates insertion after BOTH streaming completes AND all images are generated
- **Atomic insertion**: All images inserted in single operation to prevent race conditions
- **Event coordination**: Emits MESSAGE_UPDATED and MESSAGE_EDITED for proper rendering

### Chat History Pruning ✅
- **Automatic cleanup**: Removes generated `<img>` tags from chat history before sending to LLM
- **Preserves prompts**: Keeps `<img-prompt>` tags so LLM can track what was generated
- **Context management**: Prevents bloated context from image data

### Meta-Prompt Preset Management ✅
- **Predefined presets**: Default and NAI 4.5 Full (optimized for NovelAI Diffusion 4.5)
- **Custom presets**: Create, update, and delete custom meta-prompts
- **Edit mode**: Save and Save As functionality for preset management
- **Read-only protection**: Predefined presets cannot be overwritten

### Manual Image Generation ✅
- **Message action button**: Appears on messages containing `<img-prompt>` tags
- **Replace mode**: Remove existing images and regenerate all
- **Append mode**: Only generate images for prompts without images
- **Configurable default**: User preference for default generation mode
- **Visual feedback**: Toast notifications and button state during generation
- **Smart detection**: Automatically detects which prompts need images

### Advanced Settings ✅
- **Streaming toggle**: Enable/disable streaming mode
- **Poll interval**: Configurable prompt detection frequency (100-1000ms)
- **Concurrency control**: Limit simultaneous image generations (1-5)
- **Sequential processing**: Prevents rate limiting with ordered generation
- **Log levels**: Configurable verbosity (TRACE/DEBUG/INFO/WARN/ERROR/SILENT)
- **Manual gen mode**: Default mode for manual generation (replace/append)

### Multi-Session Architecture (v1.2.0) ✅
- **Concurrent streaming sessions**: Multiple messages can stream and generate images simultaneously
- **SessionManager**: Manages independent sessions indexed by messageId using Map-based storage
  - Each session has its own queue, monitor, processor, and barrier
  - O(1) session lookup and management
  - Automatic cleanup on chat changes (CHAT_CHANGED event)
- **Barrier pattern**: Synchronization primitive for coordinating async operations
  - Two-way handshake: waits for BOTH streaming completion AND image generation
  - Configurable timeout (default: 5 minutes)
  - Prevents race conditions in image insertion
- **Bottleneck integration**: Global rate limiting for image generation API
  - Prevents API overload across all concurrent sessions
  - Configurable concurrent limit and minimum interval
  - Sequential processing per prompt within rate limit
- **DOM queue**: Per-message operation serialization
  - Prevents race conditions from concurrent DOM updates
  - Ensures atomic operations within each message
  - Independent queues for independent messages
- **Benefits**:
  - No image loss when sending messages quickly
  - Better UX with simultaneous progress indicators
  - Each message completes independently
  - Memory-safe with automatic session cleanup

### CSS Styling ✅
- **Hidden prompt tags**: `<img-prompt>` tags styled with `display: none` to prevent invisible spacing in chat
- **Preserved in history**: Tags remain in message text for regeneration and history tracking
- **Clean UI**: No visual clutter from metadata tags during or after message rendering

## Future Extensions

- ~~Allow user to choose where to insert the meta prompt~~ ✅ (Implemented via CHAT_COMPLETION_PROMPT_READY)
- ~~Optimize the meta prompt for image generation~~ ✅ (Implemented via preset management)
- Character consistency control
- Independent generation of "image generation prompts"
- ~~Default meta prompts for various image generation models~~ ✅ (NAI 4.5 Full preset added)
- ~~CSS styling for image generation prompts (invisible but preserved in history)~~ ✅ (Implemented with display: none)
- Support for non-chat-completion APIs (text completion, Novel, etc.)

## References
- https://docs.sillytavern.app/for-contributors/writing-extensions/
- https://docs.sillytavern.app/extensions/stable-diffusion/
- https://docs.sillytavern.app/extensions/regex/
