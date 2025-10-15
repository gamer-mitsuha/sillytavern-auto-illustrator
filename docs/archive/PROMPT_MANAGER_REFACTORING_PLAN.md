# Prompt Manager Refactoring Plan

## Objective

Refactor `prompt_metadata.ts` into a new `prompt_manager.ts` with a more robust, content-addressed design that eliminates fragility from position-based prompt tracking.

## Problem Statement

### Current Issues with `prompt_metadata.ts`

1. **Position-based fragility**: Uses `messageId_promptIndex` keys that break when users manually edit messages
2. **Flat version history**: Array-based versions don't clearly represent prompt refinement relationships
3. **Scattered logic**: Message text manipulation mixed with metadata management
4. **Hardcoded regex**: Pattern in `replacePromptAtIndex()` not using centralized `regex_v2.ts`
5. **Name collision**: `generatePromptId()` duplicated in `streaming_image_queue.ts`

### Benefits of New Design

✅ **Content-addressed**: Prompts identified by `hash(text + messageId + promptIndex)` - survives edits
✅ **Explicit tree structure**: Parent-child relationships make refinement history clear
✅ **Per-message scope**: Each prompt belongs to exactly one message (messageId field)
✅ **Bidirectional mapping**: Fast O(1) lookups for both `prompt → images` and `image → prompt`
✅ **Simpler mental model**: "A prompt generates images and can be refined into child prompts"

## Data Structure Design

### Core Interfaces

```typescript
interface PromptNode {
  id: string;  // hash(promptText + messageId + promptIndex)
  messageId: number;
  promptIndex: number;  // which occurrence in the message (0-based)
  text: string;

  // Tree structure
  parentId: string | null;
  childIds: string[];

  // Generated images
  generatedImages: string[];  // array of image URLs

  // Metadata
  metadata: {
    createdAt: number;
    lastUsedAt: number;
    feedback?: string;  // user feedback that led to this refinement
    source: 'ai-message' | 'ai-refined' | 'manual-refined';
  };
}

interface PromptRegistry {
  // Primary storage
  nodes: Record<string, PromptNode>;  // promptId → PromptNode

  // Indices for fast lookup
  imageToPromptId: Record<string, string>;  // imageUrl → promptId
  rootPromptIds: string[];  // array of root prompt IDs for enumeration
}
```

### Source Types

- `'ai-message'`: Initial prompt detected from AI's message (streaming or batch)
- `'ai-refined'`: User provided feedback, AI generated refined prompt
- `'manual-refined'`: User manually edited the prompt text

### Design Decisions

1. **Per-message scope**: Same prompt text in different messages = different nodes
2. **Prompt ID generation**: `hash(text + messageId + promptIndex)` ensures uniqueness
3. **No historical migration**: Re-detect prompts from existing messages on-demand
4. **Always re-detect**: No caching of prompt positions, always use regex to find prompts
5. **Manual cleanup**: `pruneOrphanedNodes()` triggered manually, not automatic

## Implementation Plan

### Phase 1: Core Data Structure & Utilities

**File:** `src/prompt_manager.ts`

**Important Design Note:**
- This module **does NOT** call `SillyTavern.getContext()` internally
- All functions accept `chatMetadata` directly as a parameter
- Caller is responsible for obtaining metadata via `const { chatMetadata, saveMetadata } = SillyTavern.getContext()`
- This keeps the module pure and testable

**Tasks:**
1. Define TypeScript interfaces (`PromptNode`, `PromptRegistry`)
2. Implement `generatePromptId(text: string, messageId: number, promptIndex: number): string`
   - Hash function combining all three parameters
   - Returns format: `prompt_<hash36>`
3. Implement `getRegistry(chatMetadata: ChatMetadata): PromptRegistry`
   - Gets registry from `chatMetadata.auto_illustrator.promptRegistry`
   - Initializes if not exists (mutates chatMetadata)
   - Returns the registry
4. Implement basic CRUD operations:
   - `createPromptNode(text, messageId, promptIndex, source, chatMetadata): PromptNode`
   - `getPromptNode(promptId, chatMetadata): PromptNode | null`
   - `deletePromptNode(promptId, chatMetadata): void`
   - `updatePromptLastUsed(promptId, chatMetadata): void`

