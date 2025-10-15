Design Document: Unified Image Generation and Batch Insertion Refactor

## 1) Summary

- Unify **streaming** and **click-to-regenerate** modes behind a single, per-message generation pipeline
- Use one global Bottleneck limiter for generation, one queue/processor per message, and one batch insertion function that writes message text exactly once
- Replace Barrier-based coordination with **explicit await conditions**: monitor stopped + totals sealed, then all tasks complete
- Preserve immediate visual feedback via Progress widget's thumbnail previews for both modes
- Leverage new `regex_v2.ts` and `prompt_manager.ts` modules for robust prompt handling and image association tracking

## 2) Goals

- **One shared generation pipeline** for streaming and regeneration
- **One shared batch insertion function** (`insertDeferredImages`) safe to call only when message text is finalized
- **One coordinator per message** (SessionManager) that manages queue, progress, and insertion timing
- **Deterministic insertion timing**:
  - Streaming: insert when monitor stopped AND all tasks complete (explicit await)
  - Regeneration: insert when all regenerations complete (explicit await)
- **Per-message progress tracking** for both modes (user can queue multiple regenerations in same message)
- **Reduce duplicated code** and scattered progress logic
- **Remove Barrier** - use explicit condition checks instead

## 3) Non-Goals

- Changing the image generation backend or global rate limiter (Bottleneck remains)
- Changing prompt detection patterns or preset management
- Changing Progress/Gallery widget visuals beyond enabling previews for both modes
- Supporting batch manual append/replace operations (removed for simplicity - only streaming + regeneration)
- Supporting hybrid sessions (streaming and regeneration are mutually exclusive)

## 4) Current State

### Streaming
- `StreamingMonitor` detects prompts into `ImageGenerationQueue`
- `QueueProcessor` generates images and defers insertion; emits progress events
- `Barrier` waits for `genDone` + `messageReceived` before insertion
- Uses old prompt metadata tracking (`imageUrlToPromptId`)

### Manual/Regeneration
- `manual_generation.ts` has its own loops and per-image insertion
- Duplicate progress tracking logic
- No unified progress widget integration

### DOM writes
- `scheduleDomOperation` serializes DOM per message, but usage is inconsistent

### Prompt Handling
- Mix of inline regex patterns and centralized utilities
- Old `prompt_metadata.ts` for tracking associations

## 5) Problems

- **Duplication**: extraction → generation → progress → insertion logic repeated across modes
- **Scattered progress updates** across multiple modules
- **Two insertion patterns** (per-image vs batch) create race risks and complexity
- **Barrier semantics ambiguous**: `genDone` reads like "generation done" but actually means "queue sealed"
- **No regeneration progress tracking**: can't queue multiple regenerations per message
- **Inconsistent prompt tracking**: mix of old and new metadata systems

## 6) Proposed Architecture

### Core Principle: Unified Per-Message Pipeline

Both streaming and regeneration use the same infrastructure:

- **One `ImageGenerationQueue` per message** (streaming prompts OR regeneration requests)
- **One `QueueProcessor` per message** (schedules generation, accumulates DeferredImages, emits events)
- **One `ProgressManager` track per message** (shows all operations: streaming + regenerations)
- **One `insertDeferredImages()` call** when all tasks complete (atomic batch insertion)
- **Explicit await conditions** instead of Barrier

### Session Types (Mutually Exclusive)

A message can have:
1. **Streaming session** (while AI is streaming) - user cannot click regenerate
2. **Regeneration session** (user clicks images on finalized message) - can queue multiple
3. **No session** (idle state)

### Integration with New Modules

- **`regex_v2.ts`**: All prompt detection via `extractImagePromptsMultiPattern(text, patterns)`
- **`prompt_manager.ts`**: All prompt tracking and image associations
  - `detectPromptsInMessage()` during streaming
  - `linkImageToPrompt()` after insertion
  - `getPromptForImage()` for regeneration lookups
  - `PromptNode` as single source of truth for prompt state

## 7) Detailed Design

### 7.1 Types (src/types.ts)

#### New/Updated Types

```typescript
// Session type (mutually exclusive)
type SessionType = 'streaming' | 'regeneration';

// Image insertion modes (3 modes total)
type ImageInsertionMode =
  | 'replace-image'        // Replace existing image (default for regeneration)
  | 'append-after-image'   // Append after existing image (regeneration variant)
  | 'append-after-prompt'; // Append after prompt tag (streaming default)

// Updated QueuedPrompt (no isRegeneration flag - infer from targetImageUrl)
interface QueuedPrompt {
  id: string;
  prompt: string;
  fullMatch: string;
  startIndex: number;
  endIndex: number;
  state: PromptState;
  imageUrl?: string;
  error?: string;
  attempts: number;
  detectedAt: number;
  generationStartedAt?: number;
  completedAt?: number;

  // Regeneration metadata (presence indicates regeneration)
  targetImageUrl?: string;     // Which image to replace
  targetPromptId?: string;     // Prompt being regenerated (links to PromptNode.id)
  insertionMode?: ImageInsertionMode;  // Default: 'replace-image'
}

// DeferredImage with promptId link
interface DeferredImage {
  prompt: QueuedPrompt;
  imageUrl: string;
  promptId: string;            // Links to PromptNode.id
  promptPreview?: string;
  completedAt: number;
}

// Simplified StreamingSession (no Barrier, no hybrid)
interface StreamingSession {
  sessionId: string;
  messageId: number;
  type: SessionType;           // 'streaming' | 'regeneration'

  // Shared components
  queue: ImageGenerationQueue;
  processor: QueueProcessor;
  abortController: AbortController;

  // Streaming-only (undefined for regeneration)
  monitor?: StreamingMonitor;

  // Metadata
  startedAt: number;
}
```

