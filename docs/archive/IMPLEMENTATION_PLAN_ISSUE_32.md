# Implementation Plan for Issue #32: Separate LLM Call for Image Prompt Generation

**Issue**: https://github.com/gamer-mitsuha/sillytavern-auto-illustrator/issues/32
**Status**: In Progress
**Created**: 2025-10-15
**Implementation Approach**: Simplified (leverage existing pipeline)

## Overview

Currently, the extension extracts image prompts from the AI's streaming text response using regex patterns like `<!--img-prompt="...">`. This means the AI must generate these prompts inline with its normal text response, which can influence/constrain the text generation quality.

This implementation adds a **separate LLM call** to generate image prompts independently after text response completes, avoiding interference with the main text response generation.

## Key Requirements

1. **Chat history pruning**: When LLM-based prompt generation is enabled, prune the LLM-generated prompt tags from chat history to prevent pollution of future LLM conversations
2. **Preserve prompt tags in messages**: The prompt text tags must still exist in the message HTML/text for other features (regeneration, gallery, etc.) to function
3. **Unit tests mandatory**: Tests are required for all new functionality
4. **Context-based positioning**: Use surrounding text snippets (insertAfter/insertBefore) instead of byte offsets for insertion point location

## Architecture Insight

The extension already handles "non-streaming messages" in [message_handler.ts:84-108](../src/message_handler.ts) which:
1. Starts a fake streaming session
2. Immediately finalizes to process all prompts at once
3. Gets all features (concurrency, progress, gallery) for free

**We just need to inject an LLM prompt generation step BEFORE this existing pipeline!**

## Implementation Design

### Dual-Mode Architecture

**Mode 1: Regex-based** (current, default)
- AI embeds `<!--img-prompt="..."-->` in response
- Extension extracts via regex
- Prompt tags remain in message
- Chat history pruner removes images only

**Mode 2: LLM-based** (new, opt-in)
- AI responds with clean text (no prompt tags)
- Extension calls separate LLM to generate prompts
- Extension inserts prompt tags into message HTML using context matching
- Chat history pruner removes BOTH images AND prompt tags

### Context-Based Insertion Strategy

Instead of byte offsets, use surrounding text context:

**LLM Output Format:**
```json
{
  "prompts": [
    {
      "text": "1girl, long silver hair, forest, sunset",
      "insertAfter": "walked through the forest",
      "insertBefore": "under the moonlight"
    }
  ]
}
```

**Advantages:**
- ✅ LLMs are good at extracting text context
- ✅ Robust to text encoding issues
- ✅ More intuitive for LLM to understand
- ✅ Easier to debug (human-readable)

## File Changes

### New Files (6)

1. **`src/services/prompt_generation_service.ts`**
   - Calls LLM with message text to generate prompts
   - Uses `context.generateRaw()` API (same as prompt_updater.ts)
   - Parses JSON response with validation
   - Returns structured prompt list

2. **`src/prompt_insertion.ts`**
   - Implements context-based insertion algorithm
   - Finds unique match of insertAfter + insertBefore
   - Inserts prompt tags at correct positions
   - Logs warnings for failed matches

3. **`src/presets/prompt_generation.md`**
   - Meta-prompt template for LLM
   - Instructs LLM to analyze text and suggest prompts
   - Specifies JSON output format with context
   - Includes tag-based prompt guidelines

4. **`src/services/prompt_generation_service.test.ts`**
   - Unit tests for LLM call and parsing
   - Tests error handling and validation
   - Tests maxPromptsPerMessage limit

5. **`src/prompt_insertion.test.ts`**
   - Unit tests for context matching
   - Tests single/multiple prompt insertion
   - Tests edge cases (no match, multiple matches)

6. **`docs/IMPLEMENTATION_PLAN_ISSUE_32.md`**
   - This document

### Modified Files (7)

1. **`src/message_handler.ts`**
   - Add LLM generation step before existing pipeline
   - Check `promptGenerationMode` setting
   - Call `generatePromptsForMessage()`
   - Call `insertPromptTagsWithContext()`
   - Save updated message
   - Proceed with existing detection/generation

2. **`src/chat_history_pruner.ts`**
   - Add `pruneGeneratedImagesAndPrompts()` function
   - Remove BOTH prompt tags and images
   - Used when `promptGenerationMode === 'llm-post'`

3. **`src/chat_history_pruner.test.ts`**
   - Add tests for new pruning function
   - Verify prompt tags are removed in LLM mode
   - Verify prompt tags are kept in regex mode

4. **`src/index.ts`**
   - Modify CHAT_COMPLETION_PROMPT_READY handler
   - Check `promptGenerationMode` setting
   - Call appropriate pruning function

5. **`src/settings.ts`** + UI HTML
   - Add `promptGenerationMode: 'regex' | 'llm-post'`
   - Add `maxPromptsPerMessage: number`
   - Add UI controls (radio buttons, number input)

6. **`docs/PRD.md`**
   - Add new section "13. Prompt Generation Modes"
   - Document requirements and examples
   - Document anti-patterns

7. **`CHANGELOG.md`**
   - Add entry for new feature

### Documentation Updates (2)

1. **`CLAUDE.md`**
   - Remove TDD requirement section
   - Replace with "Unit Tests are Mandatory"

