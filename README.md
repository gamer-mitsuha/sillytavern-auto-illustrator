# SillyTavern Auto Illustrator

English | [简体中文](README_CN.md)

Automatically generates inline images in your SillyTavern conversations based on story context. The extension uses LLM-generated image prompts to create immersive visual storytelling experiences.

## Features

- 🎨 **Automatic Image Generation**: LLM generates image prompts based on story context
- 🔄 **Seamless Integration**: Images appear inline within assistant messages
- ⚡ **Streaming Support**: Generates images during streaming responses with coordinated insertion
- 🎯 **Preset Management**: Switch between predefined and custom meta-prompt presets
  - Two predefined presets: Default and NAI 4.5 Full
  - Create, edit, and delete custom presets
  - Preview preset content before editing
  - Customize image generation frequency via preset templates
- 📝 **Smart Prompt Injection**: Meta-prompts are injected only when needed
- 💾 **Persistent Images**: Generated images are automatically saved to chat history
- 🧹 **Smart Chat Pruning**: Removes generated images from LLM context (not from UI)
- 🌍 **Internationalization**: Full i18n support (currently supports English and Simplified Chinese)
- 📊 **Configurable Logging**: Control logging verbosity from SILENT to DEBUG
- 🔧 **Centralized Configuration**: All settings and validation in one place

## How It Works

### Non-Streaming Mode
1. **Prompt Injection**: The extension monitors the `CHAT_COMPLETION_PROMPT_READY` event and injects the meta-prompt directly as the last system message in the chat array. This instructs the LLM to generate inline image prompts in the format `<!--img-prompt="description"-->` (HTML comment style). The injection is controlled by the extension's enabled status and generation type (skipped for quiet/impersonate modes).
2. **LLM Response**: The LLM includes image prompts in its response at appropriate story moments
3. **Image Generation**: The extension detects image prompts via the `MESSAGE_RECEIVED` event, generates images using the SD slash command, and replaces prompts with actual images
4. **UI Update**: The message is updated with embedded images and `MESSAGE_EDITED` event is emitted

### Streaming Mode
1. **Prompt Injection**: Same as non-streaming mode
2. **Real-time Detection**: As the LLM streams text, the extension monitors the message and detects `<!--img-prompt="...">` tags (HTML comment format) as they appear
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
   - **Meta Prompt Preset**: Choose from predefined presets or create custom ones (controls image generation frequency and style)
   - **Enable Streaming**: Enable image generation during streaming responses (recommended)
   - **Streaming Poll Interval**: How often to check for new prompts during streaming (default: 300ms, range: 100-1000ms)
   - **Max Concurrent Generations**: Maximum number of images to generate simultaneously (default: 1, range: 1-5)
   - **Log Level**: Control console verbosity (default: INFO, options: TRACE/DEBUG/INFO/WARN/ERROR/SILENT)

3. **Start Chatting**: The LLM will automatically generate image prompts in its responses, and images will appear inline

### Example

**LLM Response:**
```
As the sun set over the ancient forest, <!--img-prompt="sunset over ancient mystical forest with towering trees and golden light filtering through leaves"--> the path ahead grew darker. She pressed on, her lantern casting dancing shadows.
```

**Rendered Result:**
```
As the sun set over the ancient forest, [IMAGE] the path ahead grew darker. She pressed on, her lantern casting dancing shadows.
```

## Configuration

### Settings Panel

Access settings via **Extensions** > **Auto Illustrator**

- **Enable Auto Illustrator**: Toggle extension on/off
- **Meta Prompt Preset**: Select from predefined or custom presets that control image generation behavior
- **Enable Streaming**: Enable real-time image generation during streaming (recommended)
- **Streaming Poll Interval**: Milliseconds between prompt detection checks (100-1000ms, step: 50)
- **Max Concurrent Generations**: Number of images to generate simultaneously (1-5, step: 1)
- **Prompt Detection Patterns**: Regex patterns to detect image prompts (one per line)
- **Common Style Tags**: Comma-separated tags to add to all image prompts (e.g., "masterpiece, high quality")
  - **Position**: Choose whether to add tags as prefix (before) or suffix (after) prompt tags
  - Tags are automatically deduplicated (case-insensitive) with prompt-specific tags