#### Existing Types (Unchanged)

- `PromptState`, `ImagePromptMatch`, `StyleTagPosition`, `PromptPosition` (unchanged)

### 7.2 Image Generation and Insertion (src/image_generator.ts)

#### Existing Functions (Keep)

```typescript
// Limiter APIs
initializeConcurrencyLimiter(maxConcurrent: number, minInterval = 0): void
updateMaxConcurrent(maxConcurrent: number): void
updateMinInterval(minInterval: number): void

// Generation
generateImage(
  prompt: string,
  context: SillyTavernContext,
  commonTags?: string,
  tagsPosition?: 'prefix' | 'suffix',
  signal?: AbortSignal
): Promise<string | null>
```

#### Updated Batch Insertion

```typescript
/**
 * Inserts deferred images into message text
 *
 * Handles both new images (streaming) and regenerations atomically.
 * Uses prompt_manager.ts for image associations.
 * Uses regex_v2.ts for prompt detection.
 *
 * @param deferredImages - Images to insert
 * @param messageId - Message ID
 * @param context - SillyTavern context
 * @param metadata - Auto-illustrator metadata
 * @returns Number of images inserted
 */
async function insertDeferredImages(
  deferredImages: DeferredImage[],
  messageId: number,
  context: SillyTavernContext,
  metadata: AutoIllustratorChatMetadata
): Promise<number> {
  const message = context.chat[messageId];
  if (!message) {
    logger.warn(`Message ${messageId} not found, skipping insertion`);
    return 0;
  }

  let updatedText = message.mes;
  const patterns = context.extensionSettings.auto_illustrator.promptDetectionPatterns;

  for (const deferred of deferredImages) {
    const queuedPrompt = deferred.prompt;

    // REGENERATION (targetImageUrl present)
    if (queuedPrompt.targetImageUrl) {
      const mode = queuedPrompt.insertionMode || 'replace-image';
      const targetUrl = queuedPrompt.targetImageUrl;
      const newImgTag = `<img src="${deferred.imageUrl}" alt="${escapeHtmlAttribute(deferred.promptPreview || '')}" title="${escapeHtmlAttribute(deferred.promptPreview || '')}">`;

      if (mode === 'replace-image') {
        // Replace existing <img> tag
        const imgPattern = `<img[^>]*src="${escapeRegexSpecialChars(targetUrl)}"[^>]*>`;
        updatedText = updatedText.replace(
          new RegExp(imgPattern, 'g'),
          newImgTag
        );
      } else if (mode === 'append-after-image') {
        // Insert after existing <img> tag
        const imgPattern = `(<img[^>]*src="${escapeRegexSpecialChars(targetUrl)}"[^>]*>)`;
        updatedText = updatedText.replace(
          new RegExp(imgPattern, 'g'),
          `$1\n${newImgTag}`
        );
      }

      // Link new image to prompt (may replace old association)
      linkImageToPrompt(queuedPrompt.targetPromptId!, deferred.imageUrl, metadata);

    } else {
      // NEW IMAGE (streaming)
      // Extract prompts to find position
      const matches = extractImagePromptsMultiPattern(updatedText, patterns);

      if (queuedPrompt.startIndex >= 0 && queuedPrompt.startIndex < matches.length) {
        const match = matches[queuedPrompt.startIndex];
        const insertPosition = match.endIndex;
        const newImgTag = `\n<img src="${deferred.imageUrl}" alt="${escapeHtmlAttribute(deferred.promptPreview || '')}" title="${escapeHtmlAttribute(deferred.promptPreview || '')}">`;

        updatedText =
          updatedText.substring(0, insertPosition) +
          newImgTag +
          updatedText.substring(insertPosition);

        // Link image to prompt
        linkImageToPrompt(deferred.promptId, deferred.imageUrl, metadata);
      }
    }
  }

  // Single atomic write
  message.mes = updatedText;
  await context.saveChat();

  // Emit events for UI updates
  context.eventSource.emit(context.event_types.MESSAGE_EDITED, messageId);
  context.eventSource.emit(context.event_types.MESSAGE_UPDATED, messageId);

  return deferredImages.length;
}
```

#### Remove

- `replacePromptsWithImages()` - replaced by unified flow
- `insertImageAfterPrompt()` - absorbed into `insertDeferredImages()`

