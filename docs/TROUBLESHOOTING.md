# Troubleshooting Guide

This document provides detailed troubleshooting steps for common issues with the SillyTavern Auto Illustrator extension.

**IMPORTANT:** Before using this extension, you must configure the [Image Generation extension](https://docs.sillytavern.app/extensions/stable-diffusion/) first. This is a prerequisite for the Auto Illustrator to work.

## Images Not Generating

### Check Image Generation Extension
Ensure the Image Generation extension is installed and configured:
1. Go to **Extensions** in SillyTavern
2. Verify "Image Generation" (Stable Diffusion) is listed and enabled
3. Follow the [Image Generation setup guide](https://docs.sillytavern.app/extensions/stable-diffusion/) to configure it
4. Configure your preferred backend (Automatic1111, ComfyUI, NovelAI, etc.)

### Verify `/sd` Command
Test the `/sd` command manually:
1. Open a chat in SillyTavern
2. Type `/sd test prompt` in the message box
3. If an image generates, the Image Generation extension is working correctly
4. If not, check the [Image Generation extension configuration](https://docs.sillytavern.app/extensions/stable-diffusion/)

### Check Console Logs
Open browser DevTools to inspect logs:
1. Press **F12** to open DevTools
2. Go to the **Console** tab
3. Look for `[Auto Illustrator]` prefixed messages
4. Set **Log Level** to **DEBUG** in settings for detailed information
5. Check for error messages or warnings

### Enable Extension
Ensure the extension is enabled:
1. Go to **Extensions** > **Auto Illustrator**
2. Check that "Enable Auto Illustrator" is checked
3. Verify a Meta Prompt Preset is selected

## Images Disappear After Chat Reload

This issue has been fixed in recent versions. Generated images are now automatically saved to chat history via `context.saveChat()`.

If you still experience this issue:
1. Check browser console for save errors
2. Verify SillyTavern has write permissions to the data directory
3. Check that the chat file is not corrupted
4. Try reloading SillyTavern completely

## LLM Not Generating Prompts

### Check Meta-Prompt
Ensure a meta-prompt preset is selected:
1. Go to **Extensions** > **Auto Illustrator**
2. Verify **Meta Prompt Preset** dropdown has a value selected
3. Try switching between "Default" and "NAI 4.5 Full" presets

### Adjust Frequency
If images are too infrequent:
1. Create a custom preset based on "Default"
2. Edit the template to reduce word count (e.g., from 250 to 150 words)
3. Save the custom preset
4. Select it in the preset dropdown

### LLM Context
Ensure the LLM has sufficient context:
1. Check your LLM's context window size
2. The meta-prompt adds ~200-500 tokens depending on preset
3. If context is full, the meta-prompt may be truncated

### Test Manually
Ask the LLM directly:
1. In your chat, ask: "Please include `<!--img-prompt="test"-->` in your next response"
2. If the LLM includes it, the extension should detect and generate an image
3. If not, check your LLM's instruction following capability

## Streaming Issues

### Enable Streaming
Ensure streaming is enabled:
1. Go to **Extensions** > **Auto Illustrator**
2. Check "Enable Streaming" is enabled
3. This is required for real-time image generation during streaming

### Check Logs
Look for streaming-specific logs:
1. Open browser console (F12)
2. Set **Log Level** to **DEBUG**
3. Look for `[Auto Illustrator] [Monitor]` messages during streaming
4. Look for `[Auto Illustrator] [Processor]` messages when images generate
5. Check for any error messages

### Adjust Poll Interval
If prompts are being missed:
1. Go to settings
2. Reduce **Streaming Poll Interval** (e.g., from 300ms to 200ms)
3. Lower values = more frequent checks, but higher CPU usage
4. Don't go below 100ms

### Concurrency Issues
If you're getting rate limit errors:
1. Reduce **Max Concurrent Generations** to 1
2. This prevents overwhelming the SD API
3. Images will generate sequentially instead of in parallel

### Two-Way Handshake
The extension uses a coordination mechanism:
- Images are generated in the background during streaming
- Images are inserted AFTER both conditions are met:
  1. Streaming completes (MESSAGE_RECEIVED event fires)
  2. All images finish generating
- This prevents UI flickering and ensures correct positioning

## Too Much Console Output

The extension uses structured logging with configurable verbosity.

### Adjust Log Level
1. Go to **Extensions** > **Auto Illustrator** settings
2. Change **Log Level** based on your needs:
   - **SILENT**: No output (use for production)
   - **ERROR**: Only errors
   - **WARN**: Warnings and errors
   - **INFO**: Key events (default, recommended)
   - **DEBUG**: Detailed activity (for troubleshooting)
   - **TRACE**: Very detailed monitoring (for development)

### Recommended Settings
- **Normal use**: INFO or WARN
- **Troubleshooting**: DEBUG
- **Development**: TRACE
- **Clean console**: SILENT or ERROR

## Extension Not Loading

### Check Installation
Verify the extension is installed:
1. Go to **Extensions** menu in SillyTavern
2. Look for "Auto Illustrator" in the list
3. If not present, reinstall via **Install Extension**

### Restart SillyTavern
Fully restart the application:
1. Close all SillyTavern tabs/windows
2. Stop the SillyTavern server
3. Restart the server
4. Open SillyTavern in a fresh browser tab

### Check Console for Errors
Look for initialization errors:
1. Open browser DevTools (F12)
2. Go to **Console** tab
3. Reload the page
4. Look for errors during extension loading
5. Common errors:
   - Missing dependencies
   - JavaScript syntax errors
   - Failed to load resources

### Verify Prerequisites
Ensure all prerequisites are met:
1. SillyTavern is up to date
2. [Image Generation extension](https://docs.sillytavern.app/extensions/stable-diffusion/) is installed and working
3. `/sd` command is functional (test it manually)
4. Browser is supported (Chrome, Firefox, Edge)

## Manual Generation Issues

### Button Not Appearing
If the manual generation button doesn't show:
1. Ensure the extension is enabled
2. Check that the message contains image prompts
3. Look for the purple wand icon in message actions
4. Try refreshing the page

### Generation Dialog Not Working
If the dialog appears but doesn't work:
1. Check browser console for errors
2. Verify Image Generation extension is working (`/sd test`)
3. Ensure images exist in the message (for regeneration)
4. Try using "Append" mode instead of "Replace"

### Images Not Appending/Replacing
If the mode doesn't work as expected:
1. **Append mode**: Should keep existing images and add new ones
2. **Replace mode**: Should delete existing images first
3. Check console logs for errors during operation
4. Verify chat save is working (images should persist)

## Performance Issues

### Slow Image Generation
If images take too long to generate:
1. This is usually due to your Image Generation backend speed
2. Check Image Generation extension settings
3. Consider using a faster model or backend
4. Reduce image resolution in Image Generation extension settings

### High CPU Usage
If the extension causes high CPU usage:
1. Increase **Streaming Poll Interval** to reduce polling frequency
2. Reduce **Max Concurrent Generations** to 1
3. Set **Log Level** to WARN or SILENT
4. Check for memory leaks (reload page periodically)

### Memory Leaks
If memory usage grows over time:
1. This may be due to image accumulation
2. Reload the page periodically
3. Clear browser cache
4. Report the issue with reproduction steps

## Getting Help

If you continue to experience issues:

1. **Check existing issues**: [GitHub Issues](https://github.com/gamer-mitsuha/sillytavern-auto-illustrator/issues)
2. **Gather information**:
   - Extension version (check manifest.json)
   - SillyTavern version
   - Browser and version
   - Console logs (with DEBUG level enabled)
   - Steps to reproduce
3. **Create a new issue**: Provide all gathered information
4. **Be patient**: The maintainers will respond as soon as possible
