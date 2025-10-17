# Auto-Save Migration Guide

## Overview

This document provides a guide for completing the migration to auto-save functionality for all prompt_manager mutation functions.

## Changes Made

### 1. Metadata Module (`src/metadata.ts`)

✅ **COMPLETED**
- Added cached metadata reference pattern
- Added `initializeMetadataModule()` to register CHAT_CHANGED listener
- Metadata cache automatically invalidates on chat change
- Called from `index.ts` initialization

### 2. Prompt Manager (`src/prompt_manager.ts`)

✅ **COMPLETED** - All mutation functions now async with auto-save:

- `deletePromptNode()` - now async, auto-saves
- `updatePromptLastUsed()` - now async, auto-saves
- `registerPrompt()` - now async, auto-saves
- `linkImageToPrompt()` - now async, auto-saves
- `unlinkImageFromPrompt()` - now async, auto-saves
- `refinePrompt()` - now async, auto-saves
- `deleteMessagePrompts()` - now async, auto-saves
- `pruneOrphanedNodes()` - now async, auto-saves
- `detectPromptsInMessage()` - now async, auto-saves

### 3. Documentation

✅ **COMPLETED**
- Created `docs/CHAT_METADATA_LIFECYCLE.md` - comprehensive guide to chatMetadata
- Updated `prompt_manager.ts` header comments
- Updated all function JSDoc examples to show `await`

## Remaining Work

### Files Requiring Updates

Based on TypeScript errors, the following files need to be updated to `await` async calls:

#### 1. Test Files

**File:** `src/prompt_manager.test.ts`
- All test cases calling mutation functions need `await`
- All test functions need to be `async`
- Example fix:
  ```typescript
  // BEFORE
  test('registers a prompt', () => {
    const node = registerPrompt('test', 1, 0, 'ai-message', metadata);
    expect(node.id).toBeDefined();
  });

  // AFTER
  test('registers a prompt', async () => {
    const node = await registerPrompt('test', 1, 0, 'ai-message', metadata);
    expect(node.id).toBeDefined();
  });
  ```

**File:** `src/image_generator.test.ts`
- Fix type error: `imageToPromptId: new Map()` should be `{}`

#### 2. Production Code

**File:** `src/manual_generation.ts`
- Line 615: `await registerPrompt()`
- Line 615: `await linkImageToPrompt()`
- Line 621: Use awaited result

**File:** `src/image_generator.ts`
- Search for all calls to mutation functions
- Add `await` and ensure calling function is `async`

**File:** `src/message_handler.ts`
- Search for `detectPromptsInMessage` calls
- Add `await`

**File:** `src/prompt_updater.ts`
- Line using `refinePrompt()` needs `await`

**File:** `src/chat_history_pruner.ts`
- Search for `pruneOrphanedNodes`, `deleteMessagePrompts`
- Add `await`

## Migration Steps

### Step 1: Fix Test Files

```bash
# Run tests to see which ones fail
npm test

# Update each test file to use async/await pattern
# Focus on prompt_manager.test.ts first
```

### Step 2: Fix Production Code

```bash
# Use TypeScript to find all errors
npx tsc --noEmit

# Fix each error by:
# 1. Adding 'await' to function calls
# 2. Making the calling function 'async' if needed
# 3. Propagating 'async' up the call chain
```

### Step 3: Search and Replace Pattern

Use this pattern to find calls that need updating:

```bash
# Find registerPrompt calls
rg "registerPrompt\(" --type ts src/

# Find linkImageToPrompt calls
rg "linkImageToPrompt\(" --type ts src/

# Find deletePromptNode calls
rg "deletePromptNode\(" --type ts src/

# Find refinePrompt calls
rg "refinePrompt\(" --type ts src/

# Find detectPromptsInMessage calls
rg "detectPromptsInMessage\(" --type ts src/
```

### Step 4: Verify Changes

```bash
# Run linter
npm run lint

# Run tests
npm test

# Run build
npm run build

# Check for any remaining TypeScript errors
npx tsc --noEmit
```

## Common Patterns

### Pattern 1: Simple Function Call

**Before:**
```typescript
function someHandler() {
  const node = registerPrompt(text, msgId, 0, 'ai-message', metadata);
  console.log(node.id);
}
```

**After:**
```typescript
async function someHandler() {
  const node = await registerPrompt(text, msgId, 0, 'ai-message', metadata);
  console.log(node.id);
}
```

### Pattern 2: Event Handler

**Before:**
```typescript
eventSource.on(EVENT_TYPE, (msgId) => {
  const nodes = detectPromptsInMessage(msgId, text, patterns, metadata);
});
```

**After:**
```typescript
eventSource.on(EVENT_TYPE, async (msgId) => {
  const nodes = await detectPromptsInMessage(msgId, text, patterns, metadata);
});
```

### Pattern 3: Loop with Mutation

**Before:**
```typescript
for (const image of images) {
  linkImageToPrompt(promptId, image.url, metadata);
}
```

**After:**
```typescript
for (const image of images) {
  await linkImageToPrompt(promptId, image.url, metadata);
}
// Or in parallel:
await Promise.all(
  images.map(image => linkImageToPrompt(promptId, image.url, metadata))
);
```

### Pattern 4: Test Case

**Before:**
```typescript
test('it works', () => {
  const node = registerPrompt('test', 1, 0, 'ai-message', metadata);
  expect(node).toBeDefined();
});
```

**After:**
```typescript
test('it works', async () => {
  const node = await registerPrompt('test', 1, 0, 'ai-message', metadata);
  expect(node).toBeDefined();
});
```

## Benefits After Migration

1. **No More Lost Data**: All metadata mutations automatically save to disk
2. **Simpler Code**: No need to remember to call `saveMetadata()` manually
3. **Type Safety**: TypeScript forces correct async usage
4. **Consistent Behavior**: All mutations follow same pattern

## Performance Considerations

### Current Implementation

The current implementation saves after EVERY mutation. For example:

```typescript
await registerPrompt(...);  // Saves
await linkImageToPrompt(...);  // Saves again
await linkImageToPrompt(...);  // Saves again
```

This results in multiple saves per operation, which may cause performance issues.

### Future Optimization (Optional)

If performance becomes an issue, consider implementing a transaction pattern:

```typescript
// Future API (not implemented yet)
await withMetadataTransaction(metadata, async (tx) => {
  await tx.registerPrompt(...);  // Doesn't save yet
  await tx.linkImageToPrompt(...);  // Doesn't save yet
  await tx.linkImageToPrompt(...);  // Doesn't save yet
  // Saves once when transaction completes
});
```

For now, the simplicity of auto-save outweighs the performance cost. We can optimize later if needed.

## Rollback Plan

If auto-save causes issues, you can rollback by:

1. Revert `prompt_manager.ts` changes (remove `async` and `await saveMetadata()`)
2. Revert `metadata.ts` changes (remove caching)
3. Manually add `await saveMetadata()` after operations in calling code

The old pattern was:
```typescript
const node = registerPrompt(...);  // Sync
await saveMetadata();  // Manual save
```

## Questions?

See `docs/CHAT_METADATA_LIFECYCLE.md` for detailed explanation of how chatMetadata works in SillyTavern.
