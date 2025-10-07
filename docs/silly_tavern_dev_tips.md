# SillyTavern Extension Development Tips

This document contains practical insights and lessons learned from developing the Auto Illustrator extension for SillyTavern.

## Table of Contents

- [Event System](#event-system)
- [DOM Rendering and Message Updates](#dom-rendering-and-message-updates)
- [Prompt Injection](#prompt-injection)
- [Generation Types and Filtering](#generation-types-and-filtering)
- [Chat History Manipulation](#chat-history-manipulation)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

---

## Event System

### Event Lifecycle for Message Generation

Understanding the event flow is crucial for proper extension integration:

```
GENERATION_STARTED
  ↓
STREAM_TOKEN_RECEIVED (multiple times during streaming)
  ↓
CHAT_COMPLETION_PROMPT_READY (for chat completion APIs)
  ↓
GENERATION_ENDED (when generation completes)
  ↓
MESSAGE_RECEIVED (after generation has ended)
```

**Key Points:**
- `GENERATION_STARTED` fires for ALL APIs, but `CHAT_COMPLETION_PROMPT_READY` only fires for chat completion APIs (OpenAI, Claude, Google, etc. - all APIs compatible with OpenAI's chat completion format)
- `GENERATION_ENDED` fires **before** `MESSAGE_RECEIVED`
- `GENERATION_STARTED` can fire without `CHAT_COMPLETION_PROMPT_READY` (e.g., if generation is interrupted early)
- The reverse is never true: `CHAT_COMPLETION_PROMPT_READY` always follows `GENERATION_STARTED`

### GENERATION_STARTED Event

**Location:** `/public/script.js:3410`

**Signature:**
```javascript
await eventSource.emit(event_types.GENERATION_STARTED, type, options, dryRun);
```

**Parameters:**
- `type`: Generation type string - `'normal'` | `'quiet'` | `'impersonate'` | `'continue'` | `'regenerate'` | `'swipe'`
- `options`: Object containing generation options:
  - `quiet_prompt`: The quiet prompt text (if any)
  - `quietImage`: Quiet image data
  - `quietToLoud`: Whether quiet should be converted to loud
  - `skipWIAN`: Skip world info and author's note
  - `automatic_trigger`: Whether automatically triggered
  - `force_name2`: Forced character name
  - `force_chid`: Forced character ID
- `dryRun`: Boolean indicating if this is a preview/token counting run

**Example Usage:**
```typescript
context.eventSource.on(context.eventTypes.GENERATION_STARTED,
  (type: string, options: any, dryRun: boolean) => {
    console.log('Generation started:', type);
    if (dryRun) return; // Skip preview runs
    if (type === 'quiet') return; // Skip quiet generations
  }
);
```

### CHAT_COMPLETION_PROMPT_READY Event

**Location:** `/public/scripts/openai.js:1533`

**Signature:**
```javascript
const eventData = { chat, dryRun };
await eventSource.emit(event_types.CHAT_COMPLETION_PROMPT_READY, eventData);
```

**Parameters:**
- `eventData.chat`: Array of chat messages in OpenAI format:
  ```typescript
  Array<{
    role: 'system' | 'user' | 'assistant',
    content: string,
    name?: string,
    tool_calls?: any[]
  }>
  ```
- `eventData.dryRun`: Boolean indicating if this is a token counting/preview run

**Use Cases:**
- Modify chat history before sending to LLM
- Inject custom system messages
- Remove/filter messages
- Prune unwanted content

**Example Usage:**
```typescript
context.eventSource.on(context.eventTypes.CHAT_COMPLETION_PROMPT_READY,
  (eventData: any) => {
    if (eventData.dryRun) return;

    // Inject custom system message as last message
    eventData.chat.push({
      role: 'system',
      content: 'Your custom instructions here'
    });
  }
);
```

### MESSAGE_EDITED and MESSAGE_UPDATED Events

These events are critical for triggering UI updates and regex processing.

**Event Flow for Manual Message Edit:**
```
User clicks edit → messageEditDone() called
  ↓
MESSAGE_EDITED emitted
  ↓
Regex "Run on Edit" scripts execute
  ↓
messageFormatting() called (converts markdown/tags to HTML)
  ↓
MESSAGE_UPDATED emitted
```

**Key Functions:**
- `messageEditDone()` *(script.js:7139)*: Handles manual edit completion
- `messageFormatting()`: Converts raw text to rendered HTML
- `updateMessageBlock()` *(script.js:1792)*: Re-renders message block

---

## DOM Rendering and Message Updates

### The Problem: Events Alone Don't Trigger DOM Updates

**Common Mistake:**
```typescript
// ❌ This does NOT update the DOM
await context.eventSource.emit(MESSAGE_UPDATED, messageId);
```

**Why It Doesn't Work:**
- Events are for *notification*, not *action*
- DOM updates require explicit rendering function calls
- `messageFormatting()` must be called to convert `<img>` tags to rendered HTML

### The Solution: updateMessageBlock()

**Function:** `updateMessageBlock(messageId, message, options?)`

**Location:** `/public/script.js:1792-1810`

**What It Does:**
1. Calls `messageFormatting()` to convert text to HTML
2. Updates the DOM with the rendered content
3. Properly handles image tags, markdown, etc.

**Correct Usage:**
```typescript
// ✅ Proper sequence for updating messages
const MESSAGE_EDITED = context.eventTypes.MESSAGE_EDITED;
const MESSAGE_UPDATED = context.eventTypes.MESSAGE_UPDATED;

// 1. Emit MESSAGE_EDITED first (triggers regex "Run on Edit")
await context.eventSource.emit(MESSAGE_EDITED, messageId);

// 2. Re-render the message block (updates DOM)
context.updateMessageBlock(messageId, message);

// 3. Emit MESSAGE_UPDATED (notify other extensions)
await context.eventSource.emit(MESSAGE_UPDATED, messageId);
```

### Why This Order Matters

1. **MESSAGE_EDITED first**: Regex scripts with "Run on Edit" need to modify `message.mes` *before* rendering
2. **updateMessageBlock()**: Converts the modified text to HTML and updates DOM
3. **MESSAGE_UPDATED last**: Notifies other extensions that the message has changed

### Don't Call messageEditDone() Directly

**Why Not:**
- It's not exported from `script.js`
- Requires jQuery DOM elements as parameters
- Has UI side effects (shows/hides edit buttons)
- Tightly coupled to manual editing workflow

**Instead:** Use the same underlying functions that `messageEditDone()` uses:
- `emit(MESSAGE_EDITED, messageId)`
- `updateMessageBlock(messageId, message)`
- `emit(MESSAGE_UPDATED, messageId)`

---

## Prompt Injection

### Option 1: setExtensionPrompt() API (Legacy Approach)

**Function Signature:**
```typescript
setExtensionPrompt(
  key: string,
  value: string,
  position: number,
  depth: number,
  scan?: boolean,
  role?: number,
  filter?: (() => boolean) | null
)
```

**Position Types:**
```typescript
extension_prompt_types = {
  NONE: -1,      // No injection
  IN_PROMPT: 0,  // After story string (in prompt construction)
  IN_CHAT: 1,    // At specific depth in chat messages
  BEFORE_PROMPT: 2  // Before story string (at top of prompt)
}
```

**Role Types:**
```typescript
extension_prompt_roles = {
  SYSTEM: 0,
  USER: 1,
  ASSISTANT: 2
}
```

**Depth Parameter (for IN_CHAT position):**
- `0` = Last message in context (closest to model generation)
- `1` = Second-to-last message
- `2` = Third-to-last message
- Higher values = Further from generation

**How IN_CHAT Injection Works:**

*Location:* `/public/script.js:4715-4762` (doChatInject function)

1. Messages array is **reversed** (so depth 0 = last)
2. Prompts are processed from depth 0 to MAX_INJECTION_DEPTH (10000)
3. At each depth, roles are processed in order: SYSTEM → USER → ASSISTANT
4. Messages are **reversed back** after injection

**The Problem with setExtensionPrompt:**

❌ **No guaranteed ordering among same depth/role:**
```typescript
// Extension A
setExtensionPrompt('ext-a', 'Prompt A', 1, 0, false, 0);

// Extension B
setExtensionPrompt('ext-b', 'Prompt B', 1, 0, false, 0);

// Result: Order of A and B is unpredictable!
// Both are SYSTEM role at depth 0, but insertion order depends on
// the order of keys in the extension_prompts object.
```

### Option 2: Direct CHAT_COMPLETION_PROMPT_READY Injection (Recommended)

**Advantages:**
- ✅ Guaranteed last position
- ✅ Full control over injection logic
- ✅ No dependency on extension load order
- ✅ Can filter by generation type
- ✅ Can inspect and modify entire chat array

**Implementation Pattern:**
```typescript
let currentGenerationType: string | null = null;

// Track generation type
context.eventSource.on(context.eventTypes.GENERATION_STARTED,
  (type: string) => {
    currentGenerationType = type;
  }
);

// Clear on completion to prevent stale state
context.eventSource.on(context.eventTypes.GENERATION_ENDED, () => {
  currentGenerationType = null;
});

// Inject prompt
context.eventSource.on(context.eventTypes.CHAT_COMPLETION_PROMPT_READY,
  (eventData: any) => {
    // Filter unwanted generation types
    if (eventData.dryRun ||
        !currentGenerationType ||
        ['quiet', 'impersonate'].includes(currentGenerationType)) {
      return;
    }

    // Inject as last system message
    eventData.chat.push({
      role: 'system',
      content: 'Your meta-prompt here'
    });
  }
);
```

**When to Use Each Approach:**

| Use Case | Recommended Approach |
|----------|---------------------|
| Need guaranteed last position | CHAT_COMPLETION_PROMPT_READY |
| Need to filter by generation type | CHAT_COMPLETION_PROMPT_READY |
| Need to inspect chat history | CHAT_COMPLETION_PROMPT_READY |
| Simple injection at fixed depth | setExtensionPrompt |
| Injection for all API types | setExtensionPrompt |
| Chat completion APIs only (OpenAI, Claude, etc.) | CHAT_COMPLETION_PROMPT_READY |

---

## Generation Types and Filtering

### Generation Types

| Type | Description | Common Use |
|------|-------------|-----------|
| `'normal'` | Standard chat message | Regular conversation |
| `'quiet'` | Background generation | Extension slash commands, hidden prompts |
| `'impersonate'` | AI writes message as user | AI pretends to be the user |
| `'continue'` | Continue previous message | Extend incomplete response |
| `'regenerate'` | Regenerate last message | Retry last response |
| `'swipe'` | Swipe to alternate | View alternate responses |

### When to Skip Injection

**Recommended filtering:**
```typescript
const shouldSkip =
  eventData.dryRun ||              // Token counting/preview
  !currentGenerationType ||         // Unknown type (safety)
  ['quiet', 'impersonate'].includes(currentGenerationType);
```

**Rationale:**
- **Quiet generations**: Used by extensions for background tasks (e.g., `/trigger`, `/sysgen`). Your extension's meta-prompt would interfere with their specific instructions.
- **Impersonate mode**: AI is writing a message as the user (pretending to be the user). The generated content appears as a user message, not an assistant message.
- **Dry runs**: Just counting tokens for display, not actual generation.

### Examples from SillyTavern Extensions

**TTS Extension** *(/public/scripts/extensions/tts/index.js:1112)*:
```javascript
async function onGenerationStarted(generationType, _args, isDryRun) {
    if (isDryRun || ['quiet', 'impersonate'].includes(generationType)) {
        return; // Skip TTS for these types
    }
    // ... TTS logic
}
```

**Memory Enhancement Extension** *(/public/scripts/extensions/third-party/st-memory-enhancement/index.js:543)*:
```javascript
async function onChatCompletionPromptReady(eventData) {
    if (eventData.dryRun === true) {
        return; // Skip memory injection for dry runs
    }
    // ... inject memory context
}
```

---

## Chat History Manipulation

### CHAT_COMPLETION_PROMPT_READY eventData.chat Structure

**Array Format:**
```typescript
eventData.chat: Array<{
  role: 'system' | 'user' | 'assistant',
  content: string,
  name?: string,           // Character/user name
  tool_calls?: any[]       // For function calling
}>
```

**Safe Modifications:**
```typescript
// ✅ Add messages
eventData.chat.push({ role: 'system', content: '...' });

// ✅ Remove messages
eventData.chat = eventData.chat.filter(msg => !shouldRemove(msg));

// ✅ Modify content
eventData.chat.forEach(msg => {
  if (msg.role === 'assistant') {
    msg.content = processContent(msg.content);
  }
});

// ✅ Insert at specific position
eventData.chat.splice(index, 0, { role: 'system', content: '...' });
```

**Important Notes:**
- Changes to `eventData.chat` **only affect the current generation**
- Original chat history in `context.chat` is **not modified**
- To persist changes, you must call `context.saveChat()`

### Example: Pruning Generated Images

```typescript
context.eventSource.on(context.eventTypes.CHAT_COMPLETION_PROMPT_READY,
  (eventData: any) => {
    if (eventData?.chat) {
      // Remove generated images from assistant messages
      for (const message of eventData.chat) {
        if (message.role === 'assistant') {
          message.content = message.content.replace(
            /<img[^>]*src="[^"]*"[^>]*>/g,
            ''
          );
        }
      }
    }
  }
);
```

---

## Common Patterns

### Pattern 1: State Tracking Across Events

**Problem:** Need to correlate information between events (e.g., track generation type from GENERATION_STARTED to use in CHAT_COMPLETION_PROMPT_READY).

**Solution:** Module-level state variables with proper cleanup.

```typescript
// Module state
let currentGenerationType: string | null = null;
let currentStreamingMessageId: number | null = null;

// Set state
context.eventSource.on(context.eventTypes.GENERATION_STARTED, (type) => {
  currentGenerationType = type;
});

// Use state
context.eventSource.on(context.eventTypes.CHAT_COMPLETION_PROMPT_READY,
  (eventData) => {
    // Use currentGenerationType here
  }
);

// Clear state to prevent stale data
context.eventSource.on(context.eventTypes.GENERATION_ENDED, () => {
  currentGenerationType = null;
  currentStreamingMessageId = null;
});
```

### Pattern 2: Preventing Duplicate Event Handlers

**Problem:** Multiple STREAM_TOKEN_RECEIVED events can cause duplicate processing.

**Solution:** Guard check with state tracking.

```typescript
let currentStreamingMessageId: number | null = null;
let streamingMonitor: StreamingMonitor | null = null;

context.eventSource.on(context.eventTypes.STREAM_TOKEN_RECEIVED,
  (messageId: number) => {
    // Don't restart if already monitoring this message
    if (streamingMonitor && currentStreamingMessageId === messageId) {
      logger.debug(`Already monitoring message ${messageId}, skipping`);
      return;
    }

    currentStreamingMessageId = messageId;
    streamingMonitor = new StreamingMonitor(messageId);
    streamingMonitor.start();
  }
);
```

### Pattern 3: Safe Message Access

**Problem:** Messages might not exist yet or could be undefined.

**Solution:** Defensive checks with fallbacks.

```typescript
function getLastAssistantMessageId(): number | null {
  const chat = context.chat;

  if (!Array.isArray(chat) || chat.length === 0) {
    return null;
  }

  for (let i = chat.length - 1; i >= 0; i--) {
    if (chat[i]?.is_user === false) {
      return i;
    }
  }

  return null;
}
```

### Pattern 4: Regex "Run on Edit" Compatibility

**Problem:** Extensions using regex scripts with "Run on Edit" need MESSAGE_EDITED to fire before content is rendered.

**Implementation:**
```typescript
// ✅ Correct order
await context.eventSource.emit(MESSAGE_EDITED, messageId);
context.updateMessageBlock(messageId, message);
await context.eventSource.emit(MESSAGE_UPDATED, messageId);
```

**How Regex "Run on Edit" Works:**

*Location:* `/public/scripts/extensions/regex/engine.js:100`

```javascript
function getRegexedString(str, options) {
  // Check if this is an edit operation
  const isEdit = options?.isEdit;

  // Only run "Run on Edit" scripts if isEdit is true
  if (script.runOnEdit && isEdit) {
    str = applyRegexScript(str);
  }

  return str;
}
```

The `isEdit` flag is set when `messageEditDone()` is called, which happens during MESSAGE_EDITED event handling.

---

## Troubleshooting

### Issue: Images not appearing after insertion

**Symptoms:**
- Image tags exist in `message.mes`
- Images not visible in chat UI
- Manual edit makes images appear

**Cause:** DOM not re-rendered after message update.

**Solution:**
```typescript
// ✅ Call updateMessageBlock to trigger re-render
context.updateMessageBlock(messageId, message);
```

### Issue: Meta-prompt not at the end of chat

**Symptoms:**
- Meta-prompt appears in middle of chat
- Other system messages appear after your prompt

**Cause:** Using `setExtensionPrompt` with multiple extensions at same depth.

**Solution:** Use direct CHAT_COMPLETION_PROMPT_READY injection:
```typescript
context.eventSource.on(context.eventTypes.CHAT_COMPLETION_PROMPT_READY,
  (eventData) => {
    eventData.chat.push({
      role: 'system',
      content: yourMetaPrompt
    });
  }
);
```

### Issue: Deferred data lost between events

**Symptoms:**
- Data stored during streaming
- Missing when GENERATION_ENDED fires
- Multiple event handlers recreate objects

**Cause:** Event handler recreating processor/monitor, losing state.

**Solution:** Guard check to prevent recreation:
```typescript
let processor: QueueProcessor | null = null;

context.eventSource.on(context.eventTypes.STREAM_TOKEN_RECEIVED, () => {
  // Don't recreate if already exists
  if (processor) return;

  processor = new QueueProcessor();
});

context.eventSource.on(context.eventTypes.GENERATION_ENDED, () => {
  processor?.finalize();
  processor = null;
});
```

### Issue: Extension affects quiet generations

**Symptoms:**
- Extension interferes with `/trigger`, `/sysgen`, etc.
- Quiet generations produce unexpected results

**Cause:** Not filtering generation types.

**Solution:**
```typescript
let generationType: string | null = null;

context.eventSource.on(context.eventTypes.GENERATION_STARTED, (type) => {
  generationType = type;
});

context.eventSource.on(context.eventTypes.CHAT_COMPLETION_PROMPT_READY,
  (eventData) => {
    // Skip quiet generations
    if (generationType === 'quiet') return;

    // Your logic here
  }
);
```

### Issue: Type errors with eventSource.emit

**Symptoms:**
- TypeScript complains about missing `await`
- Warning: "await has no effect on type"

**Cause:** Incorrect type definition for `emit()`.

**Solution:** Update `globals.d.ts`:
```typescript
interface SillyTavernContext {
  eventSource: {
    on(event: string, callback: (...args: any[]) => void): void;
    once(event: string, callback: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): Promise<void>; // ← Should return Promise
  };
}
```

### Issue: Changes not persisting after reload

**Symptoms:**
- Message modifications visible during session
- Lost after refreshing or switching chats

**Cause:** Only modified in-memory chat, not saved.

**Solution:**
```typescript
// Modify the message
message.mes = modifiedContent;

// Save to disk
await context.saveChat();
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `/public/script.js` | Main SillyTavern script with core functions |
| `/public/scripts/openai.js` | OpenAI API handling and CHAT_COMPLETION_PROMPT_READY |
| `/public/scripts/events.js` | Event type definitions |
| `/public/scripts/extensions/regex/engine.js` | Regex script processing |

## Useful Functions in script.js

| Function | Line | Purpose |
|----------|------|---------|
| `Generate()` | 3230 | Main generation function |
| `messageEditDone()` | 7139 | Handles edit completion |
| `messageFormatting()` | 5840 | Converts text to HTML |
| `updateMessageBlock()` | 1792 | Re-renders message |
| `setExtensionPrompt()` | 7654 | Register extension prompt |
| `getExtensionPrompt()` | 2572 | Retrieve extension prompts |
| `doChatInject()` | 4715 | Inject prompts into chat |

---

## Final Recommendations

1. **Always track generation type** if your extension modifies prompts or chat
2. **Use CHAT_COMPLETION_PROMPT_READY** for guaranteed positioning
3. **Filter out quiet and impersonate** unless you specifically need them
4. **Check dryRun** to avoid processing preview/token counting
5. **Call updateMessageBlock()** after modifying message content
6. **Clean up state** on GENERATION_ENDED to prevent leaks
7. **Test with regex scripts** enabled to ensure "Run on Edit" compatibility
8. **Defensive coding** - check for null/undefined before accessing properties

---

*Last Updated: 2025-10-07*
*Based on SillyTavern commit: b506bc8*
