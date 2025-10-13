# Phase 3 Implementation Guide: Streaming Coordination Refactor

## Status: ✅ COMPLETED (v1.2.0 - 2025-10-11)
This document provided the implementation guide for Phase 3 of the queue management refactoring.

**All phases completed** ✅
- Phase 1: Barrier and SessionManager (committed: 1eb277d)
- Phase 2: Bottleneck integration (committed: aad90fd)
- Part A: Manual generation migration (committed: 3d6ecef)
- Phase 3: Streaming coordination refactor (committed: 5660cad)

## Overview
Phase 3 refactors `src/index.ts` to replace scattered module-level state variables with SessionManager and Barrier-based coordination.

## Current Problems

### Scattered State (6+ variables)
```typescript
// Current state in index.ts (lines 55-80)
let pendingDeferredImages: {images: DeferredImage[]; messageId: number} | null = null;
let messageReceivedFired = false;
let streamingQueue: ImageGenerationQueue | null = null;
let streamingMonitor: StreamingMonitor | null = null;
let queueProcessor: QueueProcessor | null = null;
let currentStreamingMessageId: number | null = null;
```

### Manual Barrier Logic
```typescript
// Current manual coordination (line 893)
if (!messageReceivedFired || !pendingDeferredImages) {
  // Wait...
}
```

## Implementation Steps

### Step 1: Update QueueProcessor (30 minutes)

#### File: `src/queue_processor.ts`

**1.1 Add Barrier import and field**
```typescript
// After line 14
import type {Barrier} from './barrier';

// After line 31 (in class fields)
private barrier: Barrier | null = null;
```

**1.2 Update start() method**
```typescript
// Replace lines 57-77
start(messageId: number, barrier?: Barrier): void {
  if (this.isRunning) {
    logger.warn('Already running, stopping previous processor');
    this.stop();
  }

  this.messageId = messageId;
  this.isRunning = true;
  this.activeGenerations = 0;
  this.deferredImages = [];
  this.barrier = barrier ?? null;

  logger.info(
    `Starting processor for message ${messageId} (max concurrent: ${this.maxConcurrent}) ${barrier ? 'with barrier' : 'without barrier'}`
  );

  insertProgressWidget(messageId, 0);
  this.processNext();
}
```

**1.3 Update processRemaining() to signal barrier**
```typescript
// At end of processRemaining() method (after line 251)
logger.info('Finished processing remaining prompts');

// Signal generation completion to barrier
if (this.barrier) {
  logger.info('Signaling genDone to barrier');
  this.barrier.arrive('genDone');
}
```

**Why**: Allows processor to coordinate with streaming events via barrier.

---

### Step 2: Update SessionManager (10 minutes)

#### File: `src/session_manager.ts`

**2.1 Pass barrier to processor**
```typescript
// Update line 91
processor.start(messageId, barrier);  // Add barrier parameter
```

**Why**: Ensures processor can signal when generation is complete.

---

### Step 3: Refactor index.ts (2-3 hours)

#### File: `src/index.ts`

**3.1 Update imports (lines 6-12)**
```typescript
// Remove
import {ImageGenerationQueue} from './streaming_image_queue';
import {StreamingMonitor} from './streaming_monitor';
import {QueueProcessor} from './queue_processor';

// Add
import {SessionManager} from './session_manager';
import {insertDeferredImages} from './image_generator';
import {scheduleDomOperation} from './dom_queue';
```

**3.2 Replace state variables (lines 54-80)**
```typescript
// Remove all these:
let pendingDeferredImages: {...} | null = null;
let messageReceivedFired = false;
let streamingQueue: ImageGenerationQueue | null = null;
let streamingMonitor: StreamingMonitor | null = null;
let queueProcessor: QueueProcessor | null = null;
let currentStreamingMessageId: number | null = null;

// Replace with single variable:
let sessionManager: SessionManager;
```

**3.3 Update isStreamingActive() (lines 63-78)**
```typescript
export function isStreamingActive(messageId?: number): boolean {
  return sessionManager.isActive(messageId);
}
```

**3.4 Update isMessageBeingStreamed() (lines 87-89)**
```typescript
export function isMessageBeingStreamed(messageId: number): boolean {
  return sessionManager.isActive(messageId);
}
```

**3.5 Update handleFirstStreamToken() (lines 726-808)**

**BEFORE**:
```typescript
function handleFirstStreamToken(): void {
  // ... validation checks ...

  // Check if already monitoring
  if (streamingMonitor && currentStreamingMessageId === messageId) {
    // ...
  }

  // Create components manually
  streamingQueue = new ImageGenerationQueue();
  queueProcessor = new QueueProcessor(...);
  streamingMonitor = new StreamingMonitor(...);

  // Reset state
  messageReceivedFired = false;
  currentStreamingMessageId = messageId;

  // Start components
  streamingMonitor.start(messageId);
  queueProcessor.start(messageId);
}
```

