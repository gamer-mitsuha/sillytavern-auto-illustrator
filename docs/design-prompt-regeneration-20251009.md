# Design Document: Prompt Regeneration Feature

**Date:** 2025-10-09
**Issue:** #14
**Author:** Implementation based on user requirements
**Status:** Approved for Implementation

## Overview

Enable users to update image generation prompts using LLM feedback without changing story text. Store complete prompt history with clear distinction between prompt strings, prompt IDs, prompt positions, and images.

## Problem Statement

Users need to refine generated images by updating prompts based on issues like:
- Bad anatomy or proportions
- Incorrect character details
- Irrelevant background objects
- Composition problems

Currently, fixing these issues requires:
1. Manually editing the story text to change prompts
2. Losing the original prompt
3. No history of what was tried

## Goals

1. Allow prompt updates via LLM feedback without text modification
2. Preserve complete prompt history per position
3. Enable image regeneration with updated prompts
4. Maintain data integrity across chat saves/loads
5. Prevent conflicts with ongoing generation operations

## Non-Goals

- Real-time prompt preview
- Batch prompt updates across multiple positions
- Prompt template library
- Advanced version control UI (basic history only)

## Core Concepts

### Data Model Distinctions

**Prompt String**: Actual text content
```
"1girl, long hair, blue eyes, school uniform"
```

**Prompt ID**: Unique identifier for a prompt string (immutable)
```
"prompt_abc123def"
```

**Prompt Position**: Location in chat (can have different strings over time)
```typescript
{messageId: 42, promptIndex: 0}
```

**Image**: Generated artifact with one promptId (immutable)
```
URL: "https://..." → promptId: "prompt_abc123def"
```

### Data Flow

```
Initial State:
  Position {42, 0} → PromptID "v1" → String "1girl, ..."
  Image "url1" → PromptID "v1"

After Update:
  Position {42, 0} → PromptID "v2" → String "1girl, detailed hands, ..."
  Image "url1" → PromptID "v1" (unchanged)
  New Image "url2" → PromptID "v2"
```

## Data Structures

### TypeScript Types

```typescript
/**
 * Immutable position identifier for a prompt in chat
 */
export interface PromptPosition {
  readonly messageId: number;
  readonly promptIndex: number;
}

/**
 * Metadata for a single prompt version
 */
export interface PromptVersionMetadata {
  /** Unique identifier for this prompt string */
  promptId: string;

  /** User feedback that led to this version (empty string for original) */
  feedback: string;

  /** When this version was created */
  timestamp: number;
}

/**
 * History of prompt versions at a specific position in chat
 */
export interface PromptPositionHistory {
  /** Chronological list of prompt versions */
  versions: PromptVersionMetadata[];
}

/**
 * Auto-illustrator metadata stored per-chat
 */
export interface AutoIllustratorChatMetadata {
  /** Maps image URL to the prompt ID used to generate it */
  imageUrlToPromptId: Record<string, string>;

  /** Maps prompt ID to actual prompt text (de-duplicated storage) */
  promptIdToText: Record<string, string>;

  /** Maps prompt position key to version history */
  promptPositionHistory: Record<string, PromptPositionHistory>;
}
```

### Storage Design

**Location**: `context.chat_metadata.auto_illustrator`

**Rationale for Record<string, T>**:
- Must be JSON-serializable (SillyTavern requirement)
- No additional dependencies (Immutable.js would add complexity)
- TypeScript standard pattern with helper functions
- Easy to debug in saved chat files

**Helper Functions**:
```typescript
function createPositionKey(position: PromptPosition): string
function parsePositionKey(key: string): PromptPosition
```

### Example Data

```json
{
  "imageUrlToPromptId": {
    "https://example.com/img1.png": "prompt_abc123"
  },

  "promptIdToText": {
    "prompt_abc123": "1girl, long hair, blue eyes",
    "prompt_def456": "1girl, long hair, blue eyes, detailed hands"
  },

  "promptPositionHistory": {
    "42_0": {
      "versions": [
        {
          "promptId": "prompt_abc123",
          "feedback": "",
          "timestamp": 1696800000000
        },
        {
          "promptId": "prompt_def456",
          "feedback": "fix hand anatomy",
          "timestamp": 1696800120000
        }
      ]
    }
  }
}
```

