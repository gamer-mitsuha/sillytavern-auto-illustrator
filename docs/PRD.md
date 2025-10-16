# Product Requirements Document (PRD)
# SillyTavern Auto Illustrator

**Version**: 1.2
**Last Updated**: 2025-10-17
**Purpose**: Define desired behaviors for all features to prevent regressions

---

## Table of Contents

1. [Overview](#1-overview)
2. [Progress Indication](#2-progress-indication)
3. [Streaming Mode](#3-streaming-mode)
4. [Manual Generation](#4-manual-generation)
5. [Image Regeneration](#5-image-regeneration)
6. [Prompt History](#6-prompt-history)
7. [Concurrency & Rate Limiting](#7-concurrency--rate-limiting)
8. [Settings & Configuration](#8-settings--configuration)
9. [Prompt Generation Modes](#9-prompt-generation-modes)
10. [Error Handling](#10-error-handling)
11. [System Invariants](#11-system-invariants)
12. [Modal Image Viewer Behaviors](#12-modal-image-viewer-behaviors)
13. [Appendix](#13-appendix)

---

## 1. Overview

### 1.1 Product Description

SillyTavern Auto Illustrator automatically generates inline images in conversations based on LLM-generated image prompts. The extension seamlessly integrates with SillyTavern's streaming and message systems to create an immersive visual storytelling experience.

### 1.2 Core Principles

1. **Non-Intrusive**: Images appear inline without disrupting conversation flow
2. **Reliable**: No duplicate images, missing images, or race conditions
3. **Performant**: Concurrent generation with rate limiting to prevent API abuse
4. **Transparent**: Clear progress indication and error messages
5. **Flexible**: Support for both automatic (streaming) and manual generation modes

### 1.3 How to Use This Document

- **Requirements**: Define WHAT the system should do
- **Examples**: Provide concrete scenarios with expected outcomes
- **Anti-Patterns**: Document behaviors to explicitly avoid

---

## 2. Progress Indication

### 2.1 Desired Behavior

**Users should see accurate, real-time progress for ongoing image generation tasks.**

### 2.2 Requirements

**PROG-001**: Display a progress indicator showing:
- Total number of tasks
- Number of succeeded tasks (in green)
- Number of failed tasks (in red)
- Number of pending tasks (in orange)

**PROG-002**: Update progress indicator in real-time as tasks complete (max 10 updates per second to avoid flickering)

**PROG-003**: Progress indicator appears when first task starts and remains visible after operation completes until user manually closes it

**PROG-004**: Multiple messages can show progress simultaneously without conflicts

**PROG-005**: Users can manually close the progress widget by clicking the close button (×) in the header

**PROG-006**: When all tasks complete, the spinner changes to a checkmark (✓) and title changes from "Generating Images" to "Images Generated"

### 2.3 Examples

**Example 1: Basic Progress Display**
```
Scenario: User has 5 images generating
Initial:   "Message #42: 0 ok, 0 failed, 5 pending"
After 2s:  "Message #42: 2 ok, 0 failed, 3 pending"
After 4s:  "Message #42: 4 ok, 1 failed, 0 pending"
Result:    Progress indicator disappears
```

**Example 2: Streaming with Dynamic Task Addition**
```
Scenario: LLM response starts streaming with 1 prompt detected
Initial:   "Message #42: 0 ok, 0 failed, 1 pending"
During:    LLM adds 2 more prompts → "Message #42: 1 ok, 0 failed, 2 pending"
After:     All 3 complete → indicator disappears after streaming ends
```

**Example 3: Operation Boundaries and Manual Close**
```
Streaming Mode:
  - Indicator appears when first prompt detected
  - Stays visible even if all tasks complete (more prompts may arrive)
  - After LLM streaming finishes: spinner → checkmark, title changes
  - Remains visible until user clicks close button (×)

Batch Mode:
  - Indicator appears when batch starts
  - Stays visible until last image in batch completes
  - After batch completes: spinner → checkmark, title changes
  - Remains visible until user clicks close button (×)

Manual Regeneration Mode:
  - Indicator appears when regeneration starts
  - Stays visible if multiple regenerations are queued
  - After all regenerations finish: spinner → checkmark, title changes
  - Remains visible until user clicks close button (×)
```

**Example 4: Manual Close Behavior**
```
Scenario: User generates 3 images, all complete successfully
Display:   Widget shows "Images Generated" with checkmark ✓
User:      Clicks close button (×)
Result:    Widget disappears, generated images remain in chat
```

### 2.4 Anti-Patterns

❌ **DO NOT** hide progress indicator automatically when tasks complete (user must manually close)
❌ **DO NOT** show incorrect counts (e.g., "10/5 complete" - completed should never exceed total)
❌ **DO NOT** reset progress indicator when new tasks are added (update the total instead)
❌ **DO NOT** remove generated images when user closes the widget (only hide the widget)

---

## 3. Streaming Mode

### 3.1 Desired Behavior

**Images should generate in real-time while the LLM is streaming its response, and appear in the conversation only after the LLM finishes responding.**

### 3.2 Requirements

**STREAM-001**: Detect image prompts continuously while LLM is streaming (poll every 100-1000ms, configurable)

**STREAM-002**: Start generating images immediately when prompts are detected

**STREAM-003**: Hold generated images in memory until LLM streaming completes

**STREAM-004**: Insert all generated images in a single operation after LLM finishes

**STREAM-005**: If streaming is cancelled/interrupted, still insert any completed images

**STREAM-006**: Multiple streaming sessions can run concurrently for different messages

### 3.3 Examples

**Example 1: Normal Streaming Flow**
```
User: "Describe a forest scene"

T+0s:   LLM starts streaming: "The forest is beautiful..."
T+1s:   Extension detects: <img-prompt="forest, trees, sunlight">
T+1s:   Image #1 starts generating
T+2s:   LLM continues: "...with a small river..."
T+3s:   Extension detects: <img-prompt="river, water, rocks">
T+3s:   Image #2 starts generating
T+5s:   Image #1 completes (stored in memory, not inserted yet)
T+7s:   Image #2 completes (stored in memory, not inserted yet)
T+8s:   LLM finishes streaming
T+8s:   Both images insert inline after their prompts

Result: User sees complete response with both images at once
```

**Example 2: Late Prompt Detection**
```
T+0s:   LLM streams: "Here are three scenes..."
T+1s:   Extension detects 1 prompt, starts generating
T+3s:   Extension detects 1 more prompt, starts generating
T+5s:   LLM finishes streaming
T+5s:   Final scan detects 1 more prompt that arrived at the last second
T+5s:   Third image starts generating
T+7s:   All 3 images complete
T+7s:   All 3 images insert inline

Result: No missed prompts, all 3 images appear
```

**Example 3: Streaming Cancelled Mid-Generation**
```
T+0s:   LLM starts streaming, 3 prompts detected
T+1s:   Images #1 and #2 complete
T+2s:   User stops generation (Ctrl+C)
T+2s:   Image #3 is still generating (40% complete)
T+2s:   Streaming ends (cancelled)
T+2s:   Images #1 and #2 insert (partial results)
T+2s:   Image #3 discarded (not completed)

Result: Partial images inserted, prompt #3 remains for retry
```

**Example 4: Concurrent Streaming Sessions**
```
T+0s:   User starts streaming for message #10 (2 prompts)
T+1s:   User starts streaming for message #11 (1 prompt)
T+3s:   Message #10 finishes, 2 images insert
T+5s:   Message #11 finishes, 1 image inserts

Result: Each session maintains independent state, no conflicts
```

### 3.4 Anti-Patterns

❌ **DO NOT** insert images before LLM finishes streaming (LLM streaming output will override the message content anyway, i.e., inserted image tags would be removed by the LLM streaming output.)
❌ **DO NOT** skip final prompt scan after streaming ends (misses late prompts)
❌ **DO NOT** share state between concurrent streaming sessions
❌ **DO NOT** insert images if timeout occurs (prevents corruption)

---

## 4. Manual Generation

### 4.1 Desired Behavior

**Users can manually generate images for messages that have image prompts but no images, or regenerate all images for a message.**

### 4.2 Requirements

**MANUAL-001**: Show a generation button on messages that contain image prompts

**MANUAL-002**: Disable generation button if the message is currently streaming

**MANUAL-003**: Support two generation modes:
- **Replace**: Delete all existing images and regenerate
- **Append**: Keep existing images and add new ones

**MANUAL-004**: Show a dialog before generation with:
- Number of prompts detected
- Selected generation mode (Replace/Append)
- Confirm/Cancel buttons

**MANUAL-005**: Generate and insert images progressively (one at a time), not all at once

**MANUAL-006**: If generation fails for a prompt, keep the prompt tag for retry

### 4.3 Examples

**Example 1: Replace Mode**
```
Initial State:
  Message #42 has:
    - Text: "A scene <img-prompt="sunset"> and <img-prompt="ocean">"
    - 2 existing images (old)

User Action:
  1. Clicks manual generation button
  2. Selects "Replace" mode
  3. Confirms

Result:
  - Old images deleted
  - New image #1 generates and inserts after first prompt
  - New image #2 generates and inserts after second prompt
  - Message now has 2 new images (total: 2)
```

**Example 2: Append Mode**
```
Initial State:
  Message #42 has:
    - Text: "A scene <img-prompt="sunset"> and <img-prompt="ocean">"
    - 2 existing images (old)

User Action:
  1. Clicks manual generation button
  2. Selects "Append" mode
  3. Confirms

Result:
  - Old images remain
  - New image #1 generates and inserts after first prompt
  - New image #2 generates and inserts after second prompt
  - Message now has 4 images (2 old + 2 new)
```

**Example 3: Progressive Insertion**
```
Scenario: Batch generating 5 images (each takes 3 seconds)

T+0s:   Dialog shows "Generate 5 images?" → User confirms
T+0s:   Progress: "0 ok, 0 failed, 5 pending"
T+3s:   Image #1 completes and inserts → Progress: "1 ok, 0 failed, 4 pending"
T+6s:   Image #2 completes and inserts → Progress: "2 ok, 0 failed, 3 pending"
T+9s:   Image #3 completes and inserts → Progress: "3 ok, 0 failed, 2 pending"
T+12s:  Image #4 completes and inserts → Progress: "4 ok, 0 failed, 1 pending"
T+15s:  Image #5 completes and inserts → Progress: "5 ok, 0 failed, 0 pending"
T+15s:  Progress indicator disappears

Result: User sees images appearing one by one (feels responsive)
```

**Example 4: Partial Failure**
```
Scenario: Batch generating 3 images, image #2 fails

T+0s:   Start generation (3 prompts)
T+3s:   Image #1 succeeds → inserts after prompt #1
T+6s:   Image #2 fails (API error) → prompt #2 remains, no image
T+9s:   Image #3 succeeds → inserts after prompt #3
T+9s:   Progress: "2 ok, 1 failed, 0 pending"
T+9s:   Toast notification: "Generated 2 out of 3 images"

Result:
  - Message has images for prompts #1 and #3
  - Prompt #2 tag remains (user can retry manually)
  - User is informed of partial success
```

### 4.4 Anti-Patterns

❌ **DO NOT** show button on messages without prompts
❌ **DO NOT** remove prompt tags when generation fails (preserve for retry)
❌ **DO NOT** wait until all images generate to insert (insert progressively)
❌ **DO NOT** allow generation while streaming is active

---

## 5. Image Regeneration

### 5.1 Desired Behavior

**Users can click any AI-generated image to regenerate it, update its prompt using AI assistance, or create a variant.**

### 5.2 Requirements

**REGEN-001**: All AI-generated images are clickable (indicated by hover effect)

**REGEN-002**: Clicking an image shows a dialog with 3 options:
1. **Regenerate (Replace)**: Remove old image, generate new one at same position
2. **Regenerate (Append)**: Keep old image, generate new one with "(Regenerated N)" suffix
3. **Update Prompt**: Use LLM to improve prompt based on user feedback

**REGEN-003**: In Append mode, track regeneration count per image (1st regen, 2nd regen, etc.)

**REGEN-004**: Multiple regenerations can be queued and process sequentially

**REGEN-005**: Prompt update flow:
1. User provides natural language feedback (e.g., "fix hand anatomy")
2. LLM analyzes current prompt + feedback
3. LLM generates improved prompt
4. User sees updated prompt and can choose to regenerate

### 5.3 Examples

**Example 1: Replace Mode Regeneration**
```
Initial State:
  Image title: "AI generated image #2"
  Current prompt: "1girl, long hair, blue eyes"

User Action:
  1. Clicks image
  2. Selects "Regenerate (Replace)"
  3. Confirms

Result:
  - Old image removed
  - New image generates with same prompt
  - New image appears in same position
  - Image title remains: "AI generated image #2"
```

**Example 2: Append Mode Regeneration with Counter**
```
Initial State:
  Image title: "AI generated image #2"
  Current prompt: "1girl, long hair, blue eyes"

User Action:
  1st regeneration (Append): Creates "AI generated image #2 (Regenerated 1)"
  2nd regeneration (Append): Creates "AI generated image #2 (Regenerated 2)"
  3rd regeneration (Append): Creates "AI generated image #2 (Regenerated 3)"

Result:
  - Message now has 4 images (1 original + 3 regenerated)
  - Each regeneration has unique title with counter
  - All images remain clickable for further regeneration
```

**Example 3: Prompt Update Flow**
```
Initial State:
  Current prompt: "1girl, long hair, blue eyes, school uniform, classroom"
  Image has bad hand anatomy

User Action:
  1. Clicks image
  2. Selects "Update Prompt"
  3. Enters feedback: "fix bad hand anatomy and add more hand details"
  4. Clicks "Update Prompt" button

System Response:
  - LLM analyzes prompt + feedback
  - Generates: "1girl, long hair, blue eyes, school uniform, classroom, detailed hands, correct anatomy, hand focus"
  - Shows updated prompt to user
  - Dialog: "Regenerate with updated prompt? [Yes] [No]"

If User Selects Yes:
  - Image regenerates with new prompt
  - Prompt history stores both versions
  - New image replaces old one

If User Selects No:
  - Prompt is updated but image remains
  - User can regenerate later with updated prompt
```

**Example 4: Queued Regenerations**
```
Scenario: User rapidly clicks 3 images to regenerate

T+0s:   User clicks image #1 → regeneration #1 starts
T+1s:   User clicks image #2 → queues as regeneration #2
T+2s:   User clicks image #3 → queues as regeneration #3
T+2s:   Progress: "0 ok, 0 failed, 3 pending"
T+5s:   Regeneration #1 completes → Progress: "1 ok, 0 failed, 2 pending"
T+10s:  Regeneration #2 completes → Progress: "2 ok, 0 failed, 1 pending"
T+15s:  Regeneration #3 completes → Progress: "3 ok, 0 failed, 0 pending"
T+15s:  Progress indicator disappears

Result: All 3 regenerations process sequentially, no race conditions
```

### 5.4 Anti-Patterns

❌ **DO NOT** make non-AI images clickable (check image title)
❌ **DO NOT** lose regeneration counter when appending
❌ **DO NOT** remove image if regeneration fails (preserve original)
❌ **DO NOT** allow concurrent regenerations for same message (serialize via queue)

---

## 6. Prompt History

### 6.1 Desired Behavior

**The system maintains a complete history of all prompt versions for each image, allowing users to track how prompts evolved over time.**

### 6.2 Requirements

**HISTORY-001**: Store all prompt versions with unique identifiers and timestamps

**HISTORY-002**: Track which prompt version is currently active for each image

**HISTORY-003**: Preserve history across browser sessions (persist in chat file)

**HISTORY-004**: Support retrieving full version history for any image

**HISTORY-005**: Never delete or modify previous prompt versions (append-only)

### 6.3 Examples

**Example 1: Prompt Evolution**
```
Initial State:
  Message #42, Image #2
  Prompt: "1girl, long hair, blue eyes"
  History: [
    Version 1 (2025-01-12 10:00): "1girl, long hair, blue eyes"
  ]

User Updates Prompt (adds detail):
  Feedback: "add school uniform"
  New Prompt: "1girl, long hair, blue eyes, school uniform"
  History: [
    Version 1 (2025-01-12 10:00): "1girl, long hair, blue eyes"
    Version 2 (2025-01-12 10:15): "1girl, long hair, blue eyes, school uniform"
  ]

User Updates Again (fixes anatomy):
  Feedback: "fix hand anatomy"
  New Prompt: "1girl, long hair, blue eyes, school uniform, detailed hands, correct anatomy"
  History: [
    Version 1 (2025-01-12 10:00): "1girl, long hair, blue eyes"
    Version 2 (2025-01-12 10:15): "1girl, long hair, blue eyes, school uniform"
    Version 3 (2025-01-12 10:30): "1girl, long hair, blue eyes, school uniform, detailed hands, correct anatomy"
  ]

Result: Complete evolution tracked, can review what changed and when
```

**Example 2: Persistence Across Sessions**
```
Session 1 (Morning):
  - User creates chat with 5 images
  - Updates prompts for images #2 and #4
  - Closes SillyTavern

Session 2 (Afternoon):
  - User reopens SillyTavern
  - Opens same chat
  - Clicks image #2 → sees full prompt history from morning
  - Can regenerate with original or updated prompt
  - Prompt history fully restored

Result: No data loss, history persists indefinitely
```

**Example 3: Independent Image Histories**
```
Scenario: Message with 3 images

Image #1 History:
  - Version 1: "sunset, beach"
  - Version 2: "sunset, beach, golden hour"

Image #2 History:
  - Version 1: "ocean, waves"
  (never updated)

Image #3 History:
  - Version 1: "mountains, snow"
  - Version 2: "mountains, snow, dramatic clouds"
  - Version 3: "mountains, snow, dramatic clouds, aurora borealis"

Result: Each image maintains independent history, updates don't affect others
```

### 6.4 Anti-Patterns

❌ **DO NOT** modify previous prompt versions (always append new versions)
❌ **DO NOT** store history in browser localStorage (use SillyTavern chat file)
❌ **DO NOT** share history between different images (each image has independent history)
❌ **DO NOT** lose history on browser refresh or session restart

---

## 7. Concurrency & Rate Limiting

### 7.1 Desired Behavior

**The system controls how many images generate simultaneously and how quickly, preventing API rate limits and system overload.**

### 7.2 Requirements

**CONCURRENCY-001**: Limit simultaneous image generations (configurable: 1-5, default: 1)

**CONCURRENCY-002**: Enforce minimum time between generation starts (configurable: 0-10000ms, default: 0)

**CONCURRENCY-003**: Queue additional requests when limit is reached

**CONCURRENCY-004**: Process queued requests in order (FIFO)

**CONCURRENCY-005**: Allow concurrent operations for different messages (no global serialization)

**CONCURRENCY-006**: Serialize operations for the same message (prevent race conditions)

### 7.3 Examples

**Example 1: Concurrency Limit (Max 2)**
```
Configuration: maxConcurrent = 2

Scenario: 5 images to generate

T+0s:   Image #1 starts (slot 1/2)
T+0s:   Image #2 starts (slot 2/2)
T+0s:   Images #3, #4, #5 queue (waiting)
T+5s:   Image #1 completes → Image #3 starts (slot 1/2)
T+7s:   Image #2 completes → Image #4 starts (slot 2/2)
T+12s:  Image #3 completes → Image #5 starts (slot 1/2)
T+14s:  Image #4 completes
T+17s:  Image #5 completes

Result: Never more than 2 concurrent generations
```

**Example 2: Min Interval (1 second)**
```
Configuration:
  maxConcurrent = 3 (allows 3 simultaneous)
  minInterval = 1000ms (1 second between starts)

Scenario: 6 images to generate

T+0s:   Image #1 starts (slot 1/3)
T+1s:   Image #2 starts (slot 2/3) - respects 1s interval
T+2s:   Image #3 starts (slot 3/3) - respects 1s interval
T+3s:   Image #1 completes → Image #4 starts (slot 1/3) - respects 1s interval
T+4s:   Image #2 completes → Image #5 starts (slot 2/3) - respects 1s interval
T+5s:   Image #3 completes → Image #6 starts (slot 3/3) - respects 1s interval
...

Result: Max 3 concurrent, but new generations only start every 1 second
```

**Example 3: Same-Message Serialization**
```
Scenario: User triggers 2 operations on message #42

Operation A: Manual generation (3 images)
Operation B: Regenerate image #2

T+0s:   User triggers Operation A
T+1s:   User triggers Operation B (before A completes)
T+1s:   Operation B queues behind Operation A
T+9s:   Operation A completes (all 3 images inserted)
T+9s:   Operation B starts automatically
T+14s:  Operation B completes

Result: Operations never overlap, message stays consistent
```

**Example 4: Different-Message Concurrency**
```
Scenario: User triggers operations on 2 different messages

Operation A: Generate 2 images for message #10
Operation B: Generate 2 images for message #11

T+0s:   Both operations start simultaneously
T+5s:   Operation A completes → images insert to message #10
T+7s:   Operation B completes → images insert to message #11

Result: Operations run concurrently, no conflicts (different messages)
```

### 7.4 Anti-Patterns

❌ **DO NOT** exceed configured concurrency limit
❌ **DO NOT** skip minimum interval delay between generations
❌ **DO NOT** allow concurrent operations on the same message
❌ **DO NOT** serialize operations across different messages (allow parallelism)

---

## 8. Settings & Configuration

### 8.1 Desired Behavior

**Users can configure extension behavior through a settings panel, with all settings persisting across sessions and validating to safe ranges.**

### 8.2 Requirements

**SETTINGS-001**: All settings persist across browser sessions

**SETTINGS-002**: Settings update immediately when changed (no save button)

**SETTINGS-003**: Invalid settings are rejected or clamped to valid ranges

**SETTINGS-004**: Settings panel is accessible via Extensions > Auto Illustrator

**SETTINGS-005**: Reset button restores defaults with confirmation dialog

### 8.3 Available Settings

| Setting | Type | Range/Values | Default | Description |
|---------|------|--------------|---------|-------------|
| Enable Extension | Boolean | true/false | true | Master on/off switch |
| Enable Streaming | Boolean | true/false | true | Generate during streaming |
| Streaming Poll Interval | Number | 100-1000ms (step: 50) | 300ms | Prompt detection frequency |
| Max Concurrent | Number | 1-5 (step: 1) | 1 | Simultaneous generations |
| Min Generation Interval | Number | 0-10000ms (step: 100) | 0ms | Delay between starts |
| Default Generation Mode | Choice | replace/append | append | Default for manual generation |
| Meta Prompt Preset | Choice | list of presets | "default" | Active prompt template |
| Meta Prompt Depth | Number | 0-20 (step: 1) | 0 | Insertion position in chat history (shared API mode only) |
| Prompt Generation Mode | Choice | shared-api/independent-api | shared-api | How prompts are generated |
| Max Prompts Per Message | Number | 1-30 (step: 1) | 5 | Limit for independent API mode |
| Context Message Count | Number | 0-50 (step: 1) | 5 | Previous messages for context |
| LLM Frequency Guidelines | String | multi-line | (default text) | When to generate prompts (independent API mode) |
| LLM Prompt Writing Guidelines | String | multi-line | (default text) | How to write prompts (independent API mode) |
| Common Style Tags | String | any | "" | Tags added to all prompts |
| Style Tags Position | Choice | prefix/suffix | prefix | Where to add common tags |
| Log Level | Choice | trace/debug/info/warn/error/silent | info | Console verbosity |

### 8.4 Examples

**Example 1: Immediate Update**
```
User Action:
  1. Opens settings panel
  2. Changes "Max Concurrent" from 1 to 3
  3. Closes settings panel

Result:
  - Setting saved immediately (no save button)
  - Next generation uses new limit (3 concurrent)
  - Setting persists after browser restart
```

**Example 2: Validation Clamping**
```
Scenario: User manually edits settings file

Invalid Value: streamingPollInterval = 50 (below minimum of 100)

Extension Behavior:
  - Detects invalid value on load
  - Clamps to minimum: 100
  - Logs warning: "streamingPollInterval clamped to 100 (min)"
  - Extension continues functioning normally
```

**Example 3: Preset Management**
```
Initial State: Using "default" preset

User Actions:
  1. Clicks "Edit" button (preset is read-only)
  2. Modifies meta-prompt content
  3. Clicks "Save As" (Save is disabled for predefined presets)
  4. Names new preset: "My Custom Preset"
  5. New preset is created and selected

Result:
  - Original "default" preset unchanged (read-only)
  - New custom preset created with user's modifications
  - Custom preset can be edited/deleted in future
```

**Example 4: Reset Confirmation**
```
User Action:
  1. User has customized 10 settings
  2. Clicks "Reset to Defaults" button
  3. Confirmation dialog appears: "Reset all settings? This cannot be undone."
  4. User confirms

Result:
  - All settings restore to defaults
  - Custom presets are preserved (not deleted)
  - User sees toast: "Settings reset to defaults"
```

### 8.5 Anti-Patterns

❌ **DO NOT** allow invalid settings values (validate and clamp)
❌ **DO NOT** lose settings on browser restart (persist properly)
❌ **DO NOT** allow editing of predefined presets (enforce read-only)
❌ **DO NOT** delete custom presets on reset (only reset settings)

---

## 9. Prompt Generation Modes

### 9.1 Desired Behavior

**Users can choose between two prompt generation modes: Shared API Call (default) or Independent API Call (experimental), each with different trade-offs.**

### 9.2 Requirements

**PROMPT-GEN-001**: Two modes available:
- **Shared API Call** (default): AI embeds image prompts directly in the chat response
- **Independent API Call** (experimental): Separate API call after response to generate prompts

**PROMPT-GEN-002**: Mode selection persists across sessions

**PROMPT-GEN-003**: Shared API mode requires explicit generation type (no meta-prompt injection for `generateRaw` or undefined types)

**PROMPT-GEN-004**: Independent API mode settings only visible when that mode is selected

**PROMPT-GEN-005**: Independent API mode shows clear warning about additional API cost (+1 call per message)

### 9.3 Shared API Call Mode (Default)

**Characteristics:**
- Meta prompt injected into chat history before AI response
- AI embeds prompts using special tags (e.g., `[img: description]`)
- Prompts extracted from response using regex patterns
- No additional API calls
- Prompt generation may slightly influence response style

**Meta Prompt Depth Setting:**
- Controls where meta prompt is inserted in chat history
- depth=0 (default): Last position in chat array
- depth=1: One before last, depth=2: Two before last, etc.
- Range: 0-20
- Only applies to Shared API mode

**When Meta Prompt is Injected:**
- Extension is enabled
- Meta prompt is not empty
- Generation type is explicitly set (not undefined/null)
- Generation type is NOT 'quiet' or 'impersonate'
- Mode is set to Shared API Call (not Independent API Call)

### 9.4 Independent API Call Mode (Experimental)

**Characteristics:**
- AI generates normal response without prompt generation instructions
- After response completes, separate API call generates image prompts
- Context-aware: includes previous messages for better understanding
- Prompts inserted into message using context snippets (not byte offsets)
- Chat history automatically pruned (removes prompt tags from future AI calls)
- +1 API call per message (additional token cost)

**Settings (Independent API Mode only):**
- **Max Prompts Per Message**: Limit number of prompts (1-30, default: 5) for cost control
- **Context Message Count**: Number of previous messages to include (0-50, default: 5)
- **LLM Frequency Guidelines**: Instructions for when to generate prompts
- **LLM Prompt Writing Guidelines**: Instructions for how to write prompts

**Prompt Insertion:**
- Uses context snippets (`insertAfter`, `insertBefore`) instead of byte offsets
- Case-insensitive context matching
- Validates insertion points are adjacent (prevents inserting in wrong location)
- Detailed logging for debugging insertion failures

### 9.5 Examples

**Example 1: Shared API Call (Default)**
```
User Message: "Describe the castle"

Chat History Before AI Call:
  [... previous messages ...]
  {role: 'user', content: 'Describe the castle'}
  {role: 'system', content: META_PROMPT}  ← Injected at depth=0 (last)

AI Response:
  "The castle stands tall on the hill. [img: medieval stone castle on hill,
  blue sky, detailed architecture] Its towers reach toward the sky..."

Result:
  - Prompt extracted via regex
  - Image generated and inserted after prompt tag
  - No additional API calls
```

**Example 2: Meta Prompt Depth**
```
Setting: metaPromptDepth = 1

Chat History Before AI Call:
  [... previous messages ...]
  {role: 'user', content: 'What happens next?'}
  {role: 'system', content: META_PROMPT}  ← Injected at depth=1 (one before last)

Result: Meta prompt appears before the user's message instead of after
```

**Example 3: Independent API Call Mode**
```
User Message: "Describe the castle"

AI Response (normal, no prompt instructions):
  "The castle stands tall on the hill. Its massive stone towers reach
  toward the sky, with flags fluttering in the wind..."

After Response Completes:
  - Separate API call made with:
    * Previous 5 messages as context
    * Current response
    * LLM guidelines for frequency and writing

LLM Returns:
  ```
  ---PROMPT-1---
  prompt: medieval stone castle on hill, blue sky, detailed architecture
  insertAfter: "The castle stands"
  insertBefore: "tall on the hill"
  reasoning: Opening scene description
  ---PROMPT-END---
  ```

Result:
  - Prompt tag inserted: "The castle stands [img: ...] tall on the hill"
  - Image generated and displayed
  - Prompt tag removed from chat history (won't appear in future AI calls)
  - Total API calls: 2 (original + prompt generation)
```

**Example 4: No Generation Type (Skip Injection)**
```
Scenario: Direct API call via generateRaw() with no generation type

Behavior:
  - currentGenerationType is undefined
  - Meta prompt injection skipped (prevents unexpected injection)
  - Logged: "Skipping meta-prompt injection: no generation type specified"

Result: Extension doesn't interfere with custom API calls
```

### 9.6 Anti-Patterns

❌ **DO NOT** inject meta-prompt when generation type is undefined (use explicit types only)
❌ **DO NOT** forget to prune chat history in Independent API mode (causes prompt tags in future responses)
❌ **DO NOT** use byte offsets for insertion (context snippets are more reliable)
❌ **DO NOT** hide API cost warning for Independent API mode (users must understand implications)

---

## 10. Error Handling

### 10.1 Desired Behavior

**When errors occur, the system recovers gracefully, informs the user appropriately, and maintains consistent state.**

### 10.2 Requirements

**ERROR-001**: Display user-friendly error messages (not technical details)

**ERROR-002**: Log detailed error information to console for debugging

**ERROR-003**: Never leave UI in inconsistent state (stuck progress, orphaned widgets)

**ERROR-004**: On failure, preserve ability to retry (don't remove prompt tags)

**ERROR-005**: Continue processing remaining tasks after individual failures

### 10.3 Error Scenarios

**ERROR-API**: Image generation API failure
- **User Sees**: Toast notification "Failed to generate image"
- **System Logs**: Full error details with API response code
- **Recovery**: Prompt tag remains, user can retry manually
- **Continues**: Other queued images still process

**ERROR-TIMEOUT**: Operation timeout (e.g., barrier waiting 20+ minutes)
- **User Sees**: Toast notification "Image generation timed out"
- **System Logs**: Timeout duration and waiting conditions
- **Recovery**: Session ends cleanly, progress cleared
- **Continues**: User can start new operation

**ERROR-MESSAGE-DELETED**: Message deleted during generation
- **User Sees**: No notification (not user's fault)
- **System Logs**: "Message not found during insertion"
- **Recovery**: Generation completes but insertion skipped, progress cleared
- **Continues**: Extension remains functional

**ERROR-SETTINGS**: Invalid settings detected
- **User Sees**: No notification (auto-corrected)
- **System Logs**: Warning with invalid value and corrected value
- **Recovery**: Uses default/clamped value
- **Continues**: Extension functions normally

### 10.4 Examples

**Example 1: Partial Batch Failure**
```
Scenario: Generating 5 images, image #3 fails

T+0s:   Start generating 5 images
T+3s:   Image #1 succeeds → inserts
T+6s:   Image #2 succeeds → inserts
T+9s:   Image #3 fails (API error 500) → prompt tag remains
        User sees: Toast "Failed to generate image"
        Console: "API error 500: Internal Server Error for prompt: ..."
T+12s:  Image #4 succeeds → inserts (unaffected by #3's failure)
T+15s:  Image #5 succeeds → inserts
T+15s:  Progress: "4 ok, 1 failed, 0 pending"
        User sees: Toast "Generated 4 out of 5 images"

Result:
  - User has 4 images
  - Prompt #3 tag remains for manual retry
  - Extension continues functioning
```

**Example 2: Streaming Timeout**
```
Scenario: Streaming with very slow image generation (25 minutes)

T+0min:  Streaming starts, 1 prompt detected, generation starts
T+20min: Timeout triggered (max 20 minutes)
         System logs: "Barrier timeout after 1200000ms. Still waiting for: allGenerationsComplete"
         User sees: Toast "Operation timed out"
T+20min: Session ends, progress cleared, NO images inserted
T+21min: User starts new chat → Extension works normally

Result:
  - Timeout prevents corruption (partial/stale images)
  - Clean recovery allows continued use
  - User understands something went wrong
```

**Example 3: Message Deleted During Generation**
```
Scenario: User deletes message while images are generating

T+0s:   Start generating 3 images for message #42
T+3s:   Image #1 completes (stored, awaiting insertion)
T+5s:   User deletes message #42
T+6s:   Image #2 completes (stored, awaiting insertion)
T+9s:   Image #3 completes (stored, awaiting insertion)
T+10s:  Insertion attempt: Message not found
        Console logs: "Cannot insert images: message #42 not found"
        No user notification (not their fault, they deleted it)
T+10s:  Progress cleared, session ended

Result:
  - No error shown to user (expected behavior)
  - Extension remains functional
  - No orphaned progress widgets
```

### 10.5 Anti-Patterns

❌ **DO NOT** show technical error messages to users (use friendly language)
❌ **DO NOT** leave progress widget stuck on error (always clean up)
❌ **DO NOT** crash extension on single operation failure (isolate errors)
❌ **DO NOT** remove prompt tags when generation fails (allow retry)

---

## 11. System Invariants

### 11.1 Definition

**System invariants are conditions that MUST always be true, regardless of user actions or system state.**

### 11.2 Core Invariants

**INV-001**: Progress completed count never exceeds total count
```
Example: If total = 5, completed can be 0, 1, 2, 3, 4, or 5
Never: completed = 6 (system prevents this with validation)
```

**INV-002**: Each message has at most one active operation at a time
```
Example: If message #42 is inserting images, regeneration for #42 must wait
Allowed: Message #42 inserting + Message #43 inserting (different messages)
```

**INV-003**: Generated images always have a title starting with "AI generated image"
```
Example: "AI generated image #3"
Example: "AI generated image #2 (Regenerated 5)"
Never: "Image #3" or "Generated: sunset scene"
```

**INV-004**: In streaming mode, images never insert before LLM finishes
```
Example: LLM streaming from T+0s to T+10s, images insert at T+10s or later
Never: Images insert at T+5s while LLM still streaming
```

**INV-005**: Prompt history is append-only (never modified or deleted)
```
Example: Version 1, Version 2, Version 3 → always grows forward
Never: Modifying Version 2 or deleting Version 1
```

**INV-006**: Settings always validate to safe ranges on load
```
Example: streamingPollInterval loaded as 9999 → clamped to 1000 (max)
Never: Accept out-of-range values that could break functionality
```

**INV-007**: All AI-generated images are clickable for regeneration
```
Example: Any image with title^="AI generated image" has click handler
Never: AI-generated image without click handler (user can't regenerate)
```

**INV-008**: Failed generations preserve prompt tags for retry
```
Example: Generation fails → prompt tag remains in message
Never: Remove prompt tag on failure (user loses retry ability)
```

**INV-009**: Concurrent operations never modify the same message simultaneously
```
Example: Operations for message #42 serialize via queue
Never: Two operations writing to message #42 at same time
```

**INV-010**: Progress indicator appears when operation starts, disappears when operation completes
```
Example: Manual generation starts → widget shows → generation ends → widget hides
Never: Widget disappears while tasks still running
Never: Widget remains visible after operation completes
```

### 11.3 Verification

These invariants should be verified:
- **In unit tests**: Assert conditions in test assertions
- **In code reviews**: Check for violations when reviewing PRs
- **In manual testing**: Observe behavior matches invariants
- **In runtime**: Add validation checks that log warnings if invariants break

---

## 12. Modal Image Viewer Behaviors

### 12.1 Image Rotation

**ROTATION-001**: Rotate button rotates image 90° clockwise on each click

**ROTATION-002**: Rotation state persists across modal re-opening during same session

**ROTATION-003**: Rotation affects fullscreen fitting (portrait↔landscape dimension swap)

**ROTATION-004**: Rotation works seamlessly with zoom and pan features

**Example**:
```
User clicks rotate button 4 times:
0° → 90° → 180° → 270° → 0° (full circle)
Closes and reopens modal: rotation resets to 0°
```

### 12.2 Tap Navigation (Mobile)

**TAP-001**: Tapping left 40% of image navigates to previous image

**TAP-002**: Tapping right 40% of image navigates to next image

**TAP-003**: Tapping center 20% of image toggles fullscreen

**TAP-004**: Tap navigation disabled when image is zoomed (panning takes priority)

**TAP-005**: Visual ripple indicators show tap location

**Example**:
```
At 1x zoom:
- Tap left side → previous image
- Tap right side → next image
- Tap center → enter fullscreen

At 2x zoom:
- Tap anywhere → pan image (navigation disabled)
```

### 12.3 View All Images Button

**VIEW-ALL-001**: "View All Images" button appears in regeneration dialog

**VIEW-ALL-002**: Clicking button collects all AI-generated images from all messages

**VIEW-ALL-003**: Images collected in chronological order (message 0 → last message)

**VIEW-ALL-004**: Modal opens at clicked image's index in global collection

**VIEW-ALL-005**: User can navigate through all chat images from any starting point

**Example**:
```
Chat has 3 messages with images:
- Message #5: 2 images
- Message #12: 1 image
- Message #20: 3 images

User clicks image #2 in message #20
→ View All collects [msg5-img1, msg5-img2, msg12-img1, msg20-img1, msg20-img2, msg20-img3]
→ Modal opens at index 4 (msg20-img2)
→ User can navigate: prev (msg20-img1), next (msg20-img3), then msg5-img1, etc.
```

---

## 13. Appendix

### 13.1 Glossary

- **Prompt**: Text pattern like `<img-prompt="sunset, beach">` that triggers image generation
- **Streaming**: Real-time LLM response generation (character by character)
- **Deferred Images**: Images generated during streaming but held for later insertion
- **Operation**: High-level task like "manual generation" or "regeneration"
- **Task**: Individual image generation within an operation
- **Session**: Isolated state for streaming image generation per message

### 13.2 How to Update This Document

**When adding new features**:
1. Add requirements in appropriate section
2. Provide concrete examples with expected outcomes
3. Document anti-patterns (what NOT to do)
4. Update invariants if applicable

**When fixing bugs**:
1. Add example showing buggy behavior vs correct behavior
2. Add anti-pattern if bug was caused by common mistake
3. Add test case requirement to prevent regression

**When changing behavior**:
1. Update relevant requirements with new behavior
2. Update examples to match new behavior
3. Mark deprecated behaviors in anti-patterns section

### 13.3 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-12 | Initial behavior-focused PRD with 39 concrete examples covering all features |
| 1.1 | 2025-10-15 | Added modal viewer behaviors: image rotation, tap navigation, View All Images button |
| 1.2 | 2025-10-17 | Added prompt generation modes section, metaPromptDepth setting, updated settings table |

---

**End of Document**