### 7.3 Per-Message Processor (src/queue_processor.ts)

**No major changes needed** - already queue-agnostic

```typescript
class QueueProcessor {
  constructor(queue: IImageGenerationQueue, settings: AutoIllustratorSettings, maxConcurrent?: number)

  start(messageId: number): void
  stop(): void
  trigger(): void

  // Key methods
  processRemaining(): Promise<void>  // Drain all pending prompts
  waitUntilIdle(timeoutMs?: number, signal?: AbortSignal): Promise<void>

  getDeferredImages(): DeferredImage[]
  clearDeferredImages(): void
  getStatus(): { ... }
}
```

**Key Points:**
- Emits `image-completed` for progress widget previews
- Emits progress via `ProgressManager` internally
- No Barrier dependency

### 7.4 Queues (src/streaming_image_queue.ts)

**Keep Only `ImageGenerationQueue`** - used for BOTH streaming and regeneration

```typescript
class ImageGenerationQueue implements IImageGenerationQueue {
  addPrompt(
    prompt: string,
    fullMatch: string,
    startIndex: number,
    endIndex: number,
    metadata?: {  // Optional regeneration metadata
      targetImageUrl?: string;
      targetPromptId?: string;
      insertionMode?: ImageInsertionMode;
    }
  ): QueuedPrompt | null

  hasPrompt(prompt: string, startIndex: number): boolean
  hasPromptByText(prompt: string): boolean
  getNextPending(): QueuedPrompt | null
  updateState(id: string, state: PromptState, data?: {...}): void
  size(): number
  getPromptsByState(state: PromptState): QueuedPrompt[]
  getStats(): { total, queued, generating, completed, failed }
}
```

**Remove:**
- `StaticPromptQueue` - not needed without batch manual operations

### 7.5 Progress Tracking (src/progress_manager.ts)

**Add Wait Helper**

```typescript
class ProgressManager extends EventTarget {
  // Existing methods (unchanged)
  registerTask(messageId: number, incrementBy = 1): number
  updateTotal(messageId: number, newTotal: number): void
  isTracking(messageId: number): boolean
  completeTask(messageId: number): void
  failTask(messageId: number): void
  decrementTotal(messageId: number, decrementBy = 1): void
  clear(messageId: number): void
  emitImageCompleted(messageId, imageUrl, promptText, promptPreview): void

  // NEW: Wait for all tasks to complete
  waitAllComplete(
    messageId: number,
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const track = this.tracks.get(messageId);
      if (!track) {
        resolve(); // No tracking = already complete
        return;
      }

      if (track.completed >= track.total) {
        resolve(); // Already complete
        return;
      }

      // Listen for status updates
      const checkComplete = () => {
        const current = this.tracks.get(messageId);
        if (!current || current.completed >= current.total) {
          cleanup();
          resolve();
        }
      };

      const onTimeout = () => {
        cleanup();
        reject(new Error(`Timeout waiting for message ${messageId} tasks to complete`));
      };

      const onAbort = () => {
        cleanup();
        reject(new Error(`Aborted waiting for message ${messageId}`));
      };

      const cleanup = () => {
        this.removeEventListener('status-update', checkComplete);
        if (timer) clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
      };

      this.addEventListener('status-update', checkComplete);

      let timer: NodeJS.Timeout | null = null;
      if (options?.timeoutMs) {
        timer = setTimeout(onTimeout, options.timeoutMs);
      }

      const signal = options?.signal;
      if (signal) {
        if (signal.aborted) {
          cleanup();
          reject(new Error('Already aborted'));
          return;
        }
        signal.addEventListener('abort', onAbort);
      }
    });
  }
}
```

### 7.6 Per-Message Coordination (src/session_manager.ts)

**Expanded for Streaming + Regeneration**