## Architecture

### Component Diagram

```
User Action (Click Image)
    ↓
showRegenerationDialog() → "Update Prompt" button
    ↓
showPromptUpdateDialog()
    ↓
updatePromptForPosition()
    ├─→ getCurrentPromptId() (from metadata)
    ├─→ generateQuietPrompt() (LLM call)
    ├─→ extractUpdatedPrompt()
    ├─→ recordPrompt()
    └─→ addPromptVersion()
        ├─→ Update metadata history
        ├─→ Update message text
        └─→ saveChat()
    ↓
regenerateWithPrompt()
    └─→ recordImagePrompt() (new image → promptId)
```

### Key Functions

**Metadata Management** (`prompt_metadata.ts`):
- `getMetadata()` - Get/initialize chat metadata
- `recordPrompt()` - De-duplicate and store prompt strings
- `recordImagePrompt()` - Link images to prompts
- `initializePromptPosition()` - Create initial history (during detection)
- `addPromptVersion()` - Add version + update message text
- `getCurrentPromptId()` - Get latest prompt at position
- Helper functions for PromptPosition

**LLM Integration** (`prompt_updater.ts`):
- `updatePromptForPosition()` - Main update orchestrator
- `extractUpdatedPrompt()` - Parse LLM response

**UI** (`manual_generation.ts`):
- `showPromptUpdateDialog()` - Feedback input UI
- Integration with existing `showRegenerationDialog()`

### LLM Prompt Template

File: `src/presets/prompt_update.md`

```markdown
You are helping to update an image generation prompt based on user feedback.

**Current Image Prompt:**
<!--img-prompt="{{{currentPrompt}}}"-->

**User Feedback:**
{{{userFeedback}}}

**Instructions:**
- Update the prompt to address the user's feedback
- Maintain the comma-separated tag format
- Keep relevant existing tags that aren't being changed
- Output ONLY the updated prompt in the exact same HTML comment format

**Example output format:**
<!--img-prompt="your updated tags here"-->

**Output the updated prompt below:**
```

**Rationale**: Explicitly shows LLM the `<!--img-prompt="...">` format for easier extraction.

## User Flow

1. **User clicks generated image**
   - `showRegenerationDialog()` displays options

2. **User selects "Update Prompt with AI"**
   - `showPromptUpdateDialog()` opens
   - Displays current prompt (read-only)
   - Provides feedback textarea

3. **User enters feedback** (e.g., "fix bad anatomy")
   - Clicks "Update & Regenerate"

4. **System updates prompt**
   - Calls `updatePromptForPosition()`
   - LLM generates updated prompt
   - Metadata updated with new version
   - Message text updated with new prompt
   - Chat saved

5. **System regenerates image**
   - Uses new prompt automatically
   - Links new image to new promptId

## Safety & Constraints

### Mutual Exclusion

**Global State Flags**:
```typescript
isGenerationInProgress: boolean
isUpdatingPrompt: boolean
```

**Rules**:
- Cannot update prompt during generation
- Cannot generate during prompt update
- Cannot update same prompt concurrently

**Error Messages**:
- "Cannot update prompt while images are generating"
- "Cannot generate images while updating prompt"
- "A prompt update is already in progress"

### Data Integrity

1. **Initialization Timing**: `initializePromptPosition()` called during prompt detection (not generation)
2. **Message Text Sync**: `addPromptVersion()` updates both metadata and message text atomically
3. **Image Immutability**: Once generated, image→promptId mapping never changes
4. **De-duplication**: Prompt strings stored once via ID system

## Testing Strategy

### Unit Tests

**prompt_metadata.test.ts**:
- Metadata initialization
- Prompt de-duplication via IDs
- Position history tracking
- Image-prompt associations
- Message text updates
- Helper functions (createPositionKey, parsePositionKey)

**prompt_updater.test.ts**:
- Mock LLM responses
- Prompt extraction from HTML comments
- Error handling (no LLM, extraction failure)
- Metadata updates after successful update
- Message text updates via addPromptVersion

**manual_generation.test.ts** (updates):
- Dialog creation and interaction
- LLM update flow integration
- Regeneration with updated prompt
- Error handling in UI