**AFTER**:
```typescript
function handleFirstStreamToken(): void {
  const messageId = context.chat.length - 1;

  if (!settings.streamingEnabled) {
    logger.debug('Streaming disabled, skipping');
    return;
  }

  if (!settings.enabled) {
    logger.debug('Extension disabled, skipping streaming');
    return;
  }

  const message = context.chat?.[messageId];
  if (!message) {
    logger.error('Message not found:', messageId);
    return;
  }

  if (message.is_user || message.is_system) {
    return;
  }

  // Note: DOM queue will automatically serialize with any manual generation operations

  // Check if already streaming this message
  if (sessionManager.isActive(messageId)) {
    logger.debug('Already streaming this message, ignoring duplicate token');
    return;
  }

  logger.info(`First token received for message ${messageId}, starting streaming`);
  currentGenerationType = 'streaming';

  // Start new session (cancels existing if any)
  const session = sessionManager.startSession(messageId, context, settings);

  logger.info(`Streaming monitor and processor started for session ${session.sessionId}`);
}
```

**3.6 Update handleMessageReceivedForStreaming() (lines 810-837)**

**BEFORE**:
```typescript
export function handleMessageReceivedForStreaming(): void {
  logger.info('MESSAGE_RECEIVED event fired for streaming');
  messageReceivedFired = true;

  // ... defer insertion logic ...
}
```

**AFTER**:
```typescript
export function handleMessageReceivedForStreaming(): void {
  const session = sessionManager.getCurrentSession();
  if (!session) {
    logger.debug('No active session, ignoring MESSAGE_RECEIVED');
    return;
  }

  logger.info('MESSAGE_RECEIVED fired, signaling barrier');
  session.barrier.arrive('messageReceived');
}
```

**3.7 Update handleGenerationEnded() (lines 841-925)**

**BEFORE**:
```typescript
async function handleGenerationEnded(): Promise<void> {
  currentGenerationType = null;

  if (!streamingMonitor?.isActive()) {
    return;
  }

  // Final scan
  streamingMonitor.finalScan();
  streamingMonitor.stop();

  // Process remaining
  await queueProcessor!.processRemaining();

  // Get deferred images
  pendingDeferredImages = {
    images: queueProcessor!.getDeferredImages(),
    messageId: currentStreamingMessageId!
  };

  // Check if can insert
  if (messageReceivedFired && pendingDeferredImages) {
    await insertDeferredImages(...);
  }
}
```

**AFTER**:
```typescript
async function handleGenerationEnded(): Promise<void> {
  currentGenerationType = null;

  const session = sessionManager.getCurrentSession();
  if (!session) {
    logger.debug('No active session, ignoring GENERATION_ENDED');
    return;
  }

  logger.info('GENERATION_ENDED, finalizing streaming session');

  const {sessionId, messageId, barrier, monitor, processor, queue} = session;

  // Final scan for any remaining prompts
  monitor.finalScan();

  // Stop monitoring (no more new prompts)
  monitor.stop();

  // Process remaining prompts and signal barrier
  await processor.processRemaining();
  // Note: processor.processRemaining() calls barrier.arrive('genDone')

  // Get deferred images
  const deferredImages = processor.getDeferredImages();
  logger.info(`${deferredImages.length} images ready for insertion`);

  // Stop processor
  processor.stop();

  // Log stats
  const stats = queue.getStats();
  logger.info('Final stats:', stats);

  // Schedule deferred insertion via DOM queue
  if (deferredImages.length > 0) {
    scheduleDomOperation(
      messageId,
      async () => {
        logger.info('Waiting for barrier (genDone + messageReceived)...');

        try {
          await barrier.whenReady;
          logger.info('Barrier resolved, inserting deferred images');

          // Check session still current (not cancelled)
          if (sessionManager.getCurrentSession()?.sessionId !== sessionId) {
            logger.warn('Session changed, skipping insertion');
            return;
          }

          // Insert images
          await insertDeferredImages(deferredImages, messageId, context);

          logger.info('Deferred images inserted successfully');
        } catch (error) {
          logger.error('Barrier failed or insertion error:', error);
          toastr.error(
            'Failed to insert generated images',
            t('extensionName')
          );
        }
      },
      'deferred image batch insertion'
    );
  }

  // End session
  sessionManager.endSession();

  // Show notification if failures
  if (stats.FAILED > 0) {
    toastr.warning(
      t('toast.streamingFailed', {count: stats.FAILED}),
      t('extensionName')
    );
  }
}
```

**3.8 Initialize SessionManager (in initialize() function, around line 931)**
```typescript
function initialize(): void {
  // ... existing initialization ...

  // Initialize SessionManager (add after settings initialization)
  sessionManager = new SessionManager();

  // ... rest of initialization ...
}
```

---

### Step 4: Clean Up (30 minutes)

**4.1 Remove/deprecate ConcurrencyLimiter**
- Option A: Delete `src/concurrency_limiter.ts` and `src/concurrency_limiter.test.ts`
- Option B: Mark as deprecated with comment

Since Bottleneck now handles all concurrency, recommend deletion.