```typescript
class SessionManager {
  private sessions: Map<number, StreamingSession>;
  private regenerationTimers: Map<number, NodeJS.Timeout>;  // Auto-finalize timers

  //==========================================================================
  // Streaming
  //==========================================================================

  async startStreamingSession(
    messageId: number,
    context: SillyTavernContext,
    settings: AutoIllustratorSettings
  ): StreamingSession {
    // Cancel any existing session
    this.cancelSession(messageId);

    const session: StreamingSession = {
      sessionId: generateSessionId(),
      messageId,
      type: 'streaming',
      queue: new ImageGenerationQueue(),
      processor: new QueueProcessor(queue, settings),
      monitor: new StreamingMonitor(queue, settings, ...),
      abortController: new AbortController(),
      startedAt: Date.now(),
    };

    this.sessions.set(messageId, session);

    // Start monitoring and processing
    session.monitor.start(messageId);
    session.processor.start(messageId);

    return session;
  }

  async finalizeStreamingAndInsert(
    messageId: number,
    context: SillyTavernContext
  ): Promise<number> {
    const session = this.getSession(messageId);
    if (!session || session.type !== 'streaming') {
      logger.warn(`No streaming session for message ${messageId}`);
      return 0;
    }

    // EXPLICIT CONDITION 1: Stop monitor and seal totals
    session.monitor!.stop();
    const finalTotal = session.queue.size();
    progressManager.updateTotal(messageId, finalTotal);
    logger.info(`Streaming stopped, sealed ${finalTotal} prompts for message ${messageId}`);

    // EXPLICIT CONDITION 2: Wait for all tasks to complete
    logger.info(`Waiting for ${finalTotal} tasks to complete for message ${messageId}`);
    await session.processor.processRemaining();
    await progressManager.waitAllComplete(messageId, {
      timeoutMs: 300000, // 5 minute timeout
      signal: session.abortController.signal,
    });

    // Batch insertion
    const deferred = session.processor.getDeferredImages();
    const metadata = getAutoIllustratorMetadata(context);

    const insertedCount = await scheduleDomOperation(messageId, async () => {
      return insertDeferredImages(deferred, messageId, context, metadata);
    }, 'streaming-insertion');

    // Cleanup
    progressManager.clear(messageId);
    this.endSession(messageId);

    logger.info(`Inserted ${insertedCount} images for message ${messageId}`);
    return insertedCount;
  }

  //==========================================================================
  // Regeneration
  //==========================================================================

  async queueRegeneration(
    messageId: number,
    promptId: string,
    imageUrl: string,
    context: SillyTavernContext,
    settings: AutoIllustratorSettings,
    mode: ImageInsertionMode = 'replace-image'
  ): Promise<void> {
    // Get or create regeneration session
    let session = this.getSession(messageId);

    if (!session) {
      // Create new regeneration session
      session = {
        sessionId: generateSessionId(),
        messageId,
        type: 'regeneration',
        queue: new ImageGenerationQueue(),
        processor: new QueueProcessor(queue, settings),
        abortController: new AbortController(),
        startedAt: Date.now(),
      };
      this.sessions.set(messageId, session);
      session.processor.start(messageId);
    }

    if (session.type !== 'regeneration') {
      throw new Error(`Cannot queue regeneration - message ${messageId} has ${session.type} session`);
    }

    // Get prompt details from prompt_manager
    const metadata = getAutoIllustratorMetadata(context);
    const promptNode = getPromptNode(promptId, metadata);

    if (!promptNode) {
      throw new Error(`Prompt node not found: ${promptId}`);
    }

    // Add to queue with regeneration metadata
    session.queue.addPrompt(
      promptNode.text,
      '',  // fullMatch not needed for regeneration
      0,   // startIndex not needed
      0,   // endIndex not needed
      {
        targetImageUrl: imageUrl,
        targetPromptId: promptId,
        insertionMode: mode,
      }
    );

    // Track progress
    progressManager.registerTask(messageId, 1);
    logger.info(`Queued regeneration for prompt ${promptId} in message ${messageId}`);

    // Trigger processing
    session.processor.trigger();

    // Auto-finalize after 2s idle (debounced)
    this.scheduleAutoFinalize(messageId, context);
  }

  private scheduleAutoFinalize(messageId: number, context: SillyTavernContext) {
    // Clear existing timer
    const existingTimer = this.regenerationTimers.get(messageId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new timer (2s idle → auto-finalize)
    const timer = setTimeout(() => {
      this.finalizeRegenerationAndInsert(messageId, context);
    }, 2000);

    this.regenerationTimers.set(messageId, timer);
  }

  async finalizeRegenerationAndInsert(
    messageId: number,
    context: SillyTavernContext
  ): Promise<number> {
    const session = this.getSession(messageId);
    if (!session || session.type !== 'regeneration') {
      logger.warn(`No regeneration session for message ${messageId}`);
      return 0;
    }

    // Clear auto-finalize timer
    const timer = this.regenerationTimers.get(messageId);
    if (timer) {
      clearTimeout(timer);
      this.regenerationTimers.delete(messageId);
    }

    // Wait for all regenerations to complete
    logger.info(`Waiting for regenerations to complete for message ${messageId}`);
    await session.processor.processRemaining();
    await progressManager.waitAllComplete(messageId, {
      timeoutMs: 300000,
      signal: session.abortController.signal,
    });

    // Batch insertion
    const deferred = session.processor.getDeferredImages();
    const metadata = getAutoIllustratorMetadata(context);

    const insertedCount = await scheduleDomOperation(messageId, async () => {
      return insertDeferredImages(deferred, messageId, context, metadata);
    }, 'regeneration-insertion');

    // Cleanup
    progressManager.clear(messageId);
    this.endSession(messageId);

    logger.info(`Regenerated ${insertedCount} images for message ${messageId}`);
    return insertedCount;
  }

  //==========================================================================
  // Lifecycle
  //==========================================================================

  cancelSession(messageId: number): void {
    const session = this.getSession(messageId);
    if (!session) return;

    session.abortController.abort();
    session.processor.stop();
    if (session.monitor) {
      session.monitor.stop();
    }

    progressManager.clear(messageId);
    this.sessions.delete(messageId);

    // Clear regeneration timer if exists
    const timer = this.regenerationTimers.get(messageId);
    if (timer) {
      clearTimeout(timer);
      this.regenerationTimers.delete(messageId);
    }

    logger.info(`Cancelled session for message ${messageId}`);
  }

  endSession(messageId: number): void {
    this.sessions.delete(messageId);
  }

  getSession(messageId: number): StreamingSession | null {
    return this.sessions.get(messageId) || null;
  }

  getAllSessions(): StreamingSession[] {
    return Array.from(this.sessions.values());
  }

  isActive(messageId?: number): boolean {
    if (messageId !== undefined) {
      return this.sessions.has(messageId);
    }
    return this.sessions.size > 0;
  }

  getStatus(): { ... } {
    // Return summary of all sessions
  }
}
```

