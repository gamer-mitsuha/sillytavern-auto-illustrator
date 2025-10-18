# Progress Tracking System

## Overview

This document describes the progress tracking system used to display image generation progress in the streaming preview widget. It explains how the system works, the race condition that was fixed in issue #72, and best practices for working with the system.

## Architecture

### Components

1. **ProgressManager** (`src/progress_manager.ts`)
   - Singleton service that tracks image generation progress per message
   - Maintains counts of pending/completed tasks
   - Emits events for UI updates
   - Provides `isTracking()`, `completeTask()`, `failTask()` methods

2. **StreamingMonitor** (`src/streaming_monitor.ts`)
   - Detects new image prompts in streaming assistant messages
   - Registers tasks with ProgressManager when prompts are found
   - Polls message content at regular intervals during streaming

3. **QueueProcessor** (`src/queue_processor.ts`)
   - Processes image generation queue
   - Notifies ProgressManager when tasks complete/fail
   - Handles concurrent generation with rate limiting

4. **StreamingPreviewWidget** (`src/streaming_preview_widget.ts`)
   - UI component that displays streaming text and image preview
   - Shows current message content being generated
   - Inline preview during streaming

5. **ProgressWidget** (`src/progress_manager.ts`)
   - UI component that displays progress tracking
   - Listens to ProgressManager events
   - Shows pending/completed counts and thumbnails

## Task Registration Flow

### Normal Flow (After Fix)

```
1. User sends message
   ↓
2. STREAM_TOKEN_RECEIVED event fires
   ↓
3. SessionManager.startStreamingSession()
   ↓
4. monitor.start(messageId) [ASYNC]
   ↓
5. progressManager.registerTask(messageId, 0) [IMMEDIATE - message now tracked!]
   ↓
6. await checkForNewPrompts() [BLOCKS HERE]
   ↓
7. Extract prompts from message content
   ↓
8. progressManager.registerTask(messageId, newTotal) [INCREMENT total count]
   ↓
9. processor.start(messageId)
   ↓
10. Queue processes prompts
   ↓
11. progressManager.completeTask(messageId) [ALWAYS SAFE - message tracked from step 5]
```

### Key Points

- **Early registration**: Message is registered for tracking immediately in `monitor.start()` with `total=0`
- **Always tracked**: No race condition possible - message is tracked before any generation starts
- **Incremental updates**: `registerTask()` increments the total as new prompts are detected
- **No defensive checks needed**: Queue processor can safely call `completeTask()` without checking
- Race condition **completely eliminated** at the architectural level

## The Race Condition (Issue #72)

### Problem Description

Users reported an error message: **"Message X is not tracked by the progress manager"**

This error occurred when:
1. Streaming preview widget was disabled
2. Images failed to generate
3. Warning logged but generation silently failed

### Root Cause

**Location:** `streaming_monitor.ts:84` (before fix)

```typescript
// WRONG - not awaited!
start(messageId: number): void {
  // ... setup code ...

  // Start polling interval
  this.pollInterval = setInterval(() => {
    this.checkForNewPrompts();  // Not awaited in interval (OK)
  }, this.intervalMs);

  // Do immediate check
  this.checkForNewPrompts();  // ❌ NOT AWAITED - RACE CONDITION!
}
```

**The Problem:**
- `checkForNewPrompts()` is `async` but was called without `await`
- Returns immediately, doesn't wait for prompt detection to complete
- `processor.start()` could run before tasks were registered
- Image generation completes → calls `completeTask()` → "not tracked" error

### Race Condition Timeline

```
Time    | StreamingMonitor           | QueueProcessor              | ProgressManager
--------|----------------------------|-----------------------------|-----------------
T=0ms   | start() called             |                             |
T=1ms   | checkForNewPrompts() called|                             |
T=2ms   | (async function returns)   |                             |
T=3ms   | processor.start() called   | start() called              |
T=5ms   |                            | Starts processing queue     |
T=10ms  | (still detecting prompts)  | Image generation starts     |
T=50ms  | (still detecting prompts)  | Image completes!            |
T=51ms  |                            | completeTask() called       | ❌ Not tracked!
T=100ms | Prompt detection completes |                             |
T=101ms | registerTasks() called     |                             | ⚠️ Too late!
```

### Why Was This Hard to Notice?

1. **Usually works fine**: Prompt detection is fast (~50-100ms)
2. **Only fails when generation is very fast**: Small images, fast API
3. **More likely without preview widget**: Less overhead = faster execution
4. **Intermittent**: Timing-dependent race condition

## The Fix

### Three-Part Solution

Applied **early registration + async await + removed defensive checks** for a complete architectural fix.

#### 1. Early Registration - Register Message Immediately

**File:** `src/streaming_monitor.ts:80`

