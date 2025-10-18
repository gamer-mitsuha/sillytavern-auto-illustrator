# Message Rendering Best Practices

## Overview

This document outlines the best practices and learnings about rendering message text after making changes like inserting image tags, updating content, or modifying message structure in the SillyTavern Auto Illustrator extension.

## Table of Contents

- [The Standard Event Sequence](#the-standard-event-sequence)
- [Key Learnings](#key-learnings)
- [The Helper Function](#the-helper-function)
- [When to Use renderMessageUpdate](#when-to-use-rendermessageupdate)
- [Common Pitfalls](#common-pitfalls)
- [Examples](#examples)
- [SillyTavern Context API](#sillytavern-context-api)

## The Standard Event Sequence

Whenever you modify a message's content (`message.mes`), you **must** follow this exact sequence to ensure proper rendering and persistence:

```typescript
// 1. Modify the message content
message.mes = updatedText;

// 2. Emit MESSAGE_EDITED event
//    - Triggers regex "Run on Edit" rules
//    - Notifies other extensions of the edit
await context.eventSource.emit(context.eventTypes.MESSAGE_EDITED, messageId);

// 3. Update the DOM
//    - Renders the updated message in the UI
context.updateMessageBlock(messageId, message);

// 4. Emit MESSAGE_UPDATED event
//    - Notifies other extensions that message is fully updated
await context.eventSource.emit(context.eventTypes.MESSAGE_UPDATED, messageId);

// 5. Save to disk
//    - Persists both metadata and chat to disk
await saveMetadata();
```

### Why This Order Matters

1. **MESSAGE_EDITED before DOM update**: Allows other extensions to process the raw text before it's rendered
2. **updateMessageBlock after MESSAGE_EDITED**: Ensures DOM reflects the final state after all handlers run
3. **MESSAGE_UPDATED after DOM update**: Notifies extensions that everything is complete and rendered
4. **saveMetadata last**: Only save after all processing is done to avoid partial state being persisted

## Key Learnings

### 1. Always Use `saveMetadata()` from `./metadata.ts`

**Critical Rule**: Always import and use `saveMetadata()` from our `./metadata.ts` file, never use `context.saveMetadata()` or `context.saveChat()` directly.

```typescript
// ❌ WRONG - Direct context calls
await context.saveMetadata();
await context.saveChat();

// ✅ CORRECT - Use our wrapper
import {saveMetadata} from './metadata';
await saveMetadata();
```

**Why Our Wrapper Is Better**:
- Prefers `context.saveMetadataDebounced()` for better performance (1s debounce, batches rapid saves)
- Has fallback logic for older SillyTavern versions
- Provides consistent error handling and logging
- Centralizes save logic in one place

**Save Chain Confirmation**:
Both save methods ultimately save the chat:
- `context.saveMetadataDebounced()` → (after delay) → `context.saveMetadata()` → `saveChatConditional()` → `saveChat()`
- `context.saveMetadata()` → `saveChatConditional()` → `saveChat()`

**Important Discovery**: SillyTavern's `saveMetadata()` internally calls `saveChat()`. You should **never** call both:

```typescript
// ❌ WRONG - Redundant calls
await saveMetadata();
await context.saveChat();

// ✅ CORRECT - Only call saveMetadata()
import {saveMetadata} from './metadata';
await saveMetadata();
```

**Why**: From SillyTavern's source (`script.js:7995-8002`):
```javascript
export async function saveMetadata() {
    if (selected_group) {
        await editGroup(selected_group, true, false);
    } else {
        await saveChatConditional(); // This saves the chat!
    }
}
```

### 2. Always Emit MESSAGE_UPDATED

**Previous Misconception**: There was a belief that emitting `MESSAGE_UPDATED` causes other extensions to strip images.

**Reality**: This is **not true**. All message rendering locations should emit `MESSAGE_UPDATED` to maintain consistency and allow other extensions to respond to changes properly.

```typescript
// ❌ WRONG - Skipping MESSAGE_UPDATED
await context.eventSource.emit(MESSAGE_EDITED, messageId);
context.updateMessageBlock(messageId, message);
// Missing MESSAGE_UPDATED!
await saveMetadata();

// ✅ CORRECT - Always emit MESSAGE_UPDATED
await context.eventSource.emit(MESSAGE_EDITED, messageId);
context.updateMessageBlock(messageId, message);
await context.eventSource.emit(MESSAGE_UPDATED, messageId);
await saveMetadata();
```

### 3. Use `SillyTavern.getContext()` for Fresh Context

When creating helper functions that need the SillyTavern context, always fetch it fresh using `SillyTavern.getContext()` rather than passing it as a parameter:

```typescript
// ❌ AVOID - Stale context might be passed
async function renderMessage(messageId: number, context: ExtensionContext) {
    // context might be outdated
}

// ✅ PREFERRED - Always fresh context
async function renderMessage(messageId: number) {
    const context = SillyTavern.getContext();
    // context is guaranteed to be current
}
```

### 4. Missing Events Lead to Inconsistent Behavior

Locations that don't follow the standard sequence can cause:
- Regex extensions not triggering
- Other extensions not being notified of changes
- UI not updating correctly
- State inconsistencies between extensions

## The Helper Function

To enforce consistency, we've created a standardized helper function:

### `renderMessageUpdate()`

**Location**: `src/utils/message_renderer.ts`

**Signature**:
```typescript
async function renderMessageUpdate(
  messageId: number,
  options?: {
    skipSave?: boolean;  // Skip saving when no changes were made
  }
): Promise<void>
```

**What It Does**:
1. Fetches fresh context via `SillyTavern.getContext()`
2. Retrieves the message from `context.chat[messageId]`
3. Emits `MESSAGE_EDITED` event
4. Calls `context.updateMessageBlock(messageId, message)`
5. Emits `MESSAGE_UPDATED` event
6. Calls `saveMetadata()` (unless `skipSave: true`)

**Example Usage**:
```typescript
import {renderMessageUpdate} from './utils/message_renderer';

// Modify message content
message.mes = newContent;

// Render with proper event sequence and save
await renderMessageUpdate(messageId);
```

**With Skip Save Option**:
```typescript
// When no actual changes were made (optimization)
await renderMessageUpdate(messageId, {skipSave: true});
```

## When to Use renderMessageUpdate

Use `renderMessageUpdate()` whenever you modify `message.mes`, including:

### ✅ Image Insertion
```typescript
// After inserting <img> tags into message.mes
message.mes = insertImageTags(message.mes, images);
await renderMessageUpdate(messageId);
```

### ✅ Image Deletion
```typescript
// After removing <img> tags from message.mes
message.mes = message.mes.replace(imgPattern, '');
await renderMessageUpdate(messageId);
```

### ✅ Text Replacement
```typescript
// After replacing prompt text
message.mes = replacePromptText(message.mes, oldPrompt, newPrompt);
await renderMessageUpdate(messageId);
```

### ✅ Content Reconciliation
```typescript
// After restoring missing images
message.mes = reconciledText;
await renderMessageUpdate(messageId);
```

### ❌ When NOT to Use

**Do NOT use for**:
- Operations that only modify metadata (not message.mes)
- Operations that don't change message content at all
- Initial message creation (before it exists in chat)

**Example - Metadata-only change**:
```typescript
// Only modifying metadata, not message.mes
const metadata = getMetadata();
metadata.someField = newValue;
await saveMetadata(); // Just save, no rendering needed
```

## Common Pitfalls

### Pitfall 1: Missing Events

```typescript
// ❌ WRONG - No events emitted
message.mes = newContent;
context.updateMessageBlock(messageId, message);
await context.saveChat();

// ✅ CORRECT - Use helper
message.mes = newContent;
await renderMessageUpdate(messageId);
```

### Pitfall 2: Wrong Event Order

```typescript
// ❌ WRONG - MESSAGE_UPDATED before updateMessageBlock
message.mes = newContent;
await context.eventSource.emit(MESSAGE_EDITED, messageId);
await context.eventSource.emit(MESSAGE_UPDATED, messageId); // Too early!
context.updateMessageBlock(messageId, message);

// ✅ CORRECT - Use helper
message.mes = newContent;
await renderMessageUpdate(messageId);
```

### Pitfall 3: Redundant Save Calls

```typescript
// ❌ WRONG - Both saveMetadata and saveChat
message.mes = newContent;
await context.eventSource.emit(MESSAGE_EDITED, messageId);
context.updateMessageBlock(messageId, message);
await context.eventSource.emit(MESSAGE_UPDATED, messageId);
await saveMetadata();
await context.saveChat(); // Redundant!

// ✅ CORRECT - Only saveMetadata
message.mes = newContent;
await renderMessageUpdate(messageId);
```

### Pitfall 4: Passing Stale Context

```typescript
// ❌ AVOID - Context might be stale
async function myHelper(messageId: number, context: ExtensionContext) {
    // What if context changed since this was called?
    context.updateMessageBlock(messageId, message);
}

// ✅ CORRECT - Fetch fresh context
async function myHelper(messageId: number) {
    const context = SillyTavern.getContext();
    context.updateMessageBlock(messageId, message);
}
```

## Examples

### Example 1: Simple Image Insertion

```typescript
import {renderMessageUpdate} from './utils/message_renderer';

async function insertImage(messageId: number, imageUrl: string) {
    const context = SillyTavern.getContext();
    const message = context.chat[messageId];

    // Modify message content
    const imgTag = `<img src="${imageUrl}" />`;
    message.mes += imgTag;

    // Render with proper event sequence
    await renderMessageUpdate(messageId);

    logger.info(`Image inserted into message ${messageId}`);
}
```

### Example 2: Conditional Rendering (with skipSave)

```typescript
import {renderMessageUpdate} from './utils/message_renderer';

async function reconcileMessage(messageId: number) {
    const context = SillyTavern.getContext();
    const message = context.chat[messageId];

    const result = reconcile(message.mes);

    if (result.restoredCount > 0) {
        // Changes were made - save them
        message.mes = result.updatedText;
        await renderMessageUpdate(messageId);
    } else {
        // No changes made - just emit events for consistency
        await renderMessageUpdate(messageId, {skipSave: true});
    }
}
```

### Example 3: Batch Operations

```typescript
import {renderMessageUpdate} from './utils/message_renderer';

async function insertMultipleImages(
    messageId: number,
    images: Array<{url: string, prompt: string}>
) {
    const context = SillyTavern.getContext();
    const message = context.chat[messageId];

    // Perform all modifications at once
    let updatedText = message.mes;
    for (const img of images) {
        updatedText = insertImageAtPrompt(updatedText, img.url, img.prompt);
    }

    // Single atomic write
    message.mes = updatedText;

    // Single render call for all changes
    await renderMessageUpdate(messageId);

    logger.info(`Inserted ${images.length} images`);
}
```

## SillyTavern Context API

### Key Context Properties

```typescript
interface ExtensionContext {
    // Chat data
    chat: Message[];              // Array of all messages

    // Event system
    eventSource: {
        emit(eventType: string, messageId: number): Promise<void>;
    };
    eventTypes: {
        MESSAGE_EDITED: string;   // 'MESSAGE_EDITED'
        MESSAGE_UPDATED: string;  // 'MESSAGE_UPDATED'
    };

    // Rendering
    updateMessageBlock(messageId: number, message: Message): void;

    // Persistence (use saveMetadata() instead!)
    saveChat(): Promise<void>;
    saveMetadata(): Promise<void>;
    saveMetadataDebounced(): void;
}
```

### Event Types

#### MESSAGE_EDITED
- **When**: Emitted when message content is edited
- **Purpose**: Triggers regex "Run on Edit" rules and notifies other extensions
- **Emit BEFORE**: DOM update

#### MESSAGE_UPDATED
- **When**: Emitted after message is fully processed and rendered
- **Purpose**: Notifies other extensions that message processing is complete
- **Emit AFTER**: DOM update

### Save Functions

#### `saveMetadata()` (from `./metadata.ts`)
- **Always import from `./metadata.ts`**, never use `context.saveMetadata()`
- Saves both metadata AND chat to disk (confirmed via call chain analysis)
- Use this for all save operations in the extension
- Includes fallback to `saveChat()` for older SillyTavern versions
- Internally calls `context.saveMetadataDebounced()` for better performance (preferred)

**Call Chain**:
```
Our saveMetadata() wrapper:
  → context.saveMetadataDebounced() [preferred, 1s debounce]
    → (after delay) → context.saveMetadata()
      → saveChatConditional()
        → saveChat() ✓ Chat is saved!
```

**Import**:
```typescript
import {saveMetadata} from './metadata';
```

#### Why Not Use `context.saveMetadata()` Directly?

Our `saveMetadata()` wrapper in `metadata.ts`:
- Prefers the debounced version (`context.saveMetadataDebounced()`) to prevent I/O blocking
- Has fallback logic for older SillyTavern versions
- Provides consistent error handling
- Centralizes save logic in one place

**Always use our wrapper**:
```typescript
// ❌ WRONG - Direct context call
await context.saveMetadata();

// ✅ CORRECT - Use our wrapper
import {saveMetadata} from './metadata';
await saveMetadata();
```

#### `saveChat()` ⚠️
- **Never use directly** - use `saveMetadata()` from `./metadata.ts` instead
- Only kept for backward compatibility in older code
- `saveMetadata()` already calls this internally

## Testing Considerations

When writing tests that involve message rendering:

1. **Mock `renderMessageUpdate`**:
```typescript
vi.mock('./utils/message_renderer', () => ({
  renderMessageUpdate: vi.fn().mockResolvedValue(undefined),
}));
```

2. **Verify it was called**:
```typescript
import * as messageRenderer from './utils/message_renderer';

// After your operation
expect(messageRenderer.renderMessageUpdate).toHaveBeenCalledWith(messageId);
```

3. **Test options**:
```typescript
// With skipSave
expect(messageRenderer.renderMessageUpdate).toHaveBeenCalledWith(
  messageId,
  {skipSave: true}
);
```

## Migration Guide

### Before (Old Pattern)

```typescript
// Old scattered pattern - DON'T USE
message.mes = updatedText;
const MESSAGE_EDITED = context.eventTypes.MESSAGE_EDITED;
await context.eventSource.emit(MESSAGE_EDITED, messageId);
context.updateMessageBlock(messageId, message);
await saveMetadata();
await context.saveChat(); // Redundant!
// Missing MESSAGE_UPDATED!
```

### After (New Pattern)

```typescript
// New standardized pattern - USE THIS
import {renderMessageUpdate} from './utils/message_renderer';

message.mes = updatedText;
await renderMessageUpdate(messageId);
```

### Migration Checklist

When migrating existing code:

- [ ] Import `renderMessageUpdate` from `./utils/message_renderer`
- [ ] Keep the `message.mes = ...` modification
- [ ] Replace all event emissions with single `renderMessageUpdate()` call
- [ ] Remove redundant `saveChat()` calls
- [ ] Remove manual `updateMessageBlock()` calls
- [ ] Remove manual event emissions
- [ ] Add `skipSave: true` option if save not needed
- [ ] Update tests to mock `renderMessageUpdate`
- [ ] Verify all tests pass
- [ ] Verify linter passes

## References

- **Helper Function**: `src/utils/message_renderer.ts`
- **Helper Tests**: `src/utils/message_renderer.test.ts`
- **SillyTavern Context**: SillyTavern `public/scripts/extensions.js`
- **SillyTavern saveMetadata**: SillyTavern `public/script.js:7995-8002`

## History

- **2025-10-18**: Initial documentation created after standardization refactoring
  - Discovered `saveMetadata()` includes `saveChat()`
  - Clarified that `MESSAGE_UPDATED` should always be emitted
  - Created `renderMessageUpdate()` helper function
  - Refactored all message rendering locations to use helper