### 7.7 Streaming Monitor (src/streaming_monitor.ts)

**Remove Barrier Dependency**

```typescript
class StreamingMonitor {
  constructor(
    queue: IImageGenerationQueue,
    settings: AutoIllustratorSettings,
    pollIntervalMs: number,
    onPromptsDetected: () => void  // Callback when new prompts detected
  )

  start(messageId: number): void
  stop(): void
  isActive(): boolean

  // Internal: on each poll
  private async checkForNewPrompts(): Promise<void> {
    // Extract prompts using regex_v2
    const patterns = this.settings.promptDetectionPatterns;
    const matches = extractImagePromptsMultiPattern(messageText, patterns);

    // Add new prompts to queue
    for (const match of matches) {
      if (!queue.hasPrompt(match.prompt, match.startIndex)) {
        queue.addPrompt(match.prompt, match.fullMatch, match.startIndex, match.endIndex);
      }
    }

    // Update totals
    const newTotal = queue.size();
    if (firstTime) {
      progressManager.registerTask(messageId, newTotal);
    } else {
      progressManager.updateTotal(messageId, newTotal);
    }

    // Trigger callback
    this.onPromptsDetected();
  }
}
```

**Key Changes:**
- No Barrier usage
- Uses `regex_v2.extractImagePromptsMultiPattern()`
- Callback to trigger processor instead of Barrier.arrive()

### 7.8 DOM Queue (src/dom_queue.ts)

**Unchanged** - still used to serialize DOM operations per message

```typescript
scheduleDomOperation(messageId: number, operation: () => Promise<T>, label?: string): Promise<T>
```

### 7.9 Manual Generation UI (src/manual_generation.ts)

**Simplified - Remove Batch Operations, Keep Click-to-Regenerate Only**

```typescript
// REMOVE all batch append/replace functions:
// - handleManualGeneration()
// - generateAndInsertSingleImage()
// - Custom generation loops

// KEEP ONLY: Click handlers for regeneration

/**
 * Handle click on image to regenerate
 */
async function handleImageRegenerationClick(
  imageUrl: string,
  messageId: number,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings,
  mode: ImageInsertionMode = 'replace-image'
): Promise<void> {
  // Get prompt from image using prompt_manager
  const metadata = getAutoIllustratorMetadata(context);
  const promptNode = getPromptForImage(imageUrl, metadata);

  if (!promptNode) {
    toastr.error('Cannot find prompt for this image');
    return;
  }

  // Queue regeneration
  await sessionManager.queueRegeneration(
    messageId,
    promptNode.id,
    imageUrl,
    context,
    settings,
    mode
  );

  toastr.info(`Regenerating image for: ${promptNode.text.substring(0, 50)}...`);
}

/**
 * Attach click handlers to images in message
 */
function attachRegenerationHandlers(messageId: number): void {
  const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageEl) return;

  const images = messageEl.querySelectorAll('img[src^="http"]');
  images.forEach(img => {
    img.style.cursor = 'pointer';
    img.title = 'Click to regenerate';
    img.addEventListener('click', (e) => {
      e.preventDefault();
      const imageUrl = (e.target as HTMLImageElement).src;
      handleImageRegenerationClick(imageUrl, messageId, context, settings);
    });
  });
}
```

## 8) Control Flow

### 8.1 Streaming Message

```
STREAM_TOKEN_STARTED event
  → sessionManager.startStreamingSession(messageId, context, settings)
  → Creates session with queue, processor, monitor
  → Monitor starts polling for prompts
  → As prompts detected:
    - extractImagePromptsMultiPattern(text, patterns)  // regex_v2
    - queue.addPrompt(...)
    - progressManager.registerTask() or updateTotal()
    - processor.trigger()
  → Processor generates images:
    - emits 'image-completed' → progress widget shows thumbnail
    - progressManager.completeTask()

MESSAGE_RECEIVED event
  → sessionManager.finalizeStreamingAndInsert(messageId, context)

  // EXPLICIT CONDITION 1: Stop monitor and seal totals
  → monitor.stop()
  → finalTotal = queue.size()
  → progressManager.updateTotal(messageId, finalTotal)

  // EXPLICIT CONDITION 2: Wait for all tasks complete
  → await processor.processRemaining()
  → await progressManager.waitAllComplete(messageId)

  // Batch insertion
  → deferred = processor.getDeferredImages()
  → scheduleDomOperation(messageId, () => {
      return insertDeferredImages(deferred, messageId, context, metadata);
    })
  → For each image: linkImageToPrompt(promptId, imageUrl, metadata)  // prompt_manager

  // Cleanup
  → progressManager.clear(messageId)
  → sessionManager.endSession(messageId)
```

