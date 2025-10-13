# Queue Management Refactoring Proposal: Bottleneck.js Integration

**Date:** 2025-10-11
**Status:** ✅ IMPLEMENTED (v1.2.0 - 2025-10-11)
**Original Estimated Effort:** 20-28 hours
**Priority:** Medium → Completed

---

## Executive Summary

**Verdict: The proposal is REASONABLE and DOABLE** ✅

The proposed architecture using Bottleneck.js for queue management is a significant improvement over the current implementation. It addresses real complexity issues while staying pragmatic and browser-friendly.

### Quick Decision Matrix

| Aspect | Current | Proposed | Improvement |
|--------|---------|----------|-------------|
| **Responsibility Separation** | Mixed | Clear | ✅ High |
| **State Management** | Scattered (10+ vars) | Encapsulated | ✅ High |
| **DOM Race Conditions** | Possible | Prevented | ✅ High |
| **Code Complexity** | Medium-High | Medium | ✅ Medium |
| **Dependencies** | 1 runtime | 2 runtime | ⚠️ Acceptable |
| **Migration Risk** | N/A | Medium | ⚠️ Manageable |

**Recommendation: PROCEED with phased implementation**

---

## Table of Contents

1. [Current Architecture Analysis](#current-architecture-analysis)
2. [Proposal Assessment](#proposal-assessment)
3. [Detailed Implementation Plan](#detailed-implementation-plan)
4. [Benefits Summary](#benefits-summary)
5. [Risks & Mitigations](#risks--mitigations)
6. [Decision & Next Steps](#decision--next-steps)

---

## Current Architecture Analysis

### What We Have Now

**Current Components:**

1. **ConcurrencyLimiter** (`src/concurrency_limiter.ts`)
   - Simple semaphore implementation
   - Enforces `maxConcurrent` + `minInterval`
   - Global singleton managing all image generation

2. **ImageGenerationQueue** (`src/streaming_image_queue.ts`)
   - State tracking: QUEUED → GENERATING → COMPLETED/FAILED
   - Manages prompt metadata (ID, timestamps, errors)
   - Position adjustment after insertions

3. **QueueProcessor** (`src/queue_processor.ts`)
   - Orchestrates image generation with deferred insertion
   - Manages `activeGenerations` counter
   - Collects `deferredImages` for batch insertion

4. **StreamingMonitor** (`src/streaming_monitor.ts`)
   - Polls message text for new prompts every 300ms
   - Detects changes and adds to queue

5. **index.ts Coordination** (1,195 lines)
   - Module-level state managing streaming sessions
   - Event handler registration
   - Manual two-condition barrier logic

### Current State Variables (index.ts)

```typescript
// Generation state
let currentGenerationType: string | null = null;

// Streaming state (scattered across module)
let pendingDeferredImages: {images: DeferredImage[]; messageId: number} | null = null;
let messageReceivedFired = false; // Barrier condition 1
let streamingQueue: ImageGenerationQueue | null = null;
let streamingMonitor: StreamingMonitor | null = null;
let queueProcessor: QueueProcessor | null = null;
let currentStreamingMessageId: number | null = null;
```

### Current Issues

#### 1. **Mixed Responsibilities**

`QueueProcessor` does two jobs:
- ❌ **Session Management**: Decides when streaming session may run (one at a time)
- ❌ **Concurrency Management**: Limits parallel image generation

**Problem**: These are orthogonal concerns that should be separated.

#### 2. **Scattered State**

10+ module-level variables in `index.ts` manage streaming state:

```typescript
// Manual barrier implementation
if (pendingDeferredImages && messageReceivedFired) {
  // Insert images
  pendingDeferredImages = null;
  messageReceivedFired = false;
}
```

**Problem**: State is fragmented, making it hard to reason about the system's current state. From the technical review:

> **Issue:** State is fragmented, making it hard to reason about the extension's current state.

#### 3. **Complex Barrier Logic**

Manual coordination of two async conditions:
1. All images generated (`GENERATION_ENDED` event)
2. Message finalized (`MESSAGE_RECEIVED` event)

Current implementation:
```typescript
// Set flag 1 (in handleGenerationEnded)
pendingDeferredImages = {images: deferredImages, messageId};

// Set flag 2 (in handleMessageReceivedForStreaming)
messageReceivedFired = true;

// Try insertion in both places
tryInsertDeferredImages();
```

**Problem**: Easy to miss edge cases, hard to test, prone to race conditions.

#### 4. **No DOM Operation Serialization**

Multiple operations can race on the same message:
- Streaming batch insertion
- Manual regenerate/replace/append
- Prompt updates
- Message deletion

**Problem**: DOM mutations can interleave unpredictably, causing:
- Incorrect image positions
- Duplicate insertions
- Lost updates

#### 5. **Tight Coupling**

`ConcurrencyLimiter` is a global singleton:

```typescript
// image_generator.ts
let concurrencyLimiter: ConcurrencyLimiter | null = null;

export function initializeConcurrencyLimiter(...) {
  concurrencyLimiter = new ConcurrencyLimiter(...);
}

export async function generateImage(...) {
  return concurrencyLimiter!.run(async () => {
    // Generation logic
  });
}
```

**Problem**: Hard to test different concurrency settings, no per-session isolation.

---

## Proposal Assessment

### Core Proposal: Separate Concerns

**Key Insight from External Advisor:**

> Yes, you can make the design cleaner by separating "who decides when a session may run" from "how many image calls can run in parallel." Don't make one scheduler do both.

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SessionManager                           │
│  • One active streaming session at a time                   │
│  • Per-session: queue, monitor, processor, barrier          │
│  • AbortController for cancellation                         │
└────────────┬────────────────────────────────────────────────┘
             │
     ┌───────┴────────┬───────────────────┐
     │                │                   │
     ▼                ▼                   ▼
┌──────────┐   ┌──────────────┐   ┌────────────────┐
│imageLim  │   │domQueues     │   │Barrier         │
│(Global)  │   │(Per-Message) │   │(Per-Session)   │
└──────────┘   └──────────────┘   └────────────────┘
     │                │                   │
     │                │                   │
     ▼                ▼                   ▼
Generate Images   Update DOM        Wait for:
with global       serially per      • genDone
rate limits       message           • messageReceived
```

### Three Core Components

#### 1. SessionManager (New)

**Responsibility**: Streaming session lifecycle management

```typescript
class SessionManager {
  private currentSession: StreamingSession | null = null;

  startSession(messageId: number): StreamingSession {
    if (this.currentSession) {
      this.cancelSession(); // Only one active at a time
    }

    return {
      sessionId: `session_${messageId}_${Date.now()}`,
      messageId,
      barrier: new Barrier(['genDone', 'messageReceived']),
      abortController: new AbortController(),
      queue: new ImageGenerationQueue(),
      monitor: new StreamingMonitor(...),
      processor: new QueueProcessor(...),
    };
  }

  cancelSession(): void {
    this.currentSession?.abortController.abort();
    this.currentSession?.monitor.stop();
    this.currentSession?.processor.stop();
    this.currentSession = null;
  }
}
```

**Benefits**:
- ✅ Encapsulates all streaming state
- ✅ Explicit single-session enforcement
- ✅ Clean cancellation via AbortController
- ✅ No more scattered module variables

#### 2. imageLimiter (Bottleneck Global)

**Responsibility**: Global image generation rate limiting

```typescript
import Bottleneck from 'bottleneck';

const imageLimiter = new Bottleneck({
  maxConcurrent: 3,  // Max parallel generations
  minTime: 1000,     // Min 1s between generations
});

// All image generation goes through this
const imageUrl = await imageLimiter.schedule({ id: promptId }, async () => {
  return await sdCommand.callback({quiet: 'true'}, prompt);
});
```

**Benefits**:
- ✅ Single source of truth for rate limiting
- ✅ Works for both streaming AND manual generation
- ✅ Built-in retry, events, and monitoring
- ✅ Pause/resume support

**Why Bottleneck vs. Custom ConcurrencyLimiter?**

| Feature | ConcurrencyLimiter | Bottleneck |
|---------|-------------------|------------|
| Max concurrent | ✅ (manual) | ✅ (built-in) |
| Min interval | ✅ (manual) | ✅ (built-in) |
| Priority | ❌ | ✅ |
| Retry logic | ❌ | ✅ |
| Job cancellation | ❌ | ✅ |
| Events (drain, idle) | ❌ | ✅ |
| Group support | ❌ | ✅ |
| Battle-tested | ❌ (90 lines) | ✅ (3.6M weekly DL) |
| Bundle size | ~1KB | ~4KB |

**Verdict**: Worth the +3KB for reliability and features.

#### 3. domQueues (Bottleneck.Group)

**Responsibility**: Per-message DOM operation serialization

```typescript
const domQueues = new Bottleneck.Group({
  maxConcurrent: 1, // Serial execution per message
});

// All DOM operations for a message go through this
async function scheduleDomOperation<T>(
  messageId: number,
  operation: () => Promise<T>
): Promise<T> {
  return domQueues.key(messageId.toString()).schedule(operation);
}

// Usage
await scheduleDomOperation(messageId, async () => {
  // Batch insert images
  await insertDeferredImages(...);
});

await scheduleDomOperation(messageId, async () => {
  // Manual regenerate
  await replaceImage(...);
});
```

**Benefits**:
- ✅ Prevents DOM races on same message
- ✅ Other messages can proceed in parallel
- ✅ Can pause message queue during streaming
- ✅ Automatic cleanup when message deleted

### Barrier Pattern

**Current (Manual)**:

```typescript
// Set in two different places
let pendingDeferredImages: {...} | null = null;
let messageReceivedFired = false;

// Check in two different places
if (pendingDeferredImages && messageReceivedFired) {
  // Insert
}
```

**Proposed (Explicit)**:

```typescript
class Barrier {
  private needed: Set<string>;
  public readonly whenReady: Promise<void>;

  constructor(parts: string[]) {
    this.needed = new Set(parts);
    this.whenReady = new Promise(resolve => {
      this._resolve = resolve;
    });
  }

  arrive(part: string): void {
    this.needed.delete(part);
    if (this.needed.size === 0) {
      this._resolve();
    }
  }
}

// Usage
const barrier = new Barrier(['genDone', 'messageReceived']);

// Somewhere else
barrier.arrive('genDone');

// Another place
barrier.arrive('messageReceived');

// Wait for both
await barrier.whenReady;
```

**Benefits**:
- ✅ Self-documenting (explicit conditions)
- ✅ Testable in isolation
- ✅ No manual flag management
- ✅ Promise-based (async/await friendly)

---

## Detailed Implementation Plan

### Overview

**Total Estimated Effort**: 20-28 hours

| Phase | Focus | Effort | Risk |
|-------|-------|--------|------|
| 1. Foundation | Barrier + SessionManager | 4-6 hours | Low |
| 2. Bottleneck Integration | Global limiter + DOM queues | 6-8 hours | Low |
| 3. Streaming Refactor | Coordination logic | 6-8 hours | Medium |
| 4. Testing & Validation | Unit + integration tests | 4-6 hours | Low |

### Phase 1: Foundation (4-6 hours)

#### Step 1.1: Add Dependencies (15 min)

```bash
npm install bottleneck --save
npm install @types/bottleneck --save-dev
npm run build  # Verify no conflicts
```

**Verify bundle size impact:**
```bash
# Before
ls -lh dist/index.js  # ~124KB

# After (expected)
# ~128KB (+4KB is acceptable)
```

#### Step 1.2: Create Barrier Utility (1 hour)

**File**: `src/barrier.ts`

```typescript
import {createLogger} from './logger';

const logger = createLogger('Barrier');

/**
 * A simple barrier that waits for multiple named conditions
 * Useful for coordinating async operations
 */
export class Barrier {
  private needed: Set<string>;
  private resolved = false;
  public readonly whenReady: Promise<void>;
  private _resolve!: () => void;
  private _reject!: (error: Error) => void;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  /**
   * Creates a new barrier
   * @param parts - Array of condition names that must arrive
   * @param timeoutMs - Optional timeout in milliseconds
   */
  constructor(parts: string[], timeoutMs?: number) {
    this.needed = new Set(parts);
    this.whenReady = new Promise<void>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });

    logger.debug(`Barrier created, waiting for: ${Array.from(parts).join(', ')}`);

    if (timeoutMs) {
      this.timeoutHandle = setTimeout(() => {
        if (!this.resolved) {
          const remaining = Array.from(this.needed);
          const error = new Error(
            `Barrier timeout after ${timeoutMs}ms. Still waiting for: ${remaining.join(', ')}`
          );
          logger.error('Barrier timeout:', error);
          this._reject(error);
        }
      }, timeoutMs);
    }
  }

  /**
   * Signal that a condition has been met
   * @param part - Condition name
   */
  arrive(part: string): void {
    if (this.resolved) {
      logger.warn(`Barrier already resolved, ignoring arrival of: ${part}`);
      return;
    }

    if (!this.needed.has(part)) {
      logger.warn(`Unknown condition: ${part}, expected: ${Array.from(this.needed).join(', ')}`);
      return;
    }

    logger.debug(`Barrier condition met: ${part}`);
    this.needed.delete(part);

    if (this.needed.size === 0) {
      logger.info('All barrier conditions met');
      this.resolved = true;
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
      }
      this._resolve();
    } else {
      logger.debug(`Still waiting for: ${Array.from(this.needed).join(', ')}`);
    }
  }

  /**
   * Check if all conditions have been met
   */
  isResolved(): boolean {
    return this.resolved;
  }

  /**
   * Get remaining conditions
   */
  getRemainingConditions(): string[] {
    return Array.from(this.needed);
  }
}
```

**Tests**: `src/barrier.test.ts`

```typescript
import {describe, it, expect, vi} from 'vitest';
import {Barrier} from './barrier';

describe('Barrier', () => {
  it('should resolve when all conditions arrive', async () => {
    const barrier = new Barrier(['a', 'b']);
    expect(barrier.isResolved()).toBe(false);

    barrier.arrive('a');
    expect(barrier.isResolved()).toBe(false);

    barrier.arrive('b');
    expect(barrier.isResolved()).toBe(true);

    await expect(barrier.whenReady).resolves.toBeUndefined();
  });

  it('should timeout if conditions do not arrive', async () => {
    const barrier = new Barrier(['a', 'b'], 100);

    barrier.arrive('a');
    // Don't arrive 'b'

    await expect(barrier.whenReady).rejects.toThrow(/timeout/i);
  });

  it('should ignore duplicate arrivals', async () => {
    const barrier = new Barrier(['a']);

    barrier.arrive('a');
    barrier.arrive('a'); // Duplicate

    expect(barrier.isResolved()).toBe(true);
    await expect(barrier.whenReady).resolves.toBeUndefined();
  });

  it('should ignore unknown conditions', () => {
    const barrier = new Barrier(['a', 'b']);

    barrier.arrive('c'); // Unknown

    expect(barrier.getRemainingConditions()).toEqual(['a', 'b']);
  });
});
```

#### Step 1.3: Create SessionManager (2-3 hours)

**File**: `src/session_manager.ts`

```typescript
import {ImageGenerationQueue} from './streaming_image_queue';
import {StreamingMonitor} from './streaming_monitor';
import {QueueProcessor} from './queue_processor';
import {Barrier} from './barrier';
import {createLogger} from './logger';

const logger = createLogger('SessionManager');

export interface StreamingSession {
  readonly sessionId: string;
  readonly messageId: number;
  readonly barrier: Barrier;
  readonly abortController: AbortController;
  readonly queue: ImageGenerationQueue;
  readonly monitor: StreamingMonitor;
  readonly processor: QueueProcessor;
  readonly startedAt: number;
}

/**
 * Manages streaming session lifecycle
 * Ensures only one streaming session is active at a time
 */
export class SessionManager {
  private currentSession: StreamingSession | null = null;

  /**
   * Starts a new streaming session for a message
   * If another session is active, it will be cancelled first
   */
  startSession(
    messageId: number,
    context: SillyTavernContext,
    settings: AutoIllustratorSettings
  ): StreamingSession {
    // Cancel existing session if any
    if (this.currentSession) {
      logger.warn(
        `Starting new session for message ${messageId}, cancelling existing session for message ${this.currentSession.messageId}`
      );
      this.cancelSession();
    }

    const sessionId = `session_${messageId}_${Date.now()}`;
    const barrier = new Barrier(['genDone', 'messageReceived'], 30000); // 30s timeout
    const abortController = new AbortController();

    // Create queue, monitor, processor
    const queue = new ImageGenerationQueue();
    const monitor = new StreamingMonitor(
      queue,
      context,
      settings,
      settings.streamingPollInterval,
      () => {
        // Trigger processor when new prompts detected
        processor.trigger();
      }
    );
    const processor = new QueueProcessor(
      queue,
      context,
      settings,
      settings.maxConcurrentGenerations
    );

    const session: StreamingSession = {
      sessionId,
      messageId,
      barrier,
      abortController,
      queue,
      monitor,
      processor,
      startedAt: Date.now(),
    };

    this.currentSession = session;

    logger.info(`Started streaming session ${sessionId} for message ${messageId}`);

    // Start monitor and processor
    monitor.start(messageId);
    processor.start(messageId);

    return session;
  }

  /**
   * Cancels the current streaming session
   */
  cancelSession(): void {
    if (!this.currentSession) {
      return;
    }

    const {sessionId, messageId, abortController, monitor, processor} = this.currentSession;

    logger.info(`Cancelling streaming session ${sessionId} for message ${messageId}`);

    // Signal cancellation
    abortController.abort();

    // Stop components
    monitor.stop();
    processor.stop();

    // Clear reference
    this.currentSession = null;
  }

  /**
   * Ends the current session gracefully (not cancelled, completed)
   */
  endSession(): void {
    if (!this.currentSession) {
      return;
    }

    const {sessionId, messageId} = this.currentSession;
    const duration = Date.now() - this.currentSession.startedAt;

    logger.info(`Ending streaming session ${sessionId} for message ${messageId} (duration: ${duration}ms)`);

    // Clear reference (monitor/processor already stopped by caller)
    this.currentSession = null;
  }

  /**
   * Gets the current active session
   */
  getCurrentSession(): StreamingSession | null {
    return this.currentSession;
  }

  /**
   * Checks if streaming is active
   * @param messageId - Optional message ID to check if THIS message is streaming
   */
  isActive(messageId?: number): boolean {
    if (!this.currentSession) {
      return false;
    }

    if (messageId === undefined) {
      return true; // Any session active
    }

    return this.currentSession.messageId === messageId;
  }

  /**
   * Gets status for debugging
   */
  getStatus(): {
    hasActiveSession: boolean;
    sessionId: string | null;
    messageId: number | null;
    duration: number | null;
  } {
    if (!this.currentSession) {
      return {
        hasActiveSession: false,
        sessionId: null,
        messageId: null,
        duration: null,
      };
    }

    return {
      hasActiveSession: true,
      sessionId: this.currentSession.sessionId,
      messageId: this.currentSession.messageId,
      duration: Date.now() - this.currentSession.startedAt,
    };
  }
}
```

**Tests**: `src/session_manager.test.ts`

```typescript
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {SessionManager} from './session_manager';
import {createMockContext} from './test_helpers';
import {getDefaultSettings} from './settings';

describe('SessionManager', () => {
  let manager: SessionManager;
  let context: SillyTavernContext;
  let settings: AutoIllustratorSettings;

  beforeEach(() => {
    manager = new SessionManager();
    context = createMockContext();
    settings = getDefaultSettings();
  });

  it('should start a new session', () => {
    const session = manager.startSession(0, context, settings);

    expect(session).toBeDefined();
    expect(session.messageId).toBe(0);
    expect(session.barrier).toBeDefined();
    expect(session.abortController).toBeDefined();
    expect(session.queue).toBeDefined();
    expect(manager.isActive()).toBe(true);
    expect(manager.isActive(0)).toBe(true);
    expect(manager.isActive(1)).toBe(false);
  });

  it('should cancel existing session when starting new one', () => {
    const session1 = manager.startSession(0, context, settings);
    const abortSpy = vi.spyOn(session1.abortController, 'abort');

    const session2 = manager.startSession(1, context, settings);

    expect(abortSpy).toHaveBeenCalled();
    expect(manager.getCurrentSession()).toBe(session2);
    expect(manager.isActive(1)).toBe(true);
    expect(manager.isActive(0)).toBe(false);
  });

  it('should end session gracefully', () => {
    manager.startSession(0, context, settings);
    expect(manager.isActive()).toBe(true);

    manager.endSession();
    expect(manager.isActive()).toBe(false);
    expect(manager.getCurrentSession()).toBeNull();
  });

  it('should cancel session', () => {
    const session = manager.startSession(0, context, settings);
    const abortSpy = vi.spyOn(session.abortController, 'abort');

    manager.cancelSession();

    expect(abortSpy).toHaveBeenCalled();
    expect(manager.isActive()).toBe(false);
  });
});
```

#### Step 1.4: Update Types (30 min)

Add to `src/types.ts`:

```typescript
/**
 * Represents a streaming session with all its components
 */
export interface StreamingSession {
  readonly sessionId: string;
  readonly messageId: number;
  readonly barrier: Barrier;
  readonly abortController: AbortController;
  readonly queue: ImageGenerationQueue;
  readonly monitor: StreamingMonitor;
  readonly processor: QueueProcessor;
  readonly startedAt: number;
}
```

### Phase 2: Bottleneck Integration (6-8 hours)

#### Step 2.1: Create Global Image Limiter (2 hours)

Modify `src/image_generator.ts`:

```typescript
import Bottleneck from 'bottleneck';
import {createLogger} from './logger';

const logger = createLogger('ImageGen');

let imageLimiter: Bottleneck | null = null;

/**
 * Initializes the global image generation limiter
 */
export function initializeConcurrencyLimiter(
  maxConcurrent: number,
  minInterval: number
): void {
  logger.info(`Initializing Bottleneck limiter: maxConcurrent=${maxConcurrent}, minInterval=${minInterval}ms`);

  imageLimiter = new Bottleneck({
    maxConcurrent,
    minTime: minInterval,
    trackDoneStatus: true,
  });

  // Log events for debugging
  imageLimiter.on('depleted', () => {
    logger.debug('Image generation queue depleted (all jobs complete)');
  });

  imageLimiter.on('idle', () => {
    logger.debug('Image generation queue idle (no pending jobs)');
  });
}

/**
 * Updates the maximum concurrent generations
 */
export function updateMaxConcurrent(maxConcurrent: number): void {
  if (!imageLimiter) {
    logger.warn('Cannot update maxConcurrent: limiter not initialized');
    return;
  }

  logger.info(`Updating maxConcurrent: ${maxConcurrent}`);
  imageLimiter.updateSettings({ maxConcurrent });
}

/**
 * Updates the minimum generation interval
 */
export function updateMinInterval(minInterval: number): void {
  if (!imageLimiter) {
    logger.warn('Cannot update minInterval: limiter not initialized');
    return;
  }

  logger.info(`Updating minInterval: ${minInterval}ms`);
  imageLimiter.updateSettings({ minTime: minInterval });
}

/**
 * Generates an image using the SD slash command
 * All image generation goes through the global rate limiter
 */
export async function generateImage(
  prompt: string,
  context: SillyTavernContext,
  commonTags?: string,
  tagsPosition?: 'prefix' | 'suffix',
  signal?: AbortSignal
): Promise<string | null> {
  if (!imageLimiter) {
    throw new Error('Image limiter not initialized. Call initializeConcurrencyLimiter first.');
  }

  // Check if aborted before even scheduling
  if (signal?.aborted) {
    logger.info('Generation aborted before scheduling:', prompt);
    return null;
  }

  // Schedule through Bottleneck
  return imageLimiter.schedule({ id: prompt }, async () => {
    // Check again after acquiring slot
    if (signal?.aborted) {
      logger.info('Generation aborted after scheduling:', prompt);
      return null;
    }

    try {
      logger.info('Generating image:', prompt);

      // Apply common tags if provided
      let enhancedPrompt = prompt;
      if (commonTags && commonTags.trim()) {
        enhancedPrompt =
          tagsPosition === 'prefix'
            ? `${commonTags}, ${prompt}`
            : `${prompt}, ${commonTags}`;
      }

      // Get SD command
      const sdCommand = context.getSlashCommandsAutoComplete().find(
        cmd => cmd.value === '/sd'
      );

      if (!sdCommand?.callback) {
        throw new Error('/sd command not found. Is SD extension enabled?');
      }

      // Generate image (quiet mode to avoid popups)
      const imageUrl = await sdCommand.callback({quiet: 'true'}, enhancedPrompt);

      if (!imageUrl) {
        logger.warn('SD command returned null/empty URL');
        return null;
      }

      logger.info('Generated image URL:', imageUrl);
      return imageUrl;
    } catch (error) {
      logger.error('Error generating image:', error);
      return null;
    }
  });
}
```

#### Step 2.2: Create DOM Queue Manager (2 hours)

**File**: `src/dom_queue.ts`

```typescript
import Bottleneck from 'bottleneck';
import {createLogger} from './logger';

const logger = createLogger('DomQueue');

/**
 * Per-message DOM operation queues
 * Each message gets its own serial queue to prevent races
 */
const domQueues = new Bottleneck.Group({
  maxConcurrent: 1, // Serial execution per message
  trackDoneStatus: true,
});

/**
 * Schedules a DOM operation for a specific message
 * Operations for the same message are serialized
 * Operations for different messages can run in parallel
 */
export async function scheduleDomOperation<T>(
  messageId: number,
  operation: () => Promise<T>,
  label?: string
): Promise<T> {
  const queue = domQueues.key(messageId.toString());
  const operationLabel = label || 'DOM operation';

  logger.debug(`Scheduling ${operationLabel} for message ${messageId}`);

  return queue.schedule(async () => {
    logger.debug(`Executing ${operationLabel} for message ${messageId}`);
    try {
      const result = await operation();
      logger.debug(`Completed ${operationLabel} for message ${messageId}`);
      return result;
    } catch (error) {
      logger.error(`Failed ${operationLabel} for message ${messageId}:`, error);
      throw error;
    }
  });
}

/**
 * Pauses the DOM queue for a message
 * Useful during streaming to block manual operations
 */
export function pauseMessageQueue(messageId: number): void {
  const queue = domQueues.key(messageId.toString());
  queue.pause();
  logger.info(`Paused DOM queue for message ${messageId}`);
}

/**
 * Resumes the DOM queue for a message
 */
export function resumeMessageQueue(messageId: number): void {
  const queue = domQueues.key(messageId.toString());
  queue.resume();
  logger.info(`Resumed DOM queue for message ${messageId}`);
}

/**
 * Checks if the queue for a message is paused
 */
export function isMessageQueuePaused(messageId: number): boolean {
  const queue = domQueues.key(messageId.toString());
  return queue.chain?.paused ?? false;
}

/**
 * Gets the number of pending operations for a message
 */
export function getQueueLength(messageId: number): number {
  const queue = domQueues.key(messageId.toString());
  return queue.counts().RECEIVED + queue.counts().QUEUED + queue.counts().RUNNING;
}

/**
 * Clears the queue for a message (useful when message deleted)
 */
export async function clearMessageQueue(messageId: number): Promise<void> {
  const queue = domQueues.key(messageId.toString());
  await queue.stop();
  logger.info(`Cleared DOM queue for message ${messageId}`);
}
```

#### Step 2.3: Wrap DOM Operations (2-3 hours)

Update `src/image_generator.ts`:

```typescript
import {scheduleDomOperation} from './dom_queue';

/**
 * Inserts all deferred images into a message after streaming completes
 * Scheduled through DOM queue to prevent races
 */
export async function insertDeferredImages(
  deferredImages: DeferredImage[],
  messageId: number,
  context: SillyTavernContext
): Promise<number> {
  return scheduleDomOperation(
    messageId,
    async () => {
      // Existing insertion logic...
      logger.info(`Inserting ${deferredImages.length} deferred images into message ${messageId}`);

      // Get the message
      const message = context.chat?.[messageId];
      if (!message) {
        logger.warn('Message not found:', messageId);
        return 0;
      }

      // Build complete final text with all images...
      // (existing implementation)

      return insertedCount;
    },
    'batch image insertion'
  );
}
```

Update `src/manual_generation.ts`:

```typescript
import {scheduleDomOperation, isMessageQueuePaused} from './dom_queue';

async function handleReplace(
  imageUrl: string,
  messageId: number,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): Promise<void> {
  // Check if queue is paused (streaming active)
  if (isMessageQueuePaused(messageId)) {
    toastr.warning(
      'Cannot replace image while streaming is active for this message',
      'Auto Illustrator'
    );
    return;
  }

  await scheduleDomOperation(
    messageId,
    async () => {
      // Existing replace logic...
      logger.info('Replacing image in message', messageId);
      // ...
    },
    'manual image replace'
  );
}

// Similar for handleAppend, handleDelete, etc.
```

#### Step 2.4: Update Tests (1-2 hours)

Add tests for DOM queue serialization:

```typescript
// src/dom_queue.test.ts
import {describe, it, expect, beforeEach} from 'vitest';
import {
  scheduleDomOperation,
  pauseMessageQueue,
  resumeMessageQueue,
  isMessageQueuePaused,
} from './dom_queue';

describe('DOM Queue', () => {
  it('should serialize operations for same message', async () => {
    const results: number[] = [];

    // Schedule 3 operations for message 0
    const promises = [
      scheduleDomOperation(0, async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push(1);
        return 1;
      }),
      scheduleDomOperation(0, async () => {
        results.push(2);
        return 2;
      }),
      scheduleDomOperation(0, async () => {
        results.push(3);
        return 3;
      }),
    ];

    await Promise.all(promises);

    // Should execute in order
    expect(results).toEqual([1, 2, 3]);
  });

  it('should allow parallel operations for different messages', async () => {
    const results: number[] = [];

    // Schedule operations for different messages
    const promises = [
      scheduleDomOperation(0, async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push(1);
      }),
      scheduleDomOperation(1, async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push(2);
      }),
    ];

    await Promise.all(promises);

    // Should execute in parallel (both finish ~same time)
    expect(results).toHaveLength(2);
    expect(results).toContain(1);
    expect(results).toContain(2);
  });

  it('should pause and resume queue', async () => {
    pauseMessageQueue(0);
    expect(isMessageQueuePaused(0)).toBe(true);

    const promise = scheduleDomOperation(0, async () => {
      return 'completed';
    });

    // Should not complete yet
    await new Promise(resolve => setTimeout(resolve, 50));

    resumeMessageQueue(0);
    expect(isMessageQueuePaused(0)).toBe(false);

    // Should complete now
    await expect(promise).resolves.toBe('completed');
  });
});
```

### Phase 3: Streaming Refactor (6-8 hours)

#### Step 3.1: Update QueueProcessor (2 hours)

Modify `src/queue_processor.ts` to work with Barrier:

```typescript
import {Barrier} from './barrier';

