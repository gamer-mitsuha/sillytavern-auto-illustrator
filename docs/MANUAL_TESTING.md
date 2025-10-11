# Manual Testing Checklist for Feature Branch Merges

This document provides a concise checklist of critical manual tests that must be performed before merging major feature branches to `main`. These tests complement automated unit/integration tests and verify real-world functionality in the SillyTavern environment.

## Pre-Merge Requirements

Before starting manual testing:
- ✅ All automated tests pass (`npm test`)
- ✅ Linter passes (`npm run fix`)
- ✅ Build succeeds (`npm run build`)
- ✅ Extension loaded in SillyTavern without errors

## Core Feature Tests

### 1. Streaming Mode Image Generation

**Purpose**: Verify images generate during AI streaming and insert correctly after completion.

**Steps**:
1. Start a new chat with streaming enabled
2. Send a message that triggers streaming response containing image prompts
3. **Verify**: Progress widget appears and updates in real-time (e.g., 0/2 → 1/2 → 2/2)
4. **Verify**: Images generate during streaming (check console for generation logs)
5. **Verify**: Images insert correctly after `MESSAGE_RECEIVED` event fires
6. **Verify**: No duplicate images or missing images
7. **Verify**: No barrier timeout errors in console

**Expected Behavior**:
- Widget shows accurate progress without resetting (no 0/2 flicker)
- Images appear inline after their respective `img-prompt` tags
- Console shows: "Barrier resolved, inserting deferred images"

**Common Issues**:
- Barrier timeout → Check timeout value (should be 300s)
- Images missing → Check session lifecycle logs
- Progress reset → Check `addMessageProgress()` logic

---

### 2. Manual Generation (Non-Streaming)

**Purpose**: Verify manual image generation works for existing messages.

**Steps**:
1. Find a message with `img-prompt` tags but no images
2. Click the magic wand icon (manual generation button)
3. Select "Replace" or "Append" mode
4. **Verify**: Dialog shows correct prompt count
5. **Verify**: Images generate sequentially (check console)
6. **Verify**: Images insert at correct positions
7. **Verify**: Progress widget updates correctly

**Expected Behavior**:
- Button appears only on messages with prompts
- Generation respects selected mode (replace vs append)
- DOM operations serialized per message (no race conditions)

**Common Issues**:
- Button missing → Check `hasImagePrompts()` logic
- Wrong insertion position → Check index calculation
- Concurrent generation conflicts → Check DOM queue serialization

---

### 3. Image Regeneration (Click to Regenerate)

**Purpose**: Verify clicking an existing image regenerates it correctly.

**Steps**:
1. Click on an AI-generated image
2. Select regeneration mode (replace or append)
3. **Verify**: Dialog appears with correct prompt info
4. **Verify**: New image generates
5. **Verify**: Image inserts correctly based on mode:
   - **Replace**: Old image removed, new image in same position
   - **Append**: Old image kept, new image added with "(Regenerated N)" suffix
6. **Verify**: Multiple regenerations increment counter correctly

**Expected Behavior**:
- Click handler only on images with `title^="AI generated image"`
- Regenerated images have proper titles (e.g., "AI generated image #2 (Regenerated 3)")
- DOM updates are atomic (no partial states visible)

**Common Issues**:
- Click handler missing → Check `addImageClickHandlers()` call
- Wrong image replaced → Check image index calculation
- Counter wrong → Check `countRegeneratedImages()` logic

---

### 4. Concurrency Control

**Purpose**: Verify multiple image generations don't exceed concurrency limit.

**Steps**:
1. Configure `maxConcurrentGenerations` to a low value (e.g., 2)
2. Trigger generation of 5+ images (streaming or manual)
3. **Verify**: Console logs show max 2 concurrent generations
4. **Verify**: Remaining images queue and process sequentially
5. **Verify**: All images eventually complete
6. **Verify**: No duplicate generation attempts