### 8.2 Regeneration (Single Image)

```
User clicks image
  → handleImageRegenerationClick(imageUrl, messageId, context, settings)
  → promptNode = getPromptForImage(imageUrl, metadata)  // prompt_manager lookup
  → sessionManager.queueRegeneration(messageId, promptNode.id, imageUrl, ...)

  // Queue regeneration
  → session = getOrCreateSession(messageId, 'regeneration')
  → queue.addPrompt(promptNode.text, ..., {
      targetImageUrl: imageUrl,
      targetPromptId: promptNode.id,
      insertionMode: 'replace-image'
    })
  → progressManager.registerTask(messageId, 1)
  → processor.trigger()

  // Auto-finalize after 2s idle
  → scheduleAutoFinalize(messageId, context)  // Debounced timer

  // After 2s (if no more clicks)
  → finalizeRegenerationAndInsert(messageId, context)
  → await processor.processRemaining()
  → await progressManager.waitAllComplete(messageId)
  → scheduleDomOperation → insertDeferredImages(...)
    - Detects targetImageUrl → applies 'replace-image' mode
    - Replaces <img> tag in message text
    - linkImageToPrompt(promptNode.id, newImageUrl, metadata)
  → progressManager.clear(messageId)
  → endSession(messageId)
```

### 8.3 Regeneration (Multiple Images in Same Message)

```
User clicks image 1
  → queueRegeneration(messageId, promptId1, imageUrl1, ...)
  → session created, promptId1 added to queue
  → progressManager shows "1 pending"
  → Auto-finalize timer starts (2s)

User clicks image 2 (within 2s)
  → queueRegeneration(messageId, promptId2, imageUrl2, ...)
  → REUSES existing session, promptId2 added to queue
  → progressManager shows "1 generating, 1 pending" or "2 pending"
  → Auto-finalize timer RESETS (2s from now)

Processor generates both
  → Each completion emits 'image-completed' → progress widget thumbnails
  → progressManager.completeTask() for each

After 2s idle (no more clicks)
  → finalizeRegenerationAndInsert()
  → Single insertDeferredImages() applies BOTH regenerations atomically
  → Both images replaced in message text in one write
  → Both linkImageToPrompt() calls update associations
```

## 9) Error Handling, Cancellation, and Cleanup

### Cancellation

**Session cancel** (chat change or explicit):
- `abortController.abort()` for the session
- Stop monitor (if streaming) and processor
- **Do not insert** - discard deferred images
- `progressManager.clear(messageId)`

### Timeouts

**`progressManager.waitAllComplete()` timeout**:
- Default 5 minutes to prevent hanging
- On timeout: skip insertion, clear progress, log error

### Partial Failures

- If some images fail, batch insertion still proceeds with successful ones
- Failed prompts: streaming keeps tag, regeneration keeps old image

### Message Deleted

- Before batch insertion, check message exists
- If missing, skip insertion and clear session

## 10) Concurrency and Rate Limiting

- **Global Bottleneck limiter** remains single control point
- `QueueProcessor.maxConcurrent` enforced per-message
- `processRemaining()` ensures sequential drain when needed
- DOM serialization via `scheduleDomOperation` ensures atomic write per message

## 11) UI/UX Implications

### Progress Widget

Shows thumbnails for **both modes**:
- **Streaming**: "Generating 3/5 images..." with live thumbnails as they complete
- **Regeneration**: "Regenerating 2/2 images..." with thumbnails
- All tracked per-message, unified experience

### Inline Images

- **Streaming**: Appear after message finalized (batch insertion)
- **Regeneration**: Appear after 2s idle timer (batch insertion)
- **Previews**: Available immediately in progress widget for both modes

### User Feedback

- Toast notifications for regeneration queue/complete
- Progress widget always visible during operations
- Click-to-regenerate visual cues (cursor: pointer, hover tooltip)

## 12) Integration with New Modules

### regex_v2.ts

**All prompt detection** via:
```typescript
extractImagePromptsMultiPattern(text: string, patterns: string[]): ImagePromptMatch[]
```

**Regex utilities**:
- `escapeRegexSpecialChars(str)` - for safe pattern construction
- `escapeHtmlAttribute(str)` - for safe attribute values
- `createCombinedPromptRegex(patterns)` - for combined matching

### prompt_manager.ts

**During streaming** (prompt detection):
```typescript
const nodes = detectPromptsInMessage(messageId, messageText, patterns, metadata);
// Returns PromptNode[] - already registered in promptRegistry
```

**After insertion** (link images):
```typescript
linkImageToPrompt(promptId: string, imageUrl: string, metadata);
// Updates: node.generatedImages[] and registry.imageToPromptId
```

