# SillyTavern Auto Illustrator

Automatically generates inline images in your SillyTavern conversations based on story context. The extension uses LLM-generated image prompts to create immersive visual storytelling experiences.

## Features

- 🎨 **Automatic Image Generation**: LLM generates image prompts based on story context
- 🔄 **Seamless Integration**: Images appear inline within assistant messages
- ⚡ **Streaming Support**: Generates images during streaming responses with coordinated insertion
- ⚙️ **Customizable Settings**: Control generation frequency, concurrency, and meta-prompt template
- 📝 **Smart Prompt Injection**: Meta-prompts are injected only when needed
- 🔔 **Real-time Notifications**: Visual feedback during image generation process
- 🧹 **Chat History Pruning**: Automatically removes generated images from LLM context

## How It Works

### Non-Streaming Mode
1. **Prompt Injection**: The extension uses SillyTavern's `setExtensionPrompt` API to register a meta-prompt that instructs the LLM to generate inline image prompts in the format `<img_prompt="description">`. The prompt is automatically injected at the right position (in-chat, at depth 0) and controlled by the extension's enabled status.
2. **LLM Response**: The LLM includes image prompts in its response at appropriate story moments
3. **Image Generation**: The extension detects image prompts via the `MESSAGE_RECEIVED` event, generates images using the SD slash command, and replaces prompts with actual images
4. **UI Update**: The message is updated with embedded images and `MESSAGE_EDITED` event is emitted

### Streaming Mode
1. **Prompt Injection**: Same as non-streaming mode
2. **Real-time Detection**: As the LLM streams text, the extension monitors the message and detects `<img_prompt>` tags as they appear
3. **Background Generation**: Images are generated in the background while streaming continues (deferred insertion mode)
4. **Coordinated Insertion**: After BOTH streaming completes (MESSAGE_RECEIVED fires) AND all images are generated, all images are inserted atomically in one operation
5. **UI Update**: `MESSAGE_UPDATED` and `MESSAGE_EDITED` events trigger rendering and post-processing

## Installation

Go to the **Extensions** => **Install Extension** menu in SillyTavern and paste the URL of the extension repository:

```
https://github.com/gamer-mitsuha/sillytavern-auto-illustrator
```

## Prerequisites

- SillyTavern installation
- Stable Diffusion extension (a built-in extension) installed and configured
- SD slash command (`/sd`) must be available

## Usage

1. **Enable the Extension**: Go to **Extensions** > **Auto Illustrator** and check "Enable Auto Illustrator"

2. **Configure Settings**:
   - **Word Interval**: Approximate number of words between image generation opportunities (default: 250)
   - **Meta Prompt Template**: Instructions sent to the LLM for generating image prompts
   - **Enable Streaming**: Enable image generation during streaming responses (recommended)
   - **Streaming Poll Interval**: How often to check for new prompts during streaming (default: 300ms)
   - **Max Concurrent Generations**: Maximum number of images to generate simultaneously (default: 1)

3. **Start Chatting**: The LLM will automatically generate image prompts in its responses, and images will appear inline

### Example

**LLM Response:**
```
As the sun set over the ancient forest, <img_prompt="sunset over ancient mystical forest with towering trees and golden light filtering through leaves"> the path ahead grew darker. She pressed on, her lantern casting dancing shadows.
```

**Rendered Result:**
```
As the sun set over the ancient forest, [IMAGE] the path ahead grew darker. She pressed on, her lantern casting dancing shadows.
```

## Configuration

### Settings Panel

Access settings via **Extensions** > **Auto Illustrator**

- **Enable Auto Illustrator**: Toggle extension on/off
- **Word Interval**: Controls how frequently images are generated (50-1000 words)
- **Meta Prompt Template**: Customize the instructions sent to the LLM
- **Enable Streaming**: Enable real-time image generation during streaming (recommended)
- **Streaming Poll Interval**: Milliseconds between prompt detection checks (100-1000ms)
- **Max Concurrent Generations**: Number of images to generate simultaneously (1-5)
- **Reset to Defaults**: Restore default settings

### Meta Prompt Template

The default meta-prompt instructs the LLM to:
- Generate image prompts every ~250 words
- Use the format `<img_prompt="detailed description">`
- Keep prompts under 75 words
- Generate prompts only when appropriate to the story

You can customize this template to change generation behavior.


## Troubleshooting

### Images Not Generating

1. **Check SD Extension**: Ensure Stable Diffusion extension is installed and configured
2. **Verify SD Command**: Test `/sd prompt` manually in SillyTavern
3. **Check Console**: Open browser DevTools and look for `[Auto Illustrator]` logs
4. **Enable Extension**: Ensure "Enable Auto Illustrator" is checked in settings

### LLM Not Generating Prompts

1. **Check Meta-Prompt**: Ensure meta-prompt template is properly configured
2. **Word Interval**: Try adjusting the word interval setting
3. **LLM Context**: Ensure LLM has sufficient context window for meta-prompt
4. **Test Manually**: Ask the LLM to include `<img_prompt="test">` in response

### Streaming Issues

1. **Enable Streaming**: Ensure "Enable Streaming" is checked in settings
2. **Check Logs**: Look for `[Auto Illustrator Monitor]` and `[Auto Illustrator Processor]` logs
3. **Adjust Poll Interval**: If prompts are missed, try reducing the poll interval
4. **Concurrency**: If getting rate limit errors, reduce max concurrent generations to 1
5. **Two-Way Handshake**: Images insert after BOTH generation completes AND MESSAGE_RECEIVED fires

### Extension Not Loading

1. **Check Installation**: Verify extension is installed via Extensions menu
2. **Restart SillyTavern**: Fully restart the application
3. **Check Console**: Look for initialization errors in browser DevTools
4. **Verify Prerequisites**: Ensure SD extension is installed and working

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Follow the development workflow mentioned in the [Development Guide](docs/DEVELOPMENT.md).
4. Write tests for new functionality
5. Ensure all tests pass and code is linted
6. Submit a pull request

## License

[GNU Affero General Public License v3.0](LICENSE)

## Acknowledgments

- SillyTavern team for the excellent platform
- Stable Diffusion extension developers

## Support

- **Issues**: [GitHub Issues](https://github.com/gamer-mitsuha/sillytavern-auto-illustrator/issues)