2. **`~/.claude/CLAUDE.md`**
   - Same changes as CLAUDE.md

## Implementation Steps

### Phase 1: Core Files (New)

#### Step 1: Create prompt_insertion.ts
**Priority**: HIGH (no dependencies, easy to test)

```typescript
/**
 * Inserts prompt tags into message using context snippets
 * @returns {updatedText, insertedCount, failedSuggestions}
 */
export function insertPromptTagsWithContext(
  messageText: string,
  prompts: Array<{text: string; insertAfter: string; insertBefore: string}>,
  tagTemplate: string
): {
  updatedText: string;
  insertedCount: number;
  failedSuggestions: Array<{text: string; insertAfter: string; insertBefore: string}>;
}
```

#### Step 2: Create prompt_generation_service.ts
**Priority**: HIGH (core functionality)

```typescript
/**
 * Generates image prompts using separate LLM call
 */
export async function generatePromptsForMessage(
  messageText: string,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<Array<{text: string; insertAfter: string; insertBefore: string}>>
```

#### Step 3: Create presets/prompt_generation.md
**Priority**: MEDIUM (needed for LLM call)

Meta-prompt template with JSON output format and guidelines.

### Phase 2: Integrate with Existing Code

#### Step 4: Update settings.ts
**Priority**: HIGH (needed for mode switching)

Add new settings fields and UI controls.

#### Step 5: Enhance chat_history_pruner.ts
**Priority**: HIGH (critical for clean history)

Add `pruneGeneratedImagesAndPrompts()` function.

#### Step 6: Modify message_handler.ts
**Priority**: HIGH (main integration point)

Add LLM generation step before existing pipeline.

#### Step 7: Modify index.ts
**Priority**: HIGH (pruning logic)

Update CHAT_COMPLETION_PROMPT_READY handler.

### Phase 3: Tests

#### Step 8: Write unit tests
**Priority**: HIGH (mandatory before commit)

- `prompt_insertion.test.ts`
- `prompt_generation_service.test.ts`
- Enhance `chat_history_pruner.test.ts`

### Phase 4: Documentation

#### Step 9: Update documentation
**Priority**: MEDIUM (before PR)

- Update PRD
- Update CHANGELOG
- Update CLAUDE.md files

### Phase 5: Quality Checks

#### Step 10: Pre-commit checks
**Priority**: CRITICAL (mandatory)

```bash
npm run format
npm run lint
npm test
npm run build
```

### Phase 6: Commit & PR

#### Step 11: Commit and push
```bash
git add .
git commit -m "feat(prompts): add LLM-based prompt generation with context matching (#32)"
git push origin feat/separate-llm-prompt-generation
```

#### Step 12: Create pull request

## Testing Plan

### Unit Tests (Automated)

**prompt_insertion.test.ts:**
- Insert single prompt with unique context
- Insert multiple prompts in correct positions
- Skip prompts with non-matching context
- Handle overlapping context gracefully
- Use first match when context appears multiple times
- Edge case: insertion at message start/end

**prompt_generation_service.test.ts:**
- Parse valid LLM JSON response
- Handle malformed JSON gracefully
- Respect maxPromptsPerMessage limit
- Return empty array on API error
- Validate required fields exist

**chat_history_pruner.test.ts:**
- Remove both prompt tags and images (LLM mode)
- Keep prompt tags, remove images only (regex mode)
- Preserve user messages unchanged
- Handle multiple prompt tags in single message

### Integration Tests (Manual)

- Test with NovelAI, OpenAI, Claude APIs
- Measure token usage (log API call sizes)
- Compare prompt quality: regex vs LLM-generated
- Test mode switching (regex ↔ llm-post)
- Verify chat history correctness
- Test regeneration feature compatibility
- Test gallery widget compatibility
- Test manual generation compatibility

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM call fails | No images | Log error, show toast, skip generation |
| Malformed JSON | Parse error | Try-catch, validation, return empty array |
| Context matching fails | Wrong/no insertion | Validate uniqueness, log warnings, skip invalid |
| Increased token cost | User surprise | Opt-in, clear UI warning, maxPrompts limit |
| Breaking features | Regression | Preserve prompts in HTML, comprehensive testing |

## Success Criteria

✅ LLM mode generates prompts without embedding in main response
✅ Prompt tags inserted correctly using context matching
✅ Chat history clean (no prompt tags sent to future AI calls)
✅ Prompt tags preserved in message HTML (features work)
✅ All existing features work (regeneration, gallery, manual gen)
✅ All tests pass (unit + manual integration)
✅ Documentation complete (PRD, CHANGELOG)
✅ Code quality checks pass (format, lint, test, build)

## Timeline Estimate

- Phase 1 (Core files): 2-3 hours
- Phase 2 (Integration): 2-3 hours
- Phase 3 (Tests): 2-3 hours
- Phase 4 (Documentation): 1-2 hours
- Phase 5 (Quality): 1 hour
- Phase 6 (PR): 30 minutes

**Total**: ~8-13 hours of focused work

## References

- Issue #32: https://github.com/gamer-mitsuha/sillytavern-auto-illustrator/issues/32
- Similar pattern: `src/prompt_updater.ts` (uses generateRaw for LLM calls)
- Existing pipeline: `src/message_handler.ts:84-108`
- Existing pruning: `src/chat_history_pruner.ts:25`