**For regeneration** (lookup):
```typescript
const promptNode = getPromptForImage(imageUrl: string, metadata);
// O(1) lookup via registry.imageToPromptId
```

**Metadata storage**:
- All associations in `metadata.promptRegistry`
- `PromptNode` as single source of truth
- Tree structure for refinement history (future)

## 13) Logging and Telemetry

### Structured Logs

```typescript
// Streaming
logger.info(`Streaming started for message ${messageId}`);
logger.info(`Monitor detected ${newTotal} prompts`);
logger.info(`Streaming stopped, sealed ${finalTotal} prompts`);
logger.info(`Waiting for ${finalTotal} tasks to complete`);
logger.info(`Inserted ${count} images for message ${messageId}`);

// Regeneration
logger.info(`Queued regeneration for prompt ${promptId} in message ${messageId}`);
logger.info(`Regenerated ${count} images for message ${messageId}`);

// Progress
logger.debug(`Progress: ${completed}/${total} for message ${messageId}`);
logger.debug(`Image completed: ${imageUrl} (prompt: ${promptPreview})`);
```

### Remove Barrier Logs

- No more "genDone arrived", "messageReceived arrived" logs
- Clearer explicit condition logs instead

## 14) Testing Plan

### Unit Tests

**QueueProcessor**:
- `waitUntilIdle()` and `processRemaining()` with `maxConcurrent > 1`
- Abort signal handling during processing

**ProgressManager**:
- `waitAllComplete()` correctness (immediate, delayed, never-complete)
- Timeout handling
- Cancellation via AbortSignal
- Multiple concurrent waiters

**insertDeferredImages**:
- Streaming mode (append-after-prompt)
- Regeneration mode (replace-image, append-after-image)
- Mixed batch (streaming + regeneration together)
- Metadata recording via `linkImageToPrompt()`

**SessionManager**:
- `finalizeStreamingAndInsert()` end-to-end
- `queueRegeneration()` with multiple clicks
- Auto-finalize timer debouncing
- Session lifecycle (create, cancel, end)

**Streaming**:
- Late prompt detection (just before MESSAGE_RECEIVED)
- Totals sealed correctly, all images inserted

**Cancellation**:
- Active jobs aborted
- No insertion occurs
- Progress cleared

### Integration/Manual Tests

- Concurrency limits honored across multiple messages
- Multiple concurrent streaming sessions remain isolated
- Regeneration replaces correct image
- DOM re-render occurs consistently
- Progress widget shows accurate status for both modes

## 15) Migration Plan

### Phase 1: Types and Interfaces (DONE)
- ✅ Already have `regex_v2.ts`
- ✅ Already have `prompt_manager.ts`
- Add `ImageInsertionMode`, `SessionType`
- Update `QueuedPrompt` with regeneration fields

### Phase 2: Processor Improvements
- Add `ProgressManager.waitAllComplete()`
- Remove Barrier dependency from QueueProcessor

### Phase 3: SessionManager Expansion
- Add `queueRegeneration()` and `finalizeRegenerationAndInsert()`
- Implement auto-finalize timer logic
- Update `startStreamingSession()` and `finalizeStreamingAndInsert()` to use explicit awaits

### Phase 4: Batch Insertion
- Extend `insertDeferredImages()` to support regeneration modes
- Use `prompt_manager.linkImageToPrompt()` for all associations
- Use `regex_v2.extractImagePromptsMultiPattern()` for prompt detection

### Phase 5: UI Handlers
- Update `manual_generation.ts` to use `sessionManager.queueRegeneration()`
- Remove batch append/replace functions
- Add click handlers for regeneration

### Phase 6: Cleanup
- Remove `src/barrier.ts`
- Remove all Barrier usage from codebase
- Remove old batch operation code

### Phase 7: Tests and Docs
- Add unit tests for new functionality
- Update PRD to reflect unified flow
- Update this design doc as implementation guide

## 16) Removals

### Files
- `src/barrier.ts` - Barrier class (replaced with explicit awaits)

### Functions
- `image_generator.ts`:
  - `replacePromptsWithImages()` - replaced by `sessionManager` flows
  - `insertImageAfterPrompt()` - absorbed into `insertDeferredImages()`

- `manual_generation.ts`:
  - `handleManualGeneration()` - batch operations removed
  - `generateAndInsertSingleImage()` - per-image insertion removed
  - All custom generation loops

- `queue_processor.ts`:
  - All Barrier usage and `arrive('genDone')` calls

- `session_manager.ts`:
  - All Barrier references in `StreamingSession` interface

## 17) Renames and File Organization

### Optional Naming Tweaks
- `progress_manager.emitImageCompleted()` → `emitImagePreviewCompleted()` (clarifies UI purpose)
- `streaming_image_queue.ts` → `queues/image_generation_queue.ts` (organization)

### Keep As-Is
- `QueueProcessor`, `SessionManager`, `ProgressManager` - clear names
- `insertDeferredImages()` - accurately describes batch insertion
- `StreamingSession` - name still valid even though used for regeneration too