- **Default Manual Generation Mode**: Default mode for manual generation and regeneration dialogs
  - **Append** (default): Keep existing images and add new ones
  - **Replace**: Delete existing images and regenerate
- **Log Level**: Control logging verbosity (TRACE/DEBUG/INFO/WARN/ERROR/SILENT)
  - **TRACE/DEBUG**: Detailed monitoring and debugging information
  - **INFO** (default): Key events and operations
  - **WARN/ERROR**: Only warnings and errors
  - **SILENT**: No console output
- **Reset to Defaults**: Restore all settings to default values

### Meta Prompt Presets

The extension includes a preset management system for organizing and switching between different meta prompt templates:

**Predefined Presets:**
- **Default**: General-purpose prompt template with basic image generation instructions
- **NAI 4.5 Full**: Optimized for NovelAI Diffusion 4.5 with character consistency guidelines and Danbooru tag support

**Using Presets:**
1. **Select a preset**: Choose from the dropdown to load a preset
2. **View preset content**: Preview area shows the current preset's content
3. **Edit a preset**: Click Edit button to enter edit mode
4. **Save changes**:
   - For custom presets: Click **Save** to update in place
   - For predefined presets: **Save** is disabled, use **Save As** to create a custom variant
5. **Save As**: Create a new custom preset with a unique name
   - Can overwrite existing custom presets with confirmation
   - Cannot use predefined preset names (Default, NAI 4.5 Full)
6. **Delete preset**: Remove custom presets (predefined presets cannot be deleted)
7. **Cancel**: Discard changes and exit edit mode

**Notes:**
- Predefined presets are read-only to preserve original templates
- Custom presets are stored in your SillyTavern settings
- Preset selection persists across sessions

### Meta Prompt Templates

Meta prompt presets control how the LLM generates image prompts. Each preset includes:
- **Image generation frequency**: How often images should appear (e.g., every ~250 words)
- **Prompt format**: Instructions for using `<!--img-prompt="detailed description"-->` format (HTML comment style)
- **Style guidelines**: Specific instructions for different image generation models
- **Content rules**: Guidelines for visual elements, character consistency, NSFW handling, etc.

To adjust image generation frequency, create a custom preset and modify the word count in the template (e.g., change "Every 250 words" to "Every 500 words").


## Troubleshooting

### Images Not Generating

1. **Check SD Extension**: Ensure Stable Diffusion extension is installed and configured
2. **Verify SD Command**: Test `/sd prompt` manually in SillyTavern
3. **Check Console**: Open browser DevTools and look for `[Auto Illustrator]` logs
   - Set **Log Level** to **DEBUG** for detailed information
4. **Enable Extension**: Ensure "Enable Auto Illustrator" is checked in settings

### Images Disappear After Chat Reload

This issue has been fixed. Generated images are now automatically saved to chat history via `context.saveChat()`. If you still experience this:
1. Check browser console for save errors
2. Verify SillyTavern has write permissions
3. Check that chat file is not corrupted

### LLM Not Generating Prompts

1. **Check Meta-Prompt**: Ensure a meta-prompt preset is selected
2. **Adjust Frequency**: Create a custom preset and modify the word interval in the template (e.g., change from 250 to 150 words for more frequent images)
3. **LLM Context**: Ensure LLM has sufficient context window for meta-prompt
4. **Test Manually**: Ask the LLM to include `<!--img-prompt="test"-->` in response

### Streaming Issues

1. **Enable Streaming**: Ensure "Enable Streaming" is checked in settings
2. **Check Logs**: Look for `[Auto Illustrator] [Monitor]` and `[Auto Illustrator] [Processor]` logs
   - Set **Log Level** to **DEBUG** to see detailed streaming activity
3. **Adjust Poll Interval**: If prompts are missed, try reducing the poll interval
4. **Concurrency**: If getting rate limit errors, reduce max concurrent generations to 1
5. **Two-Way Handshake**: Images insert after BOTH generation completes AND MESSAGE_RECEIVED fires

### Too Much Console Output

The extension uses structured logging with configurable verbosity:
1. Go to **Extensions** > **Auto Illustrator** settings
2. Change **Log Level** to **WARN** or **ERROR** for less output
3. Use **SILENT** to disable all logging
4. Use **DEBUG** or **TRACE** only when troubleshooting

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