**Expected Behavior**:
- Bottleneck queue limits concurrency
- Console shows: "Waiting for slot in generation queue"
- Progress widget reflects total count, not concurrent count

**Common Issues**:
- Concurrent limit ignored → Check Bottleneck configuration
- Queue stalls → Check processor trigger logic
- Duplicate generations → Check queue deduplication

---

### 5. Session Management & Multiple Concurrent Sessions

**Purpose**: Verify proper session management with multiple concurrent streaming messages.

**Steps**:
1. Start streaming message N with image generation
2. **While message N is streaming**, send message N+2
3. **Verify**: Both sessions run concurrently without interfering
4. **Verify**: Progress widgets show both messages (e.g., "2 messages")
5. **Verify**: Message N completes and inserts its images correctly
6. **Verify**: Message N+2 completes and inserts its images correctly
7. **Verify**: No images from wrong sessions insert
8. **Verify**: Console shows session count increasing/decreasing correctly

**Additional Test - Session Cleanup**:
1. Start streaming with active sessions
2. Change chat or trigger CHAT_CHANGED event
3. **Verify**: All active sessions cancel cleanly
4. **Verify**: Console shows: "Cancelling N active streaming sessions"
5. **Verify**: No orphaned sessions remain

**Expected Behavior**:
- Multiple sessions can run concurrently (one per message)
- Each session has independent queue, monitor, processor, and barrier
- Sessions identified by messageId
- Image generation globally rate-limited via Bottleneck
- Chat changes cancel all sessions

**Common Issues**:
- Sessions interfere with each other → Check session isolation
- Images insert in wrong message → Check messageId validation
- Memory leak with many sessions → Check session cleanup
- Duplicate session for same message → Check startSession() logic

---

### 6. Error Handling & Recovery

**Purpose**: Verify graceful degradation when generation fails.

**Steps**:
1. **Simulate SD command failure** (disconnect image gen backend)
2. Trigger image generation
3. **Verify**: Error toast appears with clear message
4. **Verify**: Progress widget shows partial completion
5. **Verify**: Extension remains functional
6. **Verify**: Prompt tags remain in text (not removed)
7. **Verify**: Subsequent generations work after backend reconnects

**Expected Behavior**:
- Failed generations logged as warnings, not crashes
- User sees informative error messages
- Extension doesn't enter broken state

**Common Issues**:
- Extension crashes → Check error boundaries
- No error feedback → Check toast notifications
- Prompt tags removed → Check error handling in processor

---

### 7. Settings Persistence & UI

**Purpose**: Verify settings save/load correctly and UI updates properly.

**Steps**:
1. Open extension settings
2. Change multiple settings (timeouts, concurrency, patterns, etc.)
3. Click "Save"
4. **Verify**: Toast confirms save
5. Reload page
6. **Verify**: Settings persist across reload
7. **Verify**: Changed settings take effect immediately

**Expected Behavior**:
- All settings have change event listeners
- Settings stored in chat metadata
- UI reflects current values on load

**Common Issues**:
- Settings don't persist → Check event listener registration
- UI doesn't update → Check input value binding
- Changes not applied → Check settings reload in components

---

### 8. Progress Widget Behavior

**Purpose**: Verify global progress widget displays and updates correctly.