**Acceptance Criteria:**
- All functions have comprehensive JSDoc comments
- Type safety enforced with TypeScript
- Logger setup with module name 'PromptManager'
- No direct calls to `SillyTavern.getContext()` within this module

### Phase 2: Prompt Registration & Image Linking

**Tasks:**
5. Implement `registerPrompt(text, messageId, promptIndex, source, chatMetadata): PromptNode`
   - Generate prompt ID
   - Check if node already exists (deduplication)
   - If exists: update `lastUsedAt` and return existing
   - If not: create new node, add to registry, add to `rootPromptIds`
6. Implement `linkImageToPrompt(promptId, imageUrl, chatMetadata): void`
   - Add imageUrl to node's `generatedImages` array
   - Update `imageToPromptId` mapping
   - Update `lastUsedAt`
7. Implement `unlinkImageFromPrompt(imageUrl, chatMetadata): boolean`
   - Remove from node's `generatedImages` array
   - Remove from `imageToPromptId` mapping
   - Returns true if image was found and removed
8. Implement `getPromptForImage(imageUrl, chatMetadata): PromptNode | null`
   - Lookup via `imageToPromptId`
   - Return full prompt node

**Acceptance Criteria:**
- Deduplication works correctly (same text + messageId + promptIndex)
- All mappings stay synchronized
- Edge cases handled (null checks, missing nodes)

### Phase 3: Tree Operations (Refinement)

**Tasks:**
9. Implement `refinePrompt(parentId, newText, feedback, source, chatMetadata): PromptNode`
   - Get parent node
   - Create child node with same `messageId` as parent
   - Set `promptIndex` = parent's promptIndex (child replaces parent logically)
   - Link parent → child (`parentId`, `childIds`)
   - Add to registry
   - **Important:** Do NOT add to `rootPromptIds` (only parents are roots)
10. Implement tree navigation utilities:
    - `getRootPrompt(promptId, chatMetadata): PromptNode | null`
      - Walk up `parentId` chain until `parentId === null`
    - `getPromptChain(promptId, chatMetadata): PromptNode[]`
      - Get all nodes from root to current (inclusive)
      - Ordered: [root, ..., current]
    - `getChildPrompts(promptId, chatMetadata): PromptNode[]`
      - Get direct children only
    - `getPromptTree(promptId, chatMetadata): PromptNode[]`
      - Get entire subtree (DFS traversal)