**4.2 Update exports**
Verify that exported functions work correctly:
- `isStreamingActive()` ✓
- `isMessageBeingStreamed()` ✓
- `handleMessageReceivedForStreaming()` ✓

---

### Step 5: Testing & Validation (1 hour)

**5.1 Run tests**
```bash
npm test
```
Expected: All 367+ tests pass (may need to update queue_processor tests)

**5.2 Update tests if needed**
If `queue_processor.test.ts` fails:
- Tests may expect old `start(messageId)` signature
- Update to `start(messageId)` or `start(messageId, barrier)`

**5.3 Run linter**
```bash
npm run lint
npm run fix  # Auto-fix issues
```

**5.4 Build**
```bash
npm run build
```
Expected: Success, bundle size ~168-170KB (similar to Phase 2)

**5.5 Manual smoke test** (if possible)
- Start SillyTavern
- Test streaming generation
- Test manual generation
- Verify no conflicts

---

## Expected Benefits

### Before (Current State)
```typescript
// Scattered state
let pendingDeferredImages = null;
let messageReceivedFired = false;
let streamingQueue = null;
let streamingMonitor = null;
let queueProcessor = null;
let currentStreamingMessageId = null;

// Manual coordination
if (messageReceivedFired && pendingDeferredImages) {
  // Insert...
}
```

### After (Phase 3)
```typescript
// Encapsulated state
let sessionManager: SessionManager;

// Explicit coordination
await session.barrier.whenReady;
// Insert...
```

**Benefits**:
- ✅ Single source of truth (SessionManager)
- ✅ Explicit barrier coordination (no manual flags)
- ✅ Cleaner event handlers (no scattered state)
- ✅ Better testability (encapsulated session)
- ✅ Easier to extend (all session state in one place)

---

## Potential Issues & Solutions

### Issue 1: Tests failing for queue_processor
**Problem**: Tests may use old `start(messageId)` signature

**Solution**: Update test calls to:
```typescript
processor.start(messageId);  // Without barrier
// or
processor.start(messageId, new Barrier(['genDone'], 1000));  // With barrier
```

### Issue 2: TypeScript errors about missing exports
**Problem**: Some imports may not be exported from modules

**Solution**: Add exports as needed, e.g.:
```typescript
export {insertDeferredImages} from './image_generator';
```

### Issue 3: SessionManager not initialized error
**Problem**: Using sessionManager before it's initialized

**Solution**: Ensure `sessionManager = new SessionManager()` is called early in `initialize()`

---

## Testing Checklist

- [ ] All unit tests pass (`npm test`)
- [ ] No linter errors (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Bundle size acceptable (<180KB)
- [ ] `isStreamingActive()` works correctly
- [ ] `isMessageBeingStreamed()` works correctly
- [ ] Streaming generation works (manual test)
- [ ] Manual generation works (manual test)
- [ ] No conflicts between streaming and manual

---

## Commit Message Template

```
refactor(queue): implement Phase 3 - streaming coordination with SessionManager

Replace scattered state variables in index.ts with SessionManager and Barrier-based
coordination for cleaner, more maintainable streaming logic.

Changes:
- Update QueueProcessor to accept and use Barrier
  - Add barrier parameter to start() method
  - Signal barrier.arrive('genDone') in processRemaining()

- Update SessionManager to pass barrier to processor

- Refactor index.ts streaming coordination
  - Replace 6 scattered state variables with SessionManager
  - Update handleFirstStreamToken() to use sessionManager.startSession()
  - Update handleMessageReceivedForStreaming() to signal barrier
  - Update handleGenerationEnded() to use barrier and scheduleDomOperation
  - Update isStreamingActive() and isMessageBeingStreamed()
  - Initialize sessionManager in initialize()

- Clean up deprecated code
  - Remove ConcurrencyLimiter (replaced by Bottleneck)
  - Update imports throughout codebase

Benefits:
- Single source of truth for session state (SessionManager)
- Explicit barrier coordination (no manual flag checks)
- Cleaner event handlers (60+ lines removed)
- Better encapsulation and testability
- Easier to add features (all state in one place)

Testing:
- All 367+ tests passing
- Build successful
- Bundle size: ~168KB (unchanged)
- Linter clean
```

---

## Estimated Time
- QueueProcessor: 30 min
- SessionManager: 10 min
- index.ts refactoring: 2-3 hours
- Clean up: 30 min
- Testing: 1 hour

**Total: 4-5 hours**

---

## Next Steps After Phase 3

1. **Phase 4: Testing & Validation** (if not done inline)
   - Integration tests for full workflow
   - Performance validation
   - Manual testing scenarios

2. **Address Code Quality Issues** (GitHub Issue #40)
   - Position-based prompt matching
   - HTML attribute escaping
   - i18n key corrections

3. **Documentation Updates**
   - Update README with new architecture
   - Update CHANGELOG
   - Add architecture diagram

4. **Merge & Release**
   - Merge feature branch to main
   - Tag release
   - Announce changes