```typescript
async start(messageId: number): Promise<void> {
  // ... setup code ...

  logger.debug(
    `Starting monitor for message ${messageId} (interval: ${this.intervalMs}ms)`
  );

  // Register message for progress tracking immediately (total=0 initially)
  // This ensures the message is always tracked, eliminating any race conditions
  progressManager.registerTask(messageId, 0);  // ✅ REGISTERED IMMEDIATELY

  // Start polling interval
  this.pollInterval = setInterval(() => {
    this.checkForNewPrompts();  // OK - not awaited in interval callback
  }, this.intervalMs);

  // Do an immediate check (await to ensure prompts are registered)
  await this.checkForNewPrompts();  // ✅ AWAITED
}
```

**Rationale:**
- Message is tracked from the moment monitoring starts
- Starts with `total=0`, incremented as prompts are detected
- **Eliminates race condition at the architectural level**
- No defensive checks needed anywhere in the code

#### 2. Root Fix - Await the Async Call

**File:** `src/streaming_monitor.ts:63,88`

```typescript
// FIXED - now async and awaited
async start(messageId: number): Promise<void> {
  if (this.isRunning) {
    logger.warn('Already running, stopping previous monitor');
    this.stop();
  }

  this.messageId = messageId;
  this.lastSeenText = '';
  this.isRunning = true;
  this.hasSeenFirstToken = false;

  logger.debug(
    `Starting monitor for message ${messageId} (interval: ${this.intervalMs}ms)`
  );

  // Start polling interval
  this.pollInterval = setInterval(() => {
    this.checkForNewPrompts();  // OK - not awaited in interval callback
  }, this.intervalMs);

  // Do an immediate check (await to ensure prompts are registered)
  await this.checkForNewPrompts();  // ✅ AWAITED - race eliminated
}
```

**Rationale:**
- Ensures prompt detection completes before returning
- Session initialization waits for tasks to be registered
- Processor can't start until tasks are tracked

**Why not await in setInterval callback?**
- Interval callbacks fire repeatedly every N milliseconds
- If one call is slow, we don't want to block the next
- Missing one detection cycle is acceptable
- The immediate check (line 84) is what matters for preventing the race

#### 3. Simplification - Remove Defensive Checks

**File:** `src/queue_processor.ts:210,219,229`

```typescript
// Success path
if (imageUrl) {
  // ... emit image-completed event ...

  // Update progress tracking
  progressManager.completeTask(this.messageId);  // ✅ ALWAYS SAFE NOW
} else {
  // Failure path
  // ... handle failure ...

  // Update progress tracking (count failed as completed)
  progressManager.failTask(this.messageId);  // ✅ ALWAYS SAFE NOW
}

// Error path
catch (error) {
  // ... handle error ...

  // Update progress tracking (count error as completed)
  progressManager.failTask(this.messageId);  // ✅ ALWAYS SAFE NOW
}
```

**Rationale:**
- Early registration guarantees message is always tracked
- No defensive checks needed - simpler, cleaner code
- Architectural fix eliminates the need for defensive programming
- If `completeTask()` is called, message is guaranteed to be tracked

#### 4. Update Callers

**File:** `src/session_manager.ts:125`

```typescript
async startStreamingSession(
  messageId: number,
  _context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<GenerationSession> {
  // ... session setup ...

  // Start streaming preview widget
  if (previewWidget) {
    previewWidget.start(messageId);  // Not async - no await needed
    logger.debug(`Streaming preview widget started for message ${messageId}`);
  }

  // Start monitoring and processing
  await monitor.start(messageId);  // ✅ AWAITED - respects async signature
  processor.start(messageId);      // Not async - no await needed

  logger.debug(
    `Streaming session ${session.sessionId} started for message ${messageId}`
  );

  return session;
}
```

## Progress Manager API

### Registration

```typescript
// Register N tasks for a message
progressManager.registerTasks(messageId: number, taskCount: number): void

// Check if message is being tracked
progressManager.isTracking(messageId: number): boolean
```

### Task Completion

```typescript
// Mark one task as completed
progressManager.completeTask(messageId: number): void

// Mark one task as failed (counts as completed)
progressManager.failTask(messageId: number): void
```

### Events

```typescript
// Emitted when all tasks complete
progressManager.on('progress-complete', (messageId: number) => {
  // UI cleanup, etc.
});

// Emitted when an image completes (for thumbnail preview)
progressManager.on('image-completed', (
  messageId: number,
  imageUrl: string,
  prompt: string,
  preview: string
) => {
  // Update preview widget
});
```

### State Queries

```typescript
// Get pending/completed counts
const state = progressManager.getState(messageId);
// Returns: { pending: number, completed: number, total: number }

// Check if all tasks complete
const isComplete = progressManager.isComplete(messageId);
```

## Best Practices

### 1. Register Messages Early