**Acceptance Criteria:**
- Tree structure correctly maintained
- Navigation functions handle cycles gracefully (shouldn't happen, but defensive)
- Child inherits `messageId` from parent

### Phase 4: Query & Cleanup

**Tasks:**
11. Implement `getPromptsForMessage(messageId, chatMetadata): PromptNode[]`
    - Filter all nodes by `messageId`
    - Return array sorted by `promptIndex`
12. Implement `deleteMessagePrompts(messageId, chatMetadata): number`
    - Get all prompts for message
    - Delete each node (including cleaning up mappings)
    - Remove from `rootPromptIds`
    - Clean up parent/child relationships
    - Return count of deleted nodes
13. Implement `pruneOrphanedNodes(chatMetadata): number`
    - Find nodes with `generatedImages.length === 0` AND `childIds.length === 0`
    - Delete these nodes
    - Update parent's `childIds` if orphan had parent
    - Return count of pruned nodes
14. Implement `getAllRootPrompts(chatMetadata): PromptNode[]`
    - Return all nodes whose IDs are in `rootPromptIds`
15. Implement `getPromptStats(chatMetadata): {totalNodes, totalImages, totalTrees}`
    - Aggregate statistics for debugging/monitoring

**Acceptance Criteria:**
- Cleanup operations maintain data integrity
- No dangling references after deletion
- Statistics accurate

### Phase 5: Message Text Integration

**Note:** These functions need access to full chat messages, so they accept additional parameters.

**Tasks:**
16. Implement `detectPromptsInMessage(messageId, messageText, chatMetadata): PromptNode[]`
    - Use `extractImagePromptsMultiPattern()` from `regex_v2.ts`
    - Use `DEFAULT_PROMPT_DETECTION_PATTERNS` from `constants.ts`
    - For each detected prompt:
      - Register with source `'ai-message'`
      - Return array of created/existing nodes
17. Implement `updatePromptTextInMessage(promptId, messageText, newText, chatMetadata): string`
    - Get prompt node to find `promptIndex`
    - Use regex to replace the `promptIndex`-th occurrence in messageText
    - Use `regex_v2.ts` utilities for text replacement
    - Update prompt node's `text` field in metadata
    - **Return the updated message text** (caller is responsible for saving)

**Important:**
- `updatePromptTextInMessage()` does NOT save the chat
- Caller must save via `saveMetadata()` after calling this function
- This keeps the module free from side effects

**Acceptance Criteria:**
- Uses centralized regex patterns from `regex_v2.ts`
- Correctly updates Nth occurrence of prompt in message
- Handles escaped quotes properly
- No direct chat saving in this module

### Phase 6: Comprehensive Tests

**File:** `src/prompt_manager.test.ts`

**Test Suites:**

1. **Prompt ID Generation**
   - Same inputs produce same ID
   - Different promptIndex produces different ID
   - Different messageId produces different ID
   - Hash collision resistance (test with similar strings)

2. **CRUD Operations**
   - Create prompt node
   - Get existing node
   - Get non-existent node returns null
   - Delete node removes from registry
   - Update lastUsedAt timestamp

3. **Registration & Deduplication**
   - Register new prompt
   - Register duplicate returns existing
   - Multiple prompts in same message get different IDs
   - Duplicate text across messages get different nodes

4. **Image Linking**
   - Link image to prompt
   - Link multiple images to same prompt
   - Get prompt for image
   - Unlink image
   - Unlink non-existent image returns false

5. **Tree Operations**
   - Refine prompt creates child
   - Parent-child relationship correct
   - Get root from deep child
   - Get prompt chain
   - Get children
   - Multiple levels of refinement

6. **Query Operations**
   - Get all prompts for message
   - Get prompts sorted by promptIndex
   - Empty message returns empty array
   - Get all root prompts

7. **Cleanup Operations**
   - Delete message deletes all prompts
   - Prune removes nodes with no images and no children
   - Prune preserves nodes with children
   - Cleanup maintains parent/child integrity

8. **Message Text Integration**
   - Detect prompts in message text
   - Handle multiple prompts
   - Handle escaped quotes in prompts
   - Update prompt text in message (Nth occurrence)

9. **Edge Cases**
   - Empty prompt text
   - Very long prompt text
   - Special characters in prompt
   - Malformed prompt tags
   - Non-existent message ID
   - Concurrent modifications

**Coverage Target:** 95%+ line coverage

### Phase 7: Integration with Existing Code

**Note:** This phase is tracked separately but documented here for completeness.

**Files to Update:**

1. **`streaming_monitor.ts`**
   - Replace `recordPrompt()` → `registerPrompt()`
   - Replace `initializePromptPosition()` → (no longer needed, done in `registerPrompt`)
   - Use `detectPromptsInMessage()` for batch detection

2. **`image_generator.ts`**
   - Replace prompt metadata calls with new API
   - Use `linkImageToPrompt()` after generation
   - Use `getPromptForImage()` when needed

3. **`manual_generation.ts`**
   - Use `getPromptForImage()` for regeneration
   - Use `refinePrompt()` for prompt updates
   - Use `linkImageToPrompt()` for new generations

4. **`prompt_updater.ts`**
   - Use `getPromptForImage()` to get current prompt
   - Use `refinePrompt()` to create refined version
   - Simplified flow with new API

5. **`streaming_image_queue.ts`**
   - Rename local `generatePromptId()` to avoid collision
   - Or remove if can use prompt manager's version

6. **Remove `prompt_metadata.ts`**
   - After all migrations complete
   - Ensure no remaining imports

### Phase 8: Documentation

**Tasks:**
1. Update `DEVELOPMENT.md` with new prompt manager API
2. Add examples of common operations
3. Document tree structure and refinement workflow
4. Add diagrams for typical flows
5. Document cleanup/maintenance procedures

## API Reference

**Important:** All functions accept `chatMetadata` directly. Caller obtains it via:
```typescript
const { chatMetadata, saveMetadata } = SillyTavern.getContext();
```

### Core Operations

```typescript
// Registration
function registerPrompt(
  text: string,
  messageId: number,
  promptIndex: number,
  source: PromptSource,
  chatMetadata: ChatMetadata
): PromptNode;

// Image linking
function linkImageToPrompt(
  promptId: string,
  imageUrl: string,
  chatMetadata: ChatMetadata
): void;

function unlinkImageFromPrompt(
  imageUrl: string,
  chatMetadata: ChatMetadata
): boolean;

function getPromptForImage(
  imageUrl: string,
  chatMetadata: ChatMetadata
): PromptNode | null;

// Refinement
function refinePrompt(
  parentId: string,
  newText: string,
  feedback: string,
  source: 'ai-refined' | 'manual-refined',
  chatMetadata: ChatMetadata
): PromptNode;

// Tree navigation
function getRootPrompt(
  promptId: string,
  chatMetadata: ChatMetadata
): PromptNode | null;

function getPromptChain(
  promptId: string,
  chatMetadata: ChatMetadata
): PromptNode[];

function getChildPrompts(
  promptId: string,
  chatMetadata: ChatMetadata
): PromptNode[];

// Query
function getPromptsForMessage(
  messageId: number,
  chatMetadata: ChatMetadata
): PromptNode[];

function getAllRootPrompts(
  chatMetadata: ChatMetadata
): PromptNode[];

// Cleanup
function deleteMessagePrompts(
  messageId: number,
  chatMetadata: ChatMetadata
): number;

function pruneOrphanedNodes(
  chatMetadata: ChatMetadata
): number;

// Message integration
function detectPromptsInMessage(
  messageId: number,
  messageText: string,
  chatMetadata: ChatMetadata
): PromptNode[];

function updatePromptTextInMessage(
  promptId: string,
  messageText: string,
  newText: string,
  chatMetadata: ChatMetadata
): string;  // Returns updated message text
```

## Usage Examples

### Example 1: Batch Image Generation

```typescript
// Get metadata
const { chatMetadata } = SillyTavern.getContext();

// Detect all prompts in a message
const messageId = 42;
const message = context.chat[messageId];
const prompts = detectPromptsInMessage(messageId, message.mes, chatMetadata);

// Generate images for each prompt
for (const promptNode of prompts) {
  const imageUrl = await generateImage(promptNode.text);
  linkImageToPrompt(promptNode.id, imageUrl, chatMetadata);
}
```

### Example 2: Streaming Detection

```typescript
// Get metadata
const { chatMetadata } = SillyTavern.getContext();

// During streaming, poll for new prompts
const messageId = getCurrentMessageId();
const currentText = getCurrentStreamingText();
const detectedPrompts = detectPromptsInMessage(messageId, currentText, chatMetadata);

// For each new prompt, schedule generation
for (const promptNode of detectedPrompts) {
  if (promptNode.generatedImages.length === 0) {
    scheduleImageGeneration(promptNode.id, promptNode.text);
  }
}
```

### Example 3: Prompt Refinement

```typescript
// Get metadata
const { chatMetadata, saveMetadata } = SillyTavern.getContext();

// User clicks image to refine
const imageUrl = getClickedImageUrl();
const promptNode = getPromptForImage(imageUrl, chatMetadata);

if (promptNode) {
  // Get feedback from user
  const feedback = await getUserFeedback();

  // Generate refined prompt with LLM
  const refinedText = await generateRefinedPrompt(promptNode.text, feedback);

  // Create child node
  const childNode = refinePrompt(
    promptNode.id,
    refinedText,
    feedback,
    'ai-refined',
    chatMetadata
  );

  // Generate image with refined prompt
  const newImageUrl = await generateImage(childNode.text);
  linkImageToPrompt(childNode.id, newImageUrl, chatMetadata);

  // Save metadata after modifications
  await saveMetadata();
}
```

### Example 4: Cleanup

```typescript
// Get metadata
const { chatMetadata, saveMetadata } = SillyTavern.getContext();

// When user deletes a message
function onMessageDeleted(messageId: number) {
  const deletedCount = deleteMessagePrompts(messageId, chatMetadata);
  logger.info(`Deleted ${deletedCount} prompt nodes for message ${messageId}`);
  await saveMetadata();
}

// Manual cleanup of orphaned nodes
function cleanupOrphans() {
  const prunedCount = pruneOrphanedNodes(chatMetadata);
  toastr.info(`Pruned ${prunedCount} orphaned prompt nodes`);
  await saveMetadata();
}
```

## Migration Strategy

### No Automatic Migration

We will **not** migrate historical data from old `prompt_metadata.ts` format because:
1. Prompt version history is not critical for extension functionality
2. Prompts can always be re-detected from message text
3. Simplifies implementation and reduces risk

### Handling Existing Chats

When a chat is loaded:
1. Old metadata structure remains in `chat_metadata.auto_illustrator`
2. New `promptRegistry` is initialized empty
3. As user interacts (generates images, refines prompts):
   - Prompts are detected and registered on-demand
   - New structure is populated gradually
4. Old metadata can be manually cleaned up later (optional)

### Coexistence Period

Both old and new structures can coexist:
```typescript
interface AutoIllustratorChatMetadata {
  // Old structure (deprecated, read-only)
  imageUrlToPromptId?: Record<string, string>;
  promptIdToText?: Record<string, string>;
  promptPositionHistory?: Record<string, PromptPositionHistory>;

  // New structure
  promptRegistry?: PromptRegistry;
}
```

## Testing Strategy

### Unit Tests
- Each function has dedicated test cases
- Edge cases and error conditions covered
- Mock `chatMetadata` objects for isolation (no dependency on SillyTavern context)

### Integration Tests
- Test complete workflows (batch generation, refinement, cleanup)
- Test with realistic message content
- Test with multiple concurrent operations

### Manual Testing Checklist
- [ ] Batch generation in existing chat
- [ ] Streaming generation with new chat
- [ ] Click-to-regenerate with existing images
- [ ] Prompt refinement workflow
- [ ] Message deletion cleanup
- [ ] Manual orphan pruning
- [ ] Switch between chats (verify no cross-contamination)
- [ ] Very long prompts (>500 chars)
- [ ] Special characters and escaped quotes
- [ ] Multiple prompts in same message

## Success Criteria

1. ✅ All unit tests pass (95%+ coverage)
2. ✅ All integration tests pass
3. ✅ Manual testing checklist completed
4. ✅ No regressions in existing functionality
5. ✅ Performance: No noticeable slowdown in prompt detection or generation
6. ✅ Code quality: Passes linter and formatter
7. ✅ Documentation: API fully documented with examples

## Risks & Mitigations

### Risk 1: Hash Collisions
**Impact:** Different prompts get same ID
**Mitigation:** Use quality hash function, include timestamp if needed, add collision detection

### Risk 2: Large Registry Size
**Impact:** Chat metadata grows too large
**Mitigation:** Implement `pruneOrphanedNodes()`, consider max tree depth limit

### Risk 3: Breaking Changes
**Impact:** Users lose prompt history
**Mitigation:** Acceptable - history not critical, can re-detect prompts

### Risk 4: Performance with Many Prompts
**Impact:** Slow operations with hundreds of prompts
**Mitigation:** Use Record for O(1) lookups, limit tree traversal depth

## Timeline Estimate

- **Phase 1-2:** 4-6 hours (core structure + registration)
- **Phase 3-4:** 3-4 hours (tree operations + cleanup)
- **Phase 5:** 2-3 hours (message integration)
- **Phase 6:** 6-8 hours (comprehensive tests)
- **Phase 7:** 4-6 hours (integration with existing code)
- **Phase 8:** 2-3 hours (documentation)

**Total:** ~21-30 hours of development time

## Future Enhancements

Potential improvements for later versions:

1. **Prompt Templates:** Save frequently-used prompts as templates
2. **Prompt Forking:** Create multiple refinement branches from same parent
3. **Prompt Search:** Full-text search across all prompts
4. **Export/Import:** Share prompt trees between chats
5. **Analytics:** Track which prompts generate best images
6. **Undo/Redo:** Revert to previous prompt versions
7. **Prompt Diff View:** Show changes between parent and child

## References

- Original issue: `prompt_metadata.ts` fragility with position-based keys
- Related: `regex_v2.ts` centralized regex patterns
- PRD: [docs/PRD.md](../docs/PRD.md)