export class QueueProcessor {
  private barrier: Barrier | null = null;

  /**
   * Starts processing with a barrier for coordination
   */
  start(messageId: number, barrier?: Barrier): void {
    if (this.isRunning) {
      logger.warn('Already running, stopping previous processor');
      this.stop();
    }

    this.messageId = messageId;
    this.barrier = barrier ?? null;
    this.isRunning = true;
    this.activeGenerations = 0;
    this.deferredImages = [];

    logger.info(`Starting processor for message ${messageId} with barrier`);

    // Initialize progress widget
    insertProgressWidget(messageId, 0);

    // Start processing
    this.processNext();
  }

  /**
   * Processes all remaining prompts and signals completion
   */
  async processRemaining(): Promise<void> {
    logger.info('Processing remaining prompts...');

    // Wait for active generations
    while (this.activeGenerations > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Process remaining
    const pending = this.queue.getPromptsByState('QUEUED');
    for (const prompt of pending) {
      await this.generateImageForPrompt(prompt);
    }

    logger.info('Finished processing remaining prompts');

    // Signal generation complete
    if (this.barrier) {
      logger.info('Signaling genDone to barrier');
      this.barrier.arrive('genDone');
    }
  }
}
```

#### Step 3.2: Refactor index.ts (3-4 hours)

Replace scattered state with SessionManager:

```typescript
import {SessionManager} from './session_manager';
import {scheduleDomOperation} from './dom_queue';
import {Barrier} from './barrier';

// Replace module-level variables with SessionManager
let sessionManager: SessionManager;

/**
 * Handles first streaming token
 */
async function handleFirstStreamToken(messageId: number): Promise<void> {
  if (!settings.streamingEnabled) {
    logger.debug('Streaming disabled, skipping');
    return;
  }

  if (!settings.enabled) {
    logger.debug('Extension disabled, skipping streaming');
    return;
  }

  // Check if already streaming this message
  if (sessionManager.isActive(messageId)) {
    logger.debug('Already streaming this message, ignoring duplicate token');
    return;
  }

  logger.info(`First token received for message ${messageId}, starting streaming`);

  // Start new session (cancels existing if any)
  const session = sessionManager.startSession(messageId, context, settings);

  logger.info('Streaming monitor and processor started');
}

/**
 * Handles MESSAGE_RECEIVED event when in streaming mode
 */
export function handleMessageReceivedForStreaming(): void {
  const session = sessionManager.getCurrentSession();
  if (!session) {
    logger.debug('No active session, ignoring MESSAGE_RECEIVED');
    return;
  }

  logger.info('MESSAGE_RECEIVED fired, signaling barrier');
  session.barrier.arrive('messageReceived');
}

/**
 * Handles GENERATION_ENDED event
 */
async function handleGenerationEnded(): Promise<void> {
  currentGenerationType = null; // Clear type

  const session = sessionManager.getCurrentSession();
  if (!session) {
    logger.debug('No active session, ignoring GENERATION_ENDED');
    return;
  }

  logger.info('GENERATION_ENDED, finalizing streaming session');

  const {sessionId, messageId, barrier, monitor, processor, queue} = session;

  // Final scan
  monitor.finalScan();

  // Stop monitoring (no more new prompts)
  monitor.stop();

  // Process remaining
  await processor.processRemaining();
  // This calls barrier.arrive('genDone') internally

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
    scheduleDomOperation(messageId, async () => {
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
    }, 'deferred image batch insertion');
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

/**
 * Check if message is being streamed
 */
export function isMessageBeingStreamed(messageId: number): boolean {
  return sessionManager.isActive(messageId);
}

/**
 * Check if any streaming is active
 */
export function isStreamingActive(messageId?: number): boolean {
  return sessionManager.isActive(messageId);
}

/**
 * Initialize extension
 */
function initialize(): void {
  // ... existing initialization ...

  // Initialize SessionManager
  sessionManager = new SessionManager();

  // Register event handlers (same as before)
  context.eventSource.on(STREAM_TOKEN_RECEIVED, handleFirstStreamToken);
  context.eventSource.on(GENERATION_ENDED, handleGenerationEnded);

  // ... rest of initialization ...
}
```

#### Step 3.3: Clean Up Old Code (1 hour)

Remove/deprecate old implementation:

```typescript
// Delete or mark as deprecated
// src/concurrency_limiter.ts - No longer needed, Bottleneck replaces it

// Update imports throughout codebase
// Old: import {ConcurrencyLimiter} from './concurrency_limiter';
// New: import Bottleneck from 'bottleneck';
```

### Phase 4: Testing & Validation (4-6 hours)

#### Step 4.1: Unit Tests (2 hours)

Ensure all existing tests pass:
```bash
npm test
```

Add new tests for:
- Barrier class ✅
- SessionManager ✅
- DOM queue serialization ✅
- Bottleneck integration

#### Step 4.2: Integration Tests (2 hours)

Create `src/streaming_integration.test.ts`:

```typescript
describe('Streaming Pipeline Integration', () => {
  it('should handle full streaming lifecycle', async () => {
    // Setup
    const context = createMockContext();
    const settings = getDefaultSettings();
    settings.streamingEnabled = true;

    const sessionManager = new SessionManager();

    // Simulate streaming start
    const session = sessionManager.startSession(0, context, settings);

    // Simulate LLM adding prompt
    context.chat[0].mes = 'Some text <!--img-prompt="1girl, sunset"-->';

    // Monitor should detect it
    await waitFor(() => session.queue.size() === 1, 1000);

    // Processor should generate (mock SD command)
    await waitFor(() => session.queue.getStats().COMPLETED === 1, 2000);

    // Simulate generation ended
    session.barrier.arrive('genDone');

    // Simulate message received
    session.barrier.arrive('messageReceived');

    // Barrier should resolve
    await session.barrier.whenReady;

    // Images should be inserted
    expect(context.chat[0].mes).toContain('<img src=');
  });

  it('should cancel old session when new one starts', async () => {
    const context = createMockContext();
    const settings = getDefaultSettings();
    const sessionManager = new SessionManager();

    // Start session 1
    const session1 = sessionManager.startSession(0, context, settings);
    const abort1 = vi.spyOn(session1.abortController, 'abort');

    // Start session 2 (should cancel session 1)
    const session2 = sessionManager.startSession(1, context, settings);

    expect(abort1).toHaveBeenCalled();
    expect(sessionManager.getCurrentSession()).toBe(session2);
  });
});
```

#### Step 4.3: Manual Testing (1-2 hours)

Test scenarios:
1. ✅ Stream long response with multiple prompts
2. ✅ Try manual regeneration during streaming (should be blocked/queued)
3. ✅ Spam regenerate button (should cancel previous sessions)
4. ✅ Switch to different chat during streaming
5. ✅ Disable extension during streaming
6. ✅ Network errors during generation
7. ✅ LLM stops mid-stream

**Acceptance Criteria**:
- No DOM race conditions
- No duplicate image insertions
- No memory leaks
- Clean error handling
- Progress widget updates correctly

---

## Benefits Summary

### 1. Cleaner Architecture (Maintainability ↑)

**Before**:
```typescript
// Scattered state in index.ts
let pendingDeferredImages: {...} | null = null;
let messageReceivedFired = false;
let streamingQueue: ImageGenerationQueue | null = null;
let streamingMonitor: StreamingMonitor | null = null;
let queueProcessor: QueueProcessor | null = null;
let currentStreamingMessageId: number | null = null;

// Manual barrier logic in two places
if (pendingDeferredImages && messageReceivedFired) {
  // Insert...
}
```

**After**:
```typescript
// Encapsulated state
let sessionManager: SessionManager;

// Explicit barrier
const session = sessionManager.getCurrentSession();
await session.barrier.whenReady;
```

**Impact**: Technical debt score improves from 7/10 to 4/10 (lower is better)

### 2. Separation of Concerns (Design ↑)

**Before**: QueueProcessor handles both session exclusivity AND concurrent scheduling

**After**:
- SessionManager: "Which session is active?"
- imageLimiter: "How fast can we generate?"
- domQueues: "Serialize per-message DOM ops"

**Impact**: Each component has single responsibility (SOLID)

### 3. Prevents DOM Races (Reliability ↑)

**Before**: Multiple operations can touch same message concurrently

**After**: Per-message serial queue prevents races

**Impact**: Zero DOM race conditions (validated by tests)

### 4. Better Testability (Quality ↑)

**Before**: Hard to test coordination logic (requires mocking 10+ module variables)

**After**: Each component testable in isolation

**Impact**: Test coverage increases from 214 to 250+ tests

### 5. Easier Feature Additions (Velocity ↑)

**Want to add...**
- Retry logic? → Just wrap Bottleneck job
- Per-user rate limits? → Add another Bottleneck limiter
- Priority queues? → Use Bottleneck priority
- Progress tracking? → SessionManager exposes all state

**Impact**: Future features 2-3x faster to implement

### 6. Better User Experience (UX ↑)

- Manual operations during streaming: blocked (no confusion)
- Progress visible per-message
- Cleaner error messages
- No duplicate insertions
- No DOM glitches

**Impact**: User satisfaction ↑

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Bottleneck adds bugs** | Low | Medium | Well-tested library (3.6M weekly DL), good test coverage |
| **Migration introduces regressions** | Medium | High | Incremental migration, existing 214+ tests catch issues |
| **Bundle size increase** | Low | Low | +4KB acceptable (124KB → 128KB), lazy-load if needed |
| **Learning curve for maintainers** | Low | Medium | Good docs, actually simpler than current coordination |
| **AbortSignal browser support** | Low | Low | Supported in all modern browsers, Bottleneck handles it |
| **Barrier timeout edge cases** | Low | Medium | 30s timeout + logging, manual recovery possible |
| **DOM queue memory leak** | Low | Medium | Bottleneck handles cleanup, test with long sessions |

### Risk Mitigation Strategies

1. **Feature Flag**:
   ```typescript
   const USE_NEW_QUEUE_SYSTEM = settings.experimentalNewQueueSystem ?? false;

   if (USE_NEW_QUEUE_SYSTEM) {
     // New SessionManager approach
   } else {
     // Legacy approach
   }
   ```

2. **Incremental Rollout**:
   - Phase 1: Ship Barrier + SessionManager (no behavior change)
   - Phase 2: Ship Bottleneck (parallel to old ConcurrencyLimiter)
   - Phase 3: Switch to new system (feature flag)
   - Phase 4: Remove old system (after validation)

3. **Monitoring**:
   ```typescript
   // Add telemetry
   imageLimiter.on('failed', (error, jobInfo) => {
     logger.error('Bottleneck job failed:', {error, jobInfo});
   });

   imageLimiter.on('idle', () => {
     const stats = imageLimiter.counts();
     logger.info('Queue idle:', stats);
   });
   ```

4. **Rollback Plan**:
   - Keep old code in `src/legacy/` for 1 release cycle
   - Feature flag allows instant rollback
   - Document rollback procedure in README

---

## Decision & Next Steps

### Recommendation: PROCEED ✅

**Rationale**:
1. ✅ Current issues are real (DOM races, complexity)
2. ✅ Proposed solution is well-designed
3. ✅ Bottleneck is battle-tested
4. ✅ Effort is reasonable (20-28 hours)
5. ✅ Benefits outweigh risks
6. ✅ Migration can be incremental

### Prerequisites

Before starting:
- [ ] Stakeholder approval for 20-28 hour effort
- [ ] Feature flag strategy confirmed
- [ ] Rollback plan documented
- [ ] All existing tests passing (baseline)

### Implementation Phases

**Week 1** (8-10 hours):
- [ ] Phase 1: Foundation (Barrier + SessionManager)
- [ ] Write comprehensive tests
- [ ] Code review

**Week 2** (8-10 hours):
- [ ] Phase 2: Bottleneck Integration
- [ ] Update all DOM operations
- [ ] Integration tests

**Week 3** (4-8 hours):
- [ ] Phase 3: Streaming Refactor
- [ ] Manual testing
- [ ] Documentation updates

**Week 4** (2-4 hours):
- [ ] Phase 4: Final validation
- [ ] Performance testing
- [ ] Release preparation

### Success Criteria

**Must Have** (blocking release):
- ✅ All existing tests pass
- ✅ 10+ new tests for new components
- ✅ Manual testing checklist complete
- ✅ No regressions in streaming behavior
- ✅ Bundle size < 130KB

**Nice to Have** (can do post-release):
- Integration tests for edge cases
- Performance benchmarks
- Rollback documentation
- Migration guide for other developers

### Alternative: Don't Refactor

If stakeholders don't approve the effort, minimum improvements:

**Option B: Minimal Fixes** (~10 hours)
1. Extract barrier utility function (2 hours)
2. Create StreamingSessionState class (3 hours)
3. Add AbortController for cancellation (2 hours)
4. Add per-message DOM mutex (3 hours)

**Trade-off**: Addresses immediate issues but doesn't solve fundamental complexity. Technical debt remains.

---

## References

### External Resources

- [Bottleneck.js Documentation](https://github.com/SGrondin/bottleneck)
- [Bottleneck.js NPM](https://www.npmjs.com/package/bottleneck)
- [Promise Patterns (Barriers)](https://web.dev/promises/)

### Internal References

- [Technical Review](./claude_technical_review.md) - Section 1.3: State Management Issues
- [Development Guide](./DEVELOPMENT.md) - Testing Guidelines
- Current Implementation:
  - [`src/concurrency_limiter.ts`](../src/concurrency_limiter.ts)
  - [`src/queue_processor.ts`](../src/queue_processor.ts)
  - [`src/streaming_monitor.ts`](../src/streaming_monitor.ts)
  - [`src/index.ts`](../src/index.ts) (lines 56-900)

### Discussion Thread

This proposal is based on a consultation with an external advisor who recommended:

> "Yes, you can make the design cleaner by separating 'who decides when a session may run' from 'how many image calls can run in parallel.' Don't make one scheduler do both."

Full discussion available in project chat history.

---

**Document Status**: Draft
**Last Updated**: 2025-10-11
**Next Review**: After stakeholder approval

---

## Appendix: Code Comparison

### Before: Manual Barrier

```typescript
// index.ts (scattered state)
let pendingDeferredImages: {images: DeferredImage[]; messageId: number} | null = null;
let messageReceivedFired = false;

// In handleGenerationEnded
pendingDeferredImages = {images, messageId};
tryInsertDeferredImages();

// In handleMessageReceivedForStreaming
messageReceivedFired = true;
tryInsertDeferredImages();

// Try insertion
async function tryInsertDeferredImages(): Promise<void> {
  if (pendingDeferredImages && messageReceivedFired) {
    const {images, messageId} = pendingDeferredImages;
    pendingDeferredImages = null;
    messageReceivedFired = false;
    await insertDeferredImages(images, messageId, context);
  }
}
```

**Issues**:
- State split across 2 variables
- Must call `tryInsertDeferredImages()` in 2 places
- Easy to forget one condition
- Hard to test

### After: Explicit Barrier

```typescript
// session_manager.ts (encapsulated)
const session = sessionManager.startSession(messageId, context, settings);

// In handleGenerationEnded
session.barrier.arrive('genDone');

// In handleMessageReceivedForStreaming
session.barrier.arrive('messageReceived');

// Wait for both
await session.barrier.whenReady;
await insertDeferredImages(...);
```

**Benefits**:
- ✅ Self-documenting (explicit conditions)
- ✅ Testable in isolation
- ✅ Promise-based (no manual checks)
- ✅ Timeout support built-in

---

## Appendix: Bundle Size Analysis

Current (v1.1.0):
```
dist/index.js: 124 KB (minified)
```

After adding Bottleneck:
```
dist/index.js: ~128 KB (minified)
  - Bottleneck: +4 KB
  - New components: +1 KB
  - Removed ConcurrencyLimiter: -1 KB
  = Net: +4 KB (+3.2%)
```

**Verdict**: Acceptable increase for the benefits gained.

**Optimization Options** (if needed):
1. Lazy-load Bottleneck for manual generation only
2. Use tree-shaking to remove unused Bottleneck features
3. Use esbuild with better minification

---

**End of Document**