```typescript
// ❌ WRONG - register only after detection
async function startMonitoring(messageId: number) {
  const prompts = await detectPrompts(messageId);
  if (prompts.length > 0) {
    progressManager.registerTask(messageId, prompts.length);  // Too late!
  }
  processor.start(messageId);
}

// ✅ CORRECT - register immediately
async function startMonitoring(messageId: number) {
  progressManager.registerTask(messageId, 0);  // Register first!
  const prompts = await detectPrompts(messageId);
  if (prompts.length > 0) {
    progressManager.registerTask(messageId, prompts.length);  // Increment
  }
  processor.start(messageId);
}
```

### 2. Always Await Async Operations

```typescript
// ❌ WRONG - race condition
function startProcessing(messageId: number) {
  detectTasks(messageId);  // async but not awaited
  processor.start(messageId);
}

// ✅ CORRECT - wait for detection
async function startProcessing(messageId: number) {
  await detectTasks(messageId);  // wait for detection to complete
  processor.start(messageId);
}
```

### 3. No Defensive Checks Needed (After Early Registration)

```typescript
// ❌ OLD APPROACH - defensive checks everywhere
if (progressManager.isTracking(messageId)) {
  progressManager.completeTask(messageId);
}

// ✅ NEW APPROACH - early registration makes checks unnecessary
progressManager.completeTask(messageId);  // Always safe!
```

**Note:** With early registration in `monitor.start()`, defensive checks are no longer needed. The message is guaranteed to be tracked before any `completeTask()` or `failTask()` calls.

### 4. Clean Up When Sessions End

```typescript
// When canceling/completing a session
sessionManager.cancelSession(messageId);
// Progress manager automatically cleans up on 'progress-complete' event
```

## Testing Progress Tracking

### Unit Tests

Progress tracking is tested in:
- `src/progress_manager.test.ts` - Core functionality
- `src/streaming_monitor.test.ts` - Prompt detection and registration
- `src/queue_processor.test.ts` - Task completion tracking

### Manual Testing

To test the race condition fix:

1. **Fast generation scenario:**
   ```javascript
   // In extension settings
   maxConcurrent: 10  // High concurrency
   minGenerationInterval: 0  // No delay
   ```

2. **Disable preview widget:**
   - Settings → "Enable Streaming Preview Widget" → OFF

3. **Use fast API:**
   - Small images (256x256 or 512x512)
   - Fast API endpoint (local GPU, etc.)

4. **Send multiple messages rapidly**
   - Should generate images without "not tracked" warnings
   - Check browser console for errors

### Debugging Progress Tracking

Enable debug logging:

```typescript
// In progress_manager.ts
const logger = createLogger('ProgressManager', 'debug');  // Change from 'info'
```

Debug output shows:
- Task registration: `"Registered 3 tasks for message 42"`
- Task completion: `"Task completed for message 42 (2/3)"`
- Progress complete: `"All tasks completed for message 42"`
- Warnings: `"Message 42 is not tracked by the progress manager"`

## Future Improvements

### Potential Enhancements

1. **Task IDs**: Track individual tasks by ID instead of just count
   ```typescript
   registerTask(messageId: number, taskId: string): void
   completeTask(messageId: number, taskId: string): void
   ```

2. **Progress Percentage**: Calculate percentage for progress bars
   ```typescript
   getProgress(messageId: number): number  // Returns 0-100
   ```

3. **Task Metadata**: Store prompt info with each task
   ```typescript
   interface Task {
     id: string;
     prompt: string;
     status: 'pending' | 'generating' | 'completed' | 'failed';
     startedAt?: number;
     completedAt?: number;
   }
   ```

4. **Timeout Detection**: Warn if tasks don't complete in reasonable time
   ```typescript
   registerTasks(messageId, count, { timeout: 30000 })  // 30 second timeout
   ```

### Known Limitations

1. **No retry tracking**: Failed tasks count as completed
2. **No partial completion**: Can't distinguish between failed and succeeded
3. **Message-level only**: No sub-message or prompt-level granularity
4. **No persistence**: Progress lost on page reload

## Related Documentation

- [MESSAGE_RENDERING.md](MESSAGE_RENDERING.md) - Message rendering patterns
- [DEVELOPMENT.md](DEVELOPMENT.md) - Adding settings and features
- [PRD.md](PRD.md) - Product requirements and behaviors

## Changelog

### 2025-10-18 - Issue #72 Fix (Complete Architectural Solution)
- **Early registration**: Added `progressManager.registerTask(messageId, 0)` in `monitor.start()` before any async operations
- **Async/await fix**: Made `StreamingMonitor.start()` async with await on `checkForNewPrompts()`
- **Removed defensive checks**: Eliminated `isTracking()` checks from `QueueProcessor` - no longer needed
- **Updated callers**: Updated `SessionManager` to await `monitor.start()`
- **Result**: Race condition completely eliminated at the architectural level

**Key insight:** By registering messages immediately (with `total=0`) when monitoring starts, we guarantee the message is always tracked before any `completeTask()` calls. This architectural fix eliminates the need for defensive programming throughout the codebase.

### Original Implementation
- Basic progress tracking for streaming preview widget
- Event-based notification system
- Simple pending/completed counters
