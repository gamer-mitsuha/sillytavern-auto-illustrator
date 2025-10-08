# Required Demo Images for README

This document lists all the demo images needed for the README files. Create these images and place them in the `docs/images/` directory.

## Image Specifications

- **Format**: PNG (recommended for screenshots)
- **Location**: `docs/images/`
- **Naming**: Use descriptive kebab-case names
- **Quality**: High-resolution screenshots, clear and readable text

## Required Images

### 1. `demo-conversation.png` ✅ COMPLETED
**Purpose**: Main hero image showing the extension in action
**Location**: Top of README, after title and description
**Description**: A screenshot of a SillyTavern conversation with multiple auto-generated images inline
**Status**: ✅ **COMPLETED** - Image added
**What to capture**:
- A conversation window with 2-3 assistant messages
- Each message containing 1-2 generated images inline
- Images should be visually appealing (fantasy/story scene)
- Show the natural flow of text and images together
- Make sure the images are clearly visible and not too small

**Suggested conversation example**:
```
Assistant: The ancient temple loomed before them, its weathered stones... [IMAGE of ancient temple]
As they entered, mystical runes glowed along the walls... [IMAGE of glowing runes]
```

---

### 2. `how-it-works.png` ✅ COMPLETED
**Purpose**: Visual diagram showing the extension workflow
**Location**: "How It Works" section
**Description**: A simple flowchart or diagram showing the 3-step process
**Status**: ✅ **COMPLETED** - Image added
**What to create**:
- Step 1: LLM icon → "Generates invisible prompt"
- Step 2: Extension icon → "Detects and processes"
- Step 3: Chat bubble → "Images appear inline"
- Use arrows to show flow
- Use icons and minimal text
- Keep it simple and clean

**Alternative**: If creating a diagram is complex, you can screenshot the extension in action with annotations pointing out each step.

---

### 3a. `example-before.png` ✅ COMPLETED
**Purpose**: Show LLM response with visible image prompt tag
**Location**: "Quick Start" > "Example" section
**Description**: Screenshot showing the LLM-generated response with the `<!--img-prompt="..."-->` tag visible
**Status**: ✅ **COMPLETED** - Image added

---

### 3b. `example-after.png` ✅ COMPLETED
**Purpose**: Show the same message with generated image inline
**Location**: "Quick Start" > "Example" section
**Description**: Screenshot showing the final result with the generated image appearing in the conversation
**Status**: ✅ **COMPLETED** - Image added

---

### 4. `settings-panel.png` ✅ COMPLETED
**Purpose**: Complete overview of all extension settings
**Location**: "Configuration" > "Settings Panel" section
**Description**: Full screenshot of the Auto Illustrator settings panel
**Status**: ✅ **COMPLETED** - Image added
**What to capture**:
- Open Extensions > Auto Illustrator in SillyTavern
- Ensure all settings are visible:
  - Enable Auto Illustrator checkbox
  - Meta Prompt Preset dropdown (with some custom presets shown)
  - Enable Streaming checkbox
  - Streaming Poll Interval slider
  - Max Concurrent Generations slider
  - Prompt Detection Patterns textarea (with example patterns)
  - Common Style Tags input and position dropdown
  - Default Manual Generation Mode dropdown
  - Log Level dropdown
  - Reset to Defaults button
- Scroll if needed to capture all settings, or take multiple screenshots and stitch
- Make sure all labels are clearly readable

---

### 5. `preset-management.png` ✅ COMPLETED
**Purpose**: Show the preset management UI in action
**Location**: "Configuration" > "Meta Prompt Presets" section
**Description**: Screenshot showing preset selection, preview, and edit controls
**Status**: ✅ **COMPLETED** - Image added
**What to capture**:
- Meta Prompt Preset dropdown expanded or showing current selection
- Preset preview area with content visible
- Edit, Save As, Delete, Cancel buttons
- Ideally show both predefined preset (Default/NAI 4.5 Full) and a custom preset in the list
- If possible, show the edit mode with Save/Save As buttons active

**Suggested approach**:
1. Create a custom preset first (e.g., "My Custom Preset")
2. Select it to show in preview
3. Click Edit to show the edit controls
4. Take screenshot showing all preset management UI elements

---

## Optional Additional Images

These are not currently referenced but would enhance the documentation:

### 6. `manual-generation-dialog.png` (Optional)
**Purpose**: Show manual generation feature
**Description**: Screenshot of the manual generation modal dialog
**What to capture**:
- A message with the purple wand icon visible
- The modal dialog open showing "Append" and "Replace" options
- Clear view of both buttons

---

### 7. `streaming-in-action.png` (Optional)
**Purpose**: Demonstrate streaming image generation
**Description**: Screenshot showing images appearing during streaming
**What to capture**:
- A message being streamed (show typing indicator or partial text)
- One or more images already generated and inserted
- Demonstrates real-time generation

---

### 8. `common-style-tags.png` (Optional)
**Purpose**: Show common style tags feature in settings
**Description**: Close-up of the Common Style Tags settings
**What to capture**:
- Common Style Tags input field with example tags (e.g., "masterpiece, high quality")
- Position dropdown (Prefix/Suffix)
- Maybe a tooltip or help text if available

---

## Image Creation Tips

1. **Use a clean SillyTavern setup**: Remove any personal/sensitive information
2. **Use appealing content**: Choose a fantasy or story scenario that looks professional
3. **High contrast**: Ensure text is readable and UI elements are clear
4. **Crop appropriately**: Remove unnecessary browser chrome, focus on relevant content
5. **Consistent theme**: Use the same SillyTavern theme across all screenshots
6. **Annotations**: Consider adding arrows, boxes, or labels to highlight key features
7. **Resolution**: Aim for at least 1920px width for main screenshots, can be scaled down

## Tools for Creating Images

- **Screenshots**: Use your system's screenshot tool (macOS: Cmd+Shift+4, Windows: Win+Shift+S, Linux: varies)
- **Editing**: Use GIMP, Photoshop, or online tools like Photopea for editing/combining
- **Annotations**: Use tools like Snagit, Skitch, or even PowerPoint for adding arrows and labels
- **Diagrams**: Use Figma, Draw.io, or Excalidraw for creating flowcharts

## Checklist

- [x] `demo-conversation.png` - Main hero image ✅
- [x] `how-it-works.png` - Workflow diagram ✅
- [x] `example-before.png` - Before image (LLM response with prompt tag) ✅
- [x] `example-after.png` - After image (generated image inline) ✅
- [x] `settings-panel.png` - Complete settings overview ✅
- [x] `preset-management.png` - Preset management UI ✅
- [ ] (Optional) `manual-generation-dialog.png`
- [ ] (Optional) `streaming-in-action.png`
- [ ] (Optional) `common-style-tags.png`

**Progress**: 6/6 core images completed (100%) 🎉

## Directory Structure

After creating all images, your directory structure should look like:

```
docs/
├── images/
│   ├── demo-conversation.png  ✅ COMPLETED
│   ├── how-it-works.png       ✅ COMPLETED
│   ├── example-before.png     ✅ COMPLETED
│   ├── example-after.png      ✅ COMPLETED
│   ├── settings-panel.png     ✅ COMPLETED
│   └── preset-management.png  ✅ COMPLETED
├── REQUIRED_IMAGES.md (this file)
├── TROUBLESHOOTING.md
└── DEVELOPMENT.md
```