**Mutual exclusion tests**:
- Block generation during update
- Block update during generation
- Block concurrent updates
- State cleanup on error

### Integration Points to Verify

1. Prompt detection initializes metadata
2. Image generation records image-prompt links
3. Metadata persists across chat save/load
4. Queue system respects blocking flags

## Implementation Phases

### Phase 1: Metadata Storage System
**Files**: `src/types.ts`, `src/prompt_metadata.ts` (new)
**Tests**: `src/prompt_metadata.test.ts` (new)
**Commit**: `feat(metadata): implement prompt history storage system`

### Phase 2: LLM Prompt Updater
**Files**: `src/presets/prompt_update.md` (new), `src/prompt_updater.ts` (new)
**Tests**: `src/prompt_updater.test.ts` (new)
**Commit**: `feat(updater): implement LLM-based prompt updater`

### Phase 3: Integration with Prompt Detection
**Files**: `src/queue_processor.ts` (or relevant), `src/image_generator.ts`
**Tests**: Update existing tests
**Commit**: `feat(integration): track prompts during detection and generation`

### Phase 4: UI - Prompt Update Dialog
**Files**: `src/manual_generation.ts`
**Tests**: `src/manual_generation.test.ts`
**Commit**: `feat(ui): integrate prompt update dialog with regeneration flow`

### Phase 5: Operation Blocking & Safety
**Files**: `src/index.ts`, `src/prompt_updater.ts`, `src/queue_processor.ts`, `src/manual_generation.ts`
**Tests**: New mutual exclusion tests
**Commit**: `feat(safety): add mutual exclusion between updates and generation`

### Phase 6: i18n & Styling
**Files**: `i18n/en-us.json`, `i18n/zh-cn.json`, `src/style.css`
**Commit**: `feat(ui): add prompt update dialog styling and translations`

### Phase 7: Documentation
**Files**: `CHANGELOG.md`, `README.md`
**Commit**: `docs: add prompt regeneration feature documentation`

## Open Questions & Decisions

### ✅ Resolved

**Q**: Use PromptVersionMetadata list vs parallel arrays?
**A**: List of objects - single source of truth, more maintainable

**Q**: How to handle composite keys for positions?
**A**: Record<string, T> with PromptPosition type + helpers (JSON-serializable)

**Q**: When to initialize prompt position history?
**A**: During prompt detection, not image generation

**Q**: Should addPromptVersion update message text?
**A**: Yes, atomically with metadata update

**Q**: LLM output format?
**A**: Explicit `<!--img-prompt="...">` format in template

**Q**: Use existing hash function?
**A**: TODO - check codebase for existing utility, use if available

### 🔍 To Investigate During Implementation

1. **Exact location of prompt detection code** - likely in queue processor or message scanner
2. **Existing hash/ID generation utilities** - search for reusable functions
3. **Existing regeneration function signature** - ensure compatibility with `regenerateWithPrompt()`

## Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|------------|
| Metadata corruption | High | Atomic updates, validation, comprehensive tests |
| LLM extraction failure | Medium | Fallback error handling, clear format specification |
| Message text desync | High | Single update point (addPromptVersion), tests |
| Concurrent operation conflicts | Medium | Mutual exclusion flags, error messages |
| Large metadata size | Low | De-duplication via IDs, position-based tracking |

## Success Metrics

- ✅ Users can update prompts without editing text
- ✅ All prompt versions preserved with feedback
- ✅ No data loss across chat save/load
- ✅ No crashes from concurrent operations
- ✅ All tests passing (unit + integration)
- ✅ Documentation complete and accurate

## Future Enhancements (Out of Scope)

1. **Prompt history viewer UI** - Show all versions in timeline
2. **Revert to previous version** - Select from history
3. **Batch updates** - Update multiple prompts at once
4. **Prompt templates/presets** - Save common modifications
5. **A/B comparison view** - Compare before/after images side-by-side
6. **Export prompt history** - Download as JSON/CSV

## References

- Issue #14: https://github.com/user/repo/issues/14
- SillyTavern Extension Docs: https://docs.sillytavern.app/for-contributors/writing-extensions/
- SillyTavern State Management: https://docs.sillytavern.app/for-contributors/writing-extensions/#state-management
- Conventional Commits: https://www.conventionalcommits.org/