## 18) Open Questions

### Regeneration Finalization Strategy

**Current proposal**: Auto-finalize after 2s idle

**Alternatives**:
1. **Manual "Apply" button** - explicit user control, more clicks
2. **Immediate per-image insertion** - faster feedback, loses batching benefit
3. **Configurable delay** - user preference

**Recommendation**: Start with 2s auto-finalize, gather user feedback

### Progressive Insertion for Streaming

**Question**: Should streaming images appear progressively during generation?

**Current**: All appear in batch after MESSAGE_RECEIVED
**Alternative**: Insert each image as it completes (requires DOM queue handling)

**Recommendation**: Keep batch insertion for simplicity, consistency

## 19) Acceptance Criteria

✅ All generation modes use `QueueProcessor` and global Bottleneck
✅ `insertDeferredImages()` is the only code path that mutates message text with generated images
✅ Streaming insertion occurs only after monitor stopped AND all tasks complete (explicit awaits)
✅ Regeneration insertion occurs only after all regenerations complete (explicit await)
✅ Progress widget shows accurate totals and live previews for both modes
✅ Barrier file removed, no references remain
✅ All prompt detection uses `regex_v2.extractImagePromptsMultiPattern()`
✅ All image associations use `prompt_manager.linkImageToPrompt()`
✅ Regeneration lookup uses `prompt_manager.getPromptForImage()`
✅ Multiple regenerations in same message queued and inserted together
✅ Auto-finalize timer debouncing works correctly

## 20) Risks and Mitigations

**Risk**: 2s auto-finalize delay feels slow

**Mitigation**:
- Preview thumbnails appear immediately in progress widget
- Can adjust delay based on user feedback
- Can add manual "Apply" button if needed

**Risk**: Coordination bugs in first iteration

**Mitigation**:
- Explicit tests for totals sealed timing
- Idle wait tests with various scenarios
- Insertion gating tests (ensure conditions checked correctly)

**Risk**: Breaking existing streaming functionality

**Mitigation**:
- Incremental migration (keep old code until new tested)
- Feature flag for new unified flow
- Comprehensive integration tests

## 21) Effort Estimate

### Implementation
- Types/interfaces: 0.5d
- ProgressManager.waitAllComplete: 0.25d
- SessionManager regeneration methods: 0.5d
- insertDeferredImages regeneration support: 0.5d
- Remove Barrier, update streaming flow: 0.5d
- UI handlers for regeneration: 0.25d
- **Total: 2.5 days**

### Testing
- Unit tests: 1d
- Integration tests: 0.5d
- Manual testing: 0.5d
- **Total: 2 days**

### Documentation
- Update PRD: 0.5d
- Update this design doc: 0.5d (DONE)
- Code documentation: 0.5d
- **Total: 1.5 days**

**Grand Total: 6 days**

## 22) End-State API Quick Reference

```typescript
// types.ts
type SessionType = 'streaming' | 'regeneration';
type ImageInsertionMode = 'replace-image' | 'append-after-image' | 'append-after-prompt';

// image_generator.ts
initializeConcurrencyLimiter(maxConcurrent, minInterval?): void
generateImage(prompt, context, commonTags?, tagsPosition?, signal?): Promise<string | null>
insertDeferredImages(deferred, messageId, context, metadata): Promise<number>

// queue_processor.ts
class QueueProcessor {
  constructor(queue, settings, maxConcurrent?)
  start(messageId): void
  stop(): void
  trigger(): void
  processRemaining(): Promise<void>
  waitUntilIdle(timeoutMs?, signal?): Promise<void>
  getDeferredImages(): DeferredImage[]
  clearDeferredImages(): void
}

// progress_manager.ts
class ProgressManager extends EventTarget {
  registerTask(messageId, incrementBy?): number
  updateTotal(messageId, newTotal): void
  completeTask(messageId): void
  failTask(messageId): void
  clear(messageId): void
  emitImageCompleted(messageId, imageUrl, promptText, promptPreview): void
  waitAllComplete(messageId, options?): Promise<void>  // NEW
}

// session_manager.ts
class SessionManager {
  startStreamingSession(messageId, context, settings): StreamingSession
  finalizeStreamingAndInsert(messageId, context): Promise<number>
  queueRegeneration(messageId, promptId, imageUrl, context, settings, mode?): Promise<void>  // NEW
  finalizeRegenerationAndInsert(messageId, context): Promise<number>  // NEW
  cancelSession(messageId): void
  endSession(messageId): void
}

// regex_v2.ts (existing)
extractImagePromptsMultiPattern(text, patterns): ImagePromptMatch[]
escapeRegexSpecialChars(str): string
escapeHtmlAttribute(str): string

// prompt_manager.ts (existing)
detectPromptsInMessage(messageId, text, patterns, metadata): PromptNode[]
linkImageToPrompt(promptId, imageUrl, metadata): void
getPromptForImage(imageUrl, metadata): PromptNode | null
getPromptNode(promptId, metadata): PromptNode | null
```
