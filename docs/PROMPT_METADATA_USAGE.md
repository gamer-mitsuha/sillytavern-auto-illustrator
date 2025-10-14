# prompt_metadata.ts Usage Summary

## Overview
`prompt_metadata.ts` manages prompt history and metadata storage in SillyTavern's chat metadata system. It tracks:
- Prompt text versions over time
- Associations between images and prompts
- Position-based prompt history (messageId + promptIndex)

## Exported Functions

### Core Storage Functions
1. **`getMetadata(context)`** - Gets/initializes auto-illustrator metadata from chat
2. **`generatePromptId(promptText)`** - Creates unique ID for a prompt
3. **`recordPrompt(promptText, context)`** - Stores prompt text, returns ID
4. **`recordImagePrompt(imageUrl, promptId, context)`** - Links image URL to prompt ID

### Position Management
5. **`createPositionKey(position)`** - Creates key: `messageId_promptIndex`
6. **`parsePositionKey(key)`** - Parses key back to PromptPosition
7. **`initializePromptPosition(position, initialPromptId, context)`** - Creates position history
8. **`addPromptVersion(position, newPromptId, feedback, context)`** - Adds version + updates message text

### Query Functions
9. **`getCurrentPromptId(position, context)`** - Gets latest prompt ID at position
10. **`getPromptText(promptId, context)`** - Gets prompt text by ID
11. **`getImagePromptId(imageUrl, context)`** - Gets prompt ID for image
12. **`getPositionHistory(position, context)`** - Gets complete history for position

### Utility (Exported for Testing)
13. **`replacePromptAtIndex(messageText, promptIndex, newPrompt)`** - Replaces Nth prompt in text

## Usage by File

### 1. **streaming_monitor.ts**
**Imports:** `recordPrompt`, `initializePromptPosition`

**Usage:** When detecting new prompts during streaming
```typescript
const promptId = recordPrompt(match.prompt, metadataContext);
const position: PromptPosition = {messageId, promptIndex};
initializePromptPosition(position, promptId, metadataContext);
```

### 2. **image_generator.ts**
**Imports:** `recordPrompt`, `initializePromptPosition`, `getCurrentPromptId`, `recordImagePrompt`

**Usage in `processMessages()`:**
- Initialize positions for detected prompts
```typescript
const promptId = recordPrompt(match.prompt, context);
const position: PromptPosition = {messageId, promptIndex: i};
initializePromptPosition(position, promptId, context);
```

**Usage in `insertGeneratedImage()`:**
- Link generated images to their prompts
```typescript
const position: PromptPosition = {messageId, promptIndex: i};
const promptId = getCurrentPromptId(position, context);
if (promptId) {
  recordImagePrompt(imageUrl, promptId, context);
}
```

### 3. **manual_generation.ts**
**Imports:** `getCurrentPromptId`, `getPromptText`, `recordPrompt`, `initializePromptPosition`, `getImagePromptId`, `recordImagePrompt`

**Usage in `handleRegenerateImage()`:**
- Get current prompt for regeneration
```typescript
const currentPromptId = getCurrentPromptId(position, context);
const currentPrompt = currentPromptId ? getPromptText(currentPromptId, context) : fallback;
```

**Usage in `handleRefinePrompt()`:**
- Initialize position if not exists, then update prompt
```typescript
if (!getCurrentPromptId(position, context)) {
  const newPromptId = recordPrompt(currentPrompt, context);
  initializePromptPosition(position, newPromptId, context);
}
```

**Usage in `handleGenerateButton()`:**
- Link newly generated image to prompt
```typescript
const promptId = getImagePromptId(existingImageSrc, context);
if (promptId) {
  recordImagePrompt(imageUrl, promptId, context);
}
```

### 4. **prompt_updater.ts**
**Imports:** `getCurrentPromptId`, `getPromptText`, `recordPrompt`, `addPromptVersion`

**Usage in `updatePromptForPosition()`:**
- Get current prompt, update with LLM, save new version
```typescript
const currentPromptId = getCurrentPromptId(position, context);
const currentPrompt = getPromptText(currentPromptId, context);
// ... call LLM to get updated prompt ...
const newPromptId = recordPrompt(updatedPrompt, context);
await addPromptVersion(position, newPromptId, feedback, context);
```

## Data Flow

### Initial Prompt Detection
```
Streaming/Manual → recordPrompt() → generates promptId
                 → initializePromptPosition() → stores in metadata.promptPositionHistory
```

### Image Generation
```
Generate Image → getCurrentPromptId() → get prompt for position
              → recordImagePrompt() → link imageUrl to promptId
```

### Prompt Update (Refinement)
```
User feedback → getCurrentPromptId() + getPromptText() → get current prompt
             → LLM generates new prompt
             → recordPrompt() → get new promptId
             → addPromptVersion() → add to history + update message text
```

## Key Data Structures

### AutoIllustratorChatMetadata
```typescript
{
  imageUrlToPromptId: {[imageUrl: string]: promptId},
  promptIdToText: {[promptId: string]: promptText},
  promptPositionHistory: {
    "messageId_promptIndex": {
      versions: [{promptId, feedback, timestamp}, ...]
    }
  }
}
```

## Important Notes

1. **Position Key Format:** `messageId_promptIndex` (e.g., "42_0", "42_1")
2. **Prompt ID Generation:** Hash-based with timestamp to ensure uniqueness
3. **Message Text Updates:** `addPromptVersion()` updates BOTH metadata AND message text
4. **Regex Pattern:** Uses `<!--img-prompt="([^"]*)"-->` pattern (hardcoded in `replacePromptAtIndex`)

## Issues/Concerns for Refactoring

1. ⚠️ **Hardcoded regex pattern** in `replacePromptAtIndex()` - should use centralized pattern from `regex_v2.ts`
2. ⚠️ **Name collision:** `generatePromptId()` also exists in `streaming_image_queue.ts` with different implementation
3. ⚠️ Message text manipulation mixed with metadata management
4. ⚠️ No validation for position existence before operations
5. ⚠️ `addPromptVersion()` is async (saves chat) but other functions aren't

## Recommended Refactoring Strategy

Consider splitting into:
- **prompt_manager.ts** - High-level prompt lifecycle management
- **prompt_storage.ts** - Low-level metadata CRUD operations
- **prompt_position.ts** - Position key utilities
- Use `regex_v2.ts` for pattern matching
