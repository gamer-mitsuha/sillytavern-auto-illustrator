# SillyTavern Auto Illustrator

English | [简体中文](README_CN.md)

Automatically generates inline images in your SillyTavern conversations based on story context. The extension uses LLM-generated image prompts to create immersive visual storytelling experiences.

![Demo: Auto-generated images in conversation](docs/images/demo-conversation.png)

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

![How it works diagram](docs/images/how-it-works.png)

1. **Automatic Prompt Generation**: When you chat, the LLM automatically generates invisible image prompts in its responses at appropriate story moments
2. **Image Creation**: The extension detects these prompts and generates images using Stable Diffusion
3. **Inline Display**: Generated images appear directly in the conversation, replacing the invisible prompts seamlessly

## Quick Start

### Prerequisites

**IMPORTANT:** You must configure the [Image Generation extension](https://docs.sillytavern.app/extensions/stable-diffusion/) first before using this extension.

- SillyTavern installation
- [Image Generation extension](https://docs.sillytavern.app/extensions/stable-diffusion/) (built-in) installed and configured
- `/sd` slash command working (test it first!)

### Installation

1. Go to **Extensions** > **Install Extension** in SillyTavern
2. Paste the repository URL: `https://github.com/gamer-mitsuha/sillytavern-auto-illustrator`
3. Click Install

### First Use

1. **Configure Image Generation extension first** if you haven't already
2. Go to **Extensions** > **Auto Illustrator**
3. Check **"Enable Auto Illustrator"**
4. Select a **Meta Prompt Preset** (try "Default" first)
5. Start chatting - images will appear automatically in responses!

### Example

**Before:**

![LLM response with visible prompt tag](docs/images/example-before.png)

**After:**

![Generated image appears in conversation](docs/images/example-after.png)

## Configuration

### Settings Panel

![Settings panel overview](docs/images/settings-panel.png)

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

![Preset management UI](docs/images/preset-management.png)

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
- Each preset controls image generation frequency (e.g., every ~250 words) and style guidelines
- To adjust frequency, create a custom preset and modify the word count in the template


## Common Issues

**Images not generating?**
- **First**, ensure [Image Generation extension](https://docs.sillytavern.app/extensions/stable-diffusion/) is configured and `/sd` command works
- Check "Enable Auto Illustrator" is enabled in settings
- Select a Meta Prompt Preset (try "Default")
- Open browser console (F12) and set **Log Level** to **DEBUG** for details

**LLM not including images in responses?**
- Ensure a Meta Prompt Preset is selected
- Try asking the LLM to be more descriptive in its responses
- For more frequent images, create a custom preset and reduce the word count (e.g., 150 instead of 250)

**Too much console output?**
- Go to settings and change **Log Level** to **WARN** or **SILENT**

For more detailed troubleshooting, see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

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