**Steps**:
1. Trigger generation on multiple messages simultaneously
2. **Verify**: Widget shows combined progress (e.g., "2 messages")
3. **Verify**: Individual message progress updates correctly
4. **Verify**: Widget auto-hides when all complete
5. **Verify**: Widget persists across page sections (doesn't disappear on scroll)
6. **Verify**: Widget doesn't block chat input

**Expected Behavior**:
- Widget shows aggregate progress across all active generations
- Auto-removes messages when complete
- Positioned correctly (bottom-right, not blocking UI)

**Common Issues**:
- Widget flickers → Check update batching
- Wrong count → Check message progress map
- Doesn't hide → Check cleanup logic

---

## Performance Tests

### 9. Long Streaming Messages

**Purpose**: Verify performance with many prompts in single message.

**Steps**:
1. Stream a message with 10+ image prompts
2. **Verify**: Monitor doesn't miss prompts
3. **Verify**: All prompts detected and queued
4. **Verify**: Progress widget updates smoothly
5. **Verify**: Memory usage stays reasonable (check DevTools)
6. **Verify**: No UI freezes or lag

**Expected Behavior**:
- Monitor detects all prompts via polling
- Processor handles queue efficiently
- UI remains responsive

---

### 10. Rapid Message Changes

**Purpose**: Verify session handling with fast message succession.

**Steps**:
1. Rapidly send 5+ messages while previous ones are streaming
2. **Verify**: All sessions run concurrently without errors
3. **Verify**: Each message gets its own progress widget
4. **Verify**: Images insert in correct messages
5. **Verify**: No errors in console
6. **Verify**: All sessions complete successfully
7. **Verify**: Memory usage remains reasonable

**Expected Behavior**:
- SessionManager maintains multiple concurrent sessions
- Each message identified by messageId
- DOM queue prevents race conditions within each message
- No memory leaks from concurrent sessions
- All messages receive their respective images

---

## Edge Cases

### 11. Empty/Malformed Prompts

**Purpose**: Verify robustness against edge cases.

**Test Cases**:
- Empty prompt: `<!--img-prompt=""-->`
- Special characters: `<!--img-prompt="test \"quoted\" & <tags>"-->`
- Very long prompt: 1000+ character prompt
- Unicode: Emoji and Chinese characters in prompts
- Malformed tags: `<img-prompt="missing close`, `<!--img-prompt=no-quotes-->`

**Expected Behavior**:
- Empty prompts ignored gracefully
- Special chars don't break parsing
- Long prompts truncated with warning
- Unicode handled correctly
- Malformed tags ignored, error logged

---

### 12. Barrier Timeout Scenario

**Purpose**: Verify timeout handling when MESSAGE_RECEIVED is delayed.

**Steps**:
1. Temporarily set barrier timeout to 5s (for testing)
2. Start streaming with image generation
3. **Simulate slow response** (takes >5s)
4. **Verify**: Barrier times out with clear error
5. **Verify**: Session ends gracefully
6. **Verify**: Extension remains functional
7. Restore timeout to 300s

**Expected Behavior**:
- Timeout error logged clearly
- Images not inserted (avoids partial state)
- Extension recovers for next message

---

## Browser Compatibility

### 13. Cross-Browser Check

**Quick smoke test** in each supported browser:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari (if macOS available)

**Verify**:
- Extension loads without errors
- Basic streaming generation works
- Settings UI renders correctly

---

## Test Completion Checklist

Before merging feature branch to `main`:

- [ ] All 13 test scenarios passed
- [ ] No errors or warnings in browser console
- [ ] Performance acceptable (no freezes/lag)
- [ ] Error messages user-friendly
- [ ] Settings persist correctly
- [ ] All TODO comments addressed or documented
- [ ] CHANGELOG.md updated with user-facing changes
- [ ] Commit messages follow conventional commits format

---

## Reporting Issues

If manual testing reveals issues:

1. **Do not merge** until resolved
2. Document the issue:
   - Steps to reproduce
   - Expected vs actual behavior
   - Browser/environment details
   - Console errors/logs
3. Create GitHub issue or add to existing tracking issue
4. Fix issue on feature branch
5. Re-run affected manual tests

---

## Notes

- **Time estimate**: 30-45 minutes for full manual test suite
- **Priority**: Tests 1-8 are critical; 9-13 are important but can be quick checks
- **Automation goal**: Eventually automate some of these with E2E tests (Playwright/Puppeteer)
- **Update this doc**: Add new tests when new major features are added
