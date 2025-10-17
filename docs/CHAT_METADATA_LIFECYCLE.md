# Chat Metadata Lifecycle in SillyTavern

This document explains how `context.chatMetadata` works in SillyTavern and how extensions should interact with it.

## Table of Contents

1. [Overview](#overview)
2. [How chatMetadata Works](#how-chatmetadata-works)
3. [The CHAT_CHANGED Event](#the-chat_changed-event)
4. [When to Read vs. When to Save](#when-to-read-vs-when-to-save)
5. [Implementation in Auto-Illustrator](#implementation-in-auto-illustrator)
6. [Common Pitfalls](#common-pitfalls)

---

## Overview

`context.chatMetadata` is a **live reference** to SillyTavern's global `chat_metadata` object, not a copy. Understanding this is critical for correct extension behavior.

### Key Facts

- `context.chatMetadata` points to the same object in memory as SillyTavern's `chat_metadata`
- Changes you make are immediately visible to all code
- The object is **replaced entirely** when the user switches chats
- Changes persist only in memory until explicitly saved to disk

---

## How chatMetadata Works

### 1. The Reference Chain

```typescript
// In SillyTavern's script.js
export let chat_metadata = {};

// In st-context.js
export function getContext() {
    return {
        chatMetadata: chat_metadata,  // ← Direct reference, not a copy!
    };
}
```

### 2. What This Means

```typescript
// All these point to the SAME object:
const context1 = SillyTavern.getContext();
const context2 = SillyTavern.getContext();

context1.chatMetadata.foo = "bar";
console.log(context2.chatMetadata.foo);  // "bar" ✅

// No need to reload context during same chat session
```

---

## The CHAT_CHANGED Event

### What Happens During a Chat Change

**Timeline:**

1. User switches to a different chat/character
2. `chat_metadata = {}` (reset to empty object)
3. SillyTavern loads chat file from server
4. `chat_metadata = loadedData['chat_metadata']` (NEW object assigned)
5. `CHAT_CHANGED` event fires

**Before CHAT_CHANGED:**
```typescript
chat_metadata = { auto_illustrator: { oldChatData: {...} } };  // Object A
context.chatMetadata → points to Object A
```

**After CHAT_CHANGED:**
```typescript
chat_metadata = { auto_illustrator: { newChatData: {...} } };  // Object B
context.chatMetadata → points to Object B (completely different!)
```

### The Critical Point

**Old references become stale!**

```typescript
// Before chat change
const oldContext = SillyTavern.getContext();
const oldMetadata = oldContext.chatMetadata;  // Points to Object A

// User switches chat → CHAT_CHANGED fires

// Now oldMetadata still points to Object A (old chat's data)
// But SillyTavern is using Object B (new chat's data)
// Old references are STALE and should not be used!
```

---

## When to Read vs. When to Save

### Reading Metadata

**Rule:** Fetch ONCE per chat session when `CHAT_CHANGED` fires

```typescript
let cachedMetadata = null;

function onChatChanged() {
    cachedMetadata = null;  // Invalidate cache

    const context = SillyTavern.getContext();
    cachedMetadata = context.chatMetadata.auto_illustrator;  // Cache new reference
}

// Hook into event
eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

// Use cached reference throughout the session
function someHandler() {
    // No need to call getContext() again - use cached reference
    cachedMetadata.promptRegistry.nodes[id] = newNode;
}
```

**Why this works:** Because `chatMetadata` is a live reference, the cached pointer remains valid for the entire chat session.

### Saving Metadata

**Rule:** Save EVERY TIME you mutate metadata

```typescript
// Mutate
metadata.promptRegistry.nodes[id] = newNode;

// Save immediately
await saveMetadata();  // Persists to disk
```

**What `saveMetadata()` does:**

```javascript
// From SillyTavern's script.js
export async function saveMetadata() {
    // Calls saveChatConditional() which calls saveChat()
}

async function saveChat() {
    // Takes current chat_metadata
    const metadata = { ...chat_metadata };

    // Bundles with chat messages
    const chatToSave = [
        {
            chat_metadata: metadata,  // ← Saved here
        },
        ...messages,
    ];

    // Sends to server via POST
    await fetch('/api/chats/save', {
        method: 'POST',
        body: JSON.stringify({ chat: chatToSave }),
    });
}
```

---

## Implementation in Auto-Illustrator

### Pattern: Cache + Auto-Save

We use a **cached reference** pattern with **automatic saves** on all mutations:

#### 1. Metadata Module (metadata.ts)

```typescript
let currentMetadata: AutoIllustratorChatMetadata | null = null;

/**
 * Gets metadata (singleton pattern - set in CHAT_CHANGED handler)
 */
export function getMetadata(): AutoIllustratorChatMetadata {
    if (!currentMetadata) {
        throw new Error('Metadata not initialized. CHAT_CHANGED must fire first.');
    }
    return currentMetadata;
}

/**
 * Saves metadata to disk
 */
export async function saveMetadata(): Promise<void> {
    const context = SillyTavern.getContext();

    if (context.saveMetadata) {
        await context.saveMetadata();
    } else {
        await context.saveChat();
    }
}

/**
 * Loads and caches metadata (called on CHAT_CHANGED)
 */
function loadMetadataFromContext() {
    const context = SillyTavern.getContext();
    const chatMetadata = context.chatMetadata;

    // IMPORTANT: Never reassign chatMetadata itself - only modify its properties
    // chatMetadata is a reference to SillyTavern's global chat_metadata object

    // Initialize structure if needed
    if (!chatMetadata.auto_illustrator) {
        chatMetadata.auto_illustrator = {
            promptRegistry: {
                nodes: {},
                imageToPromptId: {},
                rootPromptIds: [],
            },
        };
    }

    // Cache the reference (singleton pattern)
    currentMetadata = chatMetadata.auto_illustrator;
}

// Register event listener
const context = SillyTavern.getContext();
context.eventSource.on(context.eventTypes.CHAT_CHANGED, loadMetadataFromContext);

// Load initial metadata for current chat
loadMetadataFromContext();
```

#### 2. Mutation Functions (prompt_manager.ts)

All mutation functions are **async** and **auto-save**:

```typescript
/**
 * Registers a prompt (with auto-save)
 */
export async function registerPrompt(
    text: string,
    messageId: number,
    promptIndex: number,
    source: PromptSource,
    metadata: AutoIllustratorChatMetadata
): Promise<PromptNode> {
    const registry = getRegistry(metadata);
    const id = generatePromptId(text, messageId, promptIndex);

    // Mutate
    const node = createPromptNode(text, messageId, promptIndex, source);
    registry.nodes[id] = node;
    registry.rootPromptIds.push(id);

    // Auto-save
    await saveMetadata();

    return node;
}

/**
 * Links an image to a prompt (with auto-save)
 */
export async function linkImageToPrompt(
    promptId: string,
    imageUrl: string,
    metadata: AutoIllustratorChatMetadata
): Promise<void> {
    const registry = getRegistry(metadata);
    const node = registry.nodes[promptId];

    if (!node) {
        logger.error(`Cannot link image to non-existent prompt: ${promptId}`);
        return;
    }

    const normalizedUrl = normalizeImageUrl(imageUrl);

    // Mutate
    if (!node.generatedImages.includes(normalizedUrl)) {
        node.generatedImages.push(normalizedUrl);
    }
    registry.imageToPromptId[normalizedUrl] = promptId;

    // Auto-save
    await saveMetadata();
}
```

#### 3. Batch Operations

For batch operations, we provide special functions that save once at the end:

```typescript
/**
 * Detects and registers multiple prompts (saves once at end)
 */
export async function detectPromptsInMessage(
    messageId: number,
    messageText: string,
    patterns: string[],
    metadata: AutoIllustratorChatMetadata
): Promise<PromptNode[]> {
    const matches = extractImagePromptsMultiPattern(messageText, patterns);
    const nodes: PromptNode[] = [];

    // Register all prompts (without saving each time)
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const node = registerPromptInternal(  // Internal version without save
            match.prompt,
            messageId,
            i,
            'ai-message',
            metadata
        );
        nodes.push(node);
    }

    // Save once at the end
    await saveMetadata();

    return nodes;
}
```

---

## Common Pitfalls

### ❌ Pitfall 0: Reassigning context.chatMetadata

**CRITICAL - This will break everything!**

```typescript
// WRONG - Creates new object that SillyTavern doesn't know about
if (!context.chatMetadata) {
    context.chatMetadata = {};  // ❌ DON'T DO THIS!
}
```

**Why it's wrong:** `context.chatMetadata` is a **reference** to SillyTavern's global `chat_metadata`. If you reassign it to a new object, SillyTavern won't know about it and won't save it!

**Correct approach:**
```typescript
// CORRECT - Only modify properties, never reassign
const chatMetadata = context.chatMetadata;  // Get reference to global

// Initialize properties as needed (this modifies the global object)
if (!chatMetadata.auto_illustrator) {
    chatMetadata.auto_illustrator = { /* ... */ };  // ✅ Modifies global
}
```

### ❌ Pitfall 1: Storing Old References Across Chat Changes

**Bad:**
```typescript
// At extension initialization
const metadata = getMetadata();  // Points to Chat A's data

// ... user switches to Chat B ... (CHAT_CHANGED fires)

// Later, trying to use old reference
metadata.promptRegistry.nodes[id] = newNode;  // ❌ Modifying Chat A's stale data!
await saveMetadata();  // ❌ Saves to Chat B, but doesn't include the change!
```

**Good:**
```typescript
// Always get fresh reference or use cached that invalidates on CHAT_CHANGED
function someHandler() {
    const metadata = getMetadata();  // Gets cached reference (auto-invalidated on CHAT_CHANGED)
    metadata.promptRegistry.nodes[id] = newNode;  // ✅ Modifying current chat's data
    await saveMetadata();  // ✅ Saves correctly
}
```

### ❌ Pitfall 2: Forgetting to Save After Mutations

**Bad:**
```typescript
function updatePrompt(id: string) {
    const metadata = getMetadata();
    metadata.promptRegistry.nodes[id].text = newText;  // Mutate
    // ❌ Forgot to save! Changes lost on reload!
}
```

**Good:**
```typescript
async function updatePrompt(id: string) {
    const metadata = getMetadata();
    metadata.promptRegistry.nodes[id].text = newText;  // Mutate
    await saveMetadata();  // ✅ Persisted to disk
}
```

### ❌ Pitfall 3: Excessive Saves in Loops

**Bad:**
```typescript
// Saves 100 times!
for (let i = 0; i < 100; i++) {
    metadata.data[i] = value;
    await saveMetadata();  // ❌ Too many disk writes!
}
```

**Good:**
```typescript
// Save once at the end
for (let i = 0; i < 100; i++) {
    metadata.data[i] = value;
}
await saveMetadata();  // ✅ Single save
```

### ❌ Pitfall 4: Calling getContext() Repeatedly During Same Chat

**Unnecessary (but harmless):**
```typescript
function handler1() {
    const context = SillyTavern.getContext();  // Call 1
    context.chatMetadata.foo = "bar";
}

function handler2() {
    const context = SillyTavern.getContext();  // Call 2 (unnecessary but works)
    console.log(context.chatMetadata.foo);  // "bar"
}
```

**More efficient:**
```typescript
// Cache the metadata reference
const metadata = getMetadata();  // Cached

function handler1() {
    metadata.foo = "bar";  // Use cached
}

function handler2() {
    console.log(metadata.foo);  // Use cached
}
```

---

## Summary

### The Golden Rules

1. **Fetch metadata ONCE per chat session** (on `CHAT_CHANGED`)
2. **Save EVERY TIME you mutate** (via `await saveMetadata()`)
3. **Cache the reference** for efficiency (invalidate on `CHAT_CHANGED`)
4. **Don't store references across chat changes** (they become stale)

### Quick Reference

| Scenario | Action | Why |
|----------|--------|-----|
| `CHAT_CHANGED` fires | Invalidate cache, reload metadata | New chat = new object reference |
| You mutate metadata | Call `await saveMetadata()` | Persist to disk |
| During same chat | Reuse cached reference | It's a live reference - no reload needed |
| Batch operations | Mutate multiple times, save once | More efficient |

---

## Further Reading

- [SillyTavern script.js](https://github.com/SillyTavern/SillyTavern/blob/release/public/script.js) - See `saveChat()` and `getChat()` functions
- [st-context.js](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/st-context.js) - See `getContext()` implementation
- [Auto-Illustrator metadata.ts](../src/metadata.ts) - Our implementation
- [Auto-Illustrator prompt_manager.ts](../src/prompt_manager.ts) - Auto-save mutation functions
