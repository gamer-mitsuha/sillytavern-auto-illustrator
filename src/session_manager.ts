/**
 * Session Manager Module
 * Unified coordinator for streaming and regeneration sessions
 *
 * Architecture:
 * - Single pipeline for both streaming and click-to-regenerate modes
 * - One GenerationSession per message (mutually exclusive types)
 * - Explicit await conditions instead of Barrier
 * - Auto-finalize regenerations when all tasks complete (event-driven)
 *
 * Session Lifecycle:
 * 1. Streaming: startStreamingSession → finalizeStreamingAndInsert → endSession
 * 2. Regeneration: queueRegeneration → (auto-finalize on progress:all-tasks-complete) → endSession
 */

import {ImageGenerationQueue} from './streaming_image_queue';
import {QueueProcessor} from './queue_processor';
import {StreamingMonitor} from './streaming_monitor_v2';
import {progressManager} from './progress_manager';
import {scheduleDomOperation} from './dom_queue';
import {createLogger} from './logger';
import type {GenerationSession, SessionType, ImageInsertionMode} from './types';
import {getMetadata} from './metadata';
import {getPromptNode} from './prompt_manager';

const logger = createLogger('SessionManager');

// Session ID counter for unique identification
let sessionIdCounter = 0;

/**
 * Generates a unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${++sessionIdCounter}`;
}

/**
 * Session Manager - Unified coordinator for streaming and regeneration
 */
export class SessionManager {
  private sessions: Map<number, GenerationSession> = new Map();
  private completionListeners: Map<number, (event: Event) => void> = new Map();

  //==========================================================================
  // Streaming Session Methods
  //==========================================================================

  /**
   * Starts a streaming session for a message
   * Creates queue, processor, and monitor for detecting prompts
   *
   * @param messageId - Message ID being streamed
   * @param context - SillyTavern context
   * @param settings - Extension settings
   * @returns The created streaming session
   */
  async startStreamingSession(
    messageId: number,
    _context: SillyTavernContext,
    settings: AutoIllustratorSettings
  ): Promise<GenerationSession> {
    // Check if session already exists - don't recreate it!
    // STREAM_TOKEN_RECEIVED fires multiple times, we only want one session
    const existingSession = this.getSession(messageId);
    if (existingSession && existingSession.type === 'streaming') {
      logger.trace(
        `Streaming session ${existingSession.sessionId} already exists for message ${messageId}, reusing it`
      );
      return existingSession;
    }

    // Cancel any other type of session for this message
    if (existingSession) {
      this.cancelSession(messageId);
    }

    // Create shared queue and processor
    const queue = new ImageGenerationQueue();
    const processor = new QueueProcessor(queue, settings);

    // Create monitor with callback to trigger processor
    const monitor = new StreamingMonitor(
      queue,
      settings,
      settings.monitorPollingInterval || 300,
      () => {
        // Callback: trigger processor when new prompts detected
        processor.trigger();
      }
    );

    // Create session
    const session: GenerationSession = {
      sessionId: generateSessionId(),
      messageId,
      type: 'streaming',
      queue,
      processor,
      monitor,
      abortController: new AbortController(),
      startedAt: Date.now(),
    };

    this.sessions.set(messageId, session);

    // Start monitoring and processing
    monitor.start(messageId);
    processor.start(messageId);

    logger.debug(
      `Streaming session ${session.sessionId} started for message ${messageId}`
    );

    return session;
  }

  /**
   * Finalizes streaming and inserts all deferred images
   * Uses explicit await conditions instead of Barrier
   *
   * Steps:
   * 1. Stop monitor and seal totals (EXPLICIT CONDITION 1)
   * 2. Wait for all tasks to complete (EXPLICIT CONDITION 2)
   * 3. Batch insert all deferred images
   * 4. Cleanup
   *
   * @param messageId - Message ID to finalize
   * @param context - SillyTavern context
   * @returns Number of images successfully inserted
   */
  async finalizeStreamingAndInsert(
    messageId: number,
    context: SillyTavernContext
  ): Promise<number> {
    const session = this.getSession(messageId);

    if (!session || session.type !== 'streaming') {
      logger.warn(
        `No streaming session found for message ${messageId}, cannot finalize`
      );
      return 0;
    }

    if (!session.monitor) {
      logger.error(
        `Streaming session ${session.sessionId} missing monitor, cannot finalize`
      );
      return 0;
    }

    logger.info(
      `Finalizing streaming session ${session.sessionId} for message ${messageId}`
    );

    try {
      // EXPLICIT CONDITION 1: Stop monitor and seal totals
      session.monitor.stop();
      const finalTotal = session.queue.size();
      progressManager.updateTotal(messageId, finalTotal);
      logger.info(
        `Monitor stopped, sealed ${finalTotal} prompts for message ${messageId}`
      );

      // EXPLICIT CONDITION 2: Wait for all tasks to complete
      logger.info(
        `Waiting for ${finalTotal} tasks to complete for message ${messageId}`
      );
      await session.processor.processRemaining();
      await progressManager.waitAllComplete(messageId, {
        timeoutMs: 300000, // 5 minute timeout
        signal: session.abortController.signal,
      });

      logger.info(`All tasks complete for message ${messageId}`);

      // Get deferred images for batch insertion
      const deferred = session.processor.getDeferredImages();

      if (deferred.length === 0) {
        logger.info(`No deferred images to insert for message ${messageId}`);
        progressManager.clear(messageId);
        this.endSession(messageId);
        return 0;
      }

      // Batch insertion through DOM queue
      const metadata = getMetadata(context);
      const {insertDeferredImages} = await import('./image_generator_v2');

      const insertedCount = await scheduleDomOperation(
        messageId,
        async () => {
          return insertDeferredImages(deferred, messageId, context, metadata);
        },
        'streaming-insertion'
      );

      // Cleanup
      progressManager.clear(messageId);
      this.endSession(messageId);

      logger.info(
        `Inserted ${insertedCount}/${deferred.length} images for message ${messageId}`
      );

      return insertedCount;
    } catch (error) {
      logger.error(
        `Error finalizing streaming session for message ${messageId}:`,
        error
      );
      progressManager.clear(messageId);
      this.endSession(messageId);
      throw error;
    }
  }

  //==========================================================================
  // Regeneration Session Methods
  //==========================================================================

  /**
   * Queues a regeneration request for a specific image
   * Creates or reuses regeneration session for the message
   * Auto-finalizes when all queued tasks complete (event-driven)
   *
   * @param messageId - Message ID containing the image
   * @param promptId - Prompt ID being regenerated (PromptNode.id)
   * @param imageUrl - URL of image to regenerate/replace
   * @param context - SillyTavern context
   * @param settings - Extension settings
   * @param mode - Insertion mode (default: 'replace-image')
   */
  async queueRegeneration(
    messageId: number,
    promptId: string,
    imageUrl: string,
    context: SillyTavernContext,
    settings: AutoIllustratorSettings,
    mode: ImageInsertionMode = 'replace-image'
  ): Promise<void> {
    logger.info(
      `Queueing regeneration for prompt ${promptId} in message ${messageId} (mode: ${mode})`
    );

    // Get or create regeneration session
    let session = this.getSession(messageId);

    if (!session) {
      // Create new regeneration session
      logger.info(`Creating new regeneration session for message ${messageId}`);

      const queue = new ImageGenerationQueue();
      const processor = new QueueProcessor(queue, settings);

      session = {
        sessionId: generateSessionId(),
        messageId,
        type: 'regeneration',
        queue,
        processor,
        abortController: new AbortController(),
        startedAt: Date.now(),
      };

      this.sessions.set(messageId, session);
      processor.start(messageId);
    }

    // Validate session type
    if (session.type !== 'regeneration') {
      throw new Error(
        `Cannot queue regeneration - message ${messageId} has ${session.type} session`
      );
    }

    // Get prompt details from prompt_manager
    const metadata = getMetadata(context);
    const promptNode = getPromptNode(promptId, metadata);

    if (!promptNode) {
      throw new Error(`Prompt node not found: ${promptId}`);
    }

    // Add to queue with regeneration metadata
    // Use Date.now() as startIndex to ensure each regeneration request gets a unique ID
    // This allows multiple regenerations of the same prompt to be queued
    const uniqueIndex = Date.now();
    const queuedPrompt = session.queue.addPrompt(
      promptNode.text,
      '', // fullMatch not needed for regeneration
      uniqueIndex, // Use timestamp to ensure unique ID for each regeneration
      uniqueIndex, // endIndex matches startIndex
      {
        targetImageUrl: imageUrl,
        targetPromptId: promptId,
        insertionMode: mode,
      }
    );

    if (!queuedPrompt) {
      logger.info(
        `Prompt already queued for regeneration, skipping duplicate: ${promptId}`
      );
      return; // Don't register duplicate task or reset timer
    }

    // Track progress
    progressManager.registerTask(messageId, 1);
    logger.info(
      `Queued regeneration for prompt ${promptId} in message ${messageId}`
    );

    // Trigger processing
    session.processor.trigger();

    // Set up completion listener if this is the first regeneration
    if (!this.completionListeners.has(messageId)) {
      this.setupCompletionListener(messageId, context);
    }
  }

  /**
   * Sets up completion listener for regeneration session
   * Listens for progress:all-tasks-complete event and triggers finalization
   *
   * @param messageId - Message ID
   * @param context - SillyTavern context
   */
  private setupCompletionListener(
    messageId: number,
    context: SillyTavernContext
  ): void {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.messageId === messageId) {
        logger.info(
          `All tasks complete for message ${messageId}, finalizing regeneration`
        );
        // Remove listener to avoid duplicate calls
        progressManager.removeEventListener(
          'progress:all-tasks-complete',
          handler
        );
        this.completionListeners.delete(messageId);
        // Trigger finalization
        this.finalizeRegenerationAndInsert(messageId, context);
      }
    };

    progressManager.addEventListener('progress:all-tasks-complete', handler);
    this.completionListeners.set(messageId, handler);
    logger.debug(
      `Set up completion listener for regeneration session ${messageId}`
    );
  }

  /**
   * Finalizes regeneration session and inserts all deferred images
   *
   * Steps:
   * 1. Wait for all regenerations to complete
   * 2. Batch insert all deferred images
   * 3. Cleanup
   *
   * @param messageId - Message ID to finalize
   * @param context - SillyTavern context
   * @returns Number of images successfully inserted
   */
  async finalizeRegenerationAndInsert(
    messageId: number,
    context: SillyTavernContext
  ): Promise<number> {
    const session = this.getSession(messageId);

    if (!session || session.type !== 'regeneration') {
      logger.warn(
        `No regeneration session found for message ${messageId}, cannot finalize`
      );
      return 0;
    }

    logger.info(
      `Finalizing regeneration session ${session.sessionId} for message ${messageId}`
    );

    try {
      // Note: This is called from progress:all-tasks-complete event handler,
      // so all regenerations are already complete. No need to wait.
      logger.info(`All regenerations complete for message ${messageId}`);

      // Get deferred images for batch insertion
      const deferred = session.processor.getDeferredImages();

      if (deferred.length === 0) {
        logger.info(`No deferred images to insert for message ${messageId}`);
        progressManager.clear(messageId);
        this.endSession(messageId);
        return 0;
      }

      // Batch insertion through DOM queue
      const metadata = getMetadata(context);
      const {insertDeferredImages} = await import('./image_generator_v2');

      const insertedCount = await scheduleDomOperation(
        messageId,
        async () => {
          return insertDeferredImages(deferred, messageId, context, metadata);
        },
        'regeneration-insertion'
      );

      // Cleanup
      progressManager.clear(messageId);
      this.endSession(messageId);

      logger.info(
        `Regenerated ${insertedCount}/${deferred.length} images for message ${messageId}`
      );

      return insertedCount;
    } catch (error) {
      logger.error(
        `Error finalizing regeneration session for message ${messageId}:`,
        error
      );
      progressManager.clear(messageId);
      this.endSession(messageId);
      throw error;
    }
  }

  //==========================================================================
  // Lifecycle Methods
  //==========================================================================

  /**
   * Cancels an active session and cleans up resources
   * Does NOT insert deferred images - use finalize methods for that
   *
   * @param messageId - Message ID to cancel
   */
  cancelSession(messageId: number): void {
    const session = this.getSession(messageId);
    if (!session) {
      return;
    }

    logger.info(
      `Cancelling ${session.type} session ${session.sessionId} for message ${messageId}`
    );

    // Abort ongoing operations
    session.abortController.abort();

    // Stop processor
    session.processor.stop();

    // Stop monitor if streaming
    if (session.monitor) {
      session.monitor.stop();
    }

    // Clear progress tracking
    progressManager.clear(messageId);

    // Clean up completion listener (regeneration)
    const listener = this.completionListeners.get(messageId);
    if (listener) {
      progressManager.removeEventListener(
        'progress:all-tasks-complete',
        listener
      );
      this.completionListeners.delete(messageId);
    }

    // Remove session
    this.sessions.delete(messageId);

    logger.info(`Session ${session.sessionId} cancelled`);
  }

  /**
   * Ends a session normally (after successful completion)
   *
   * @param messageId - Message ID
   */
  endSession(messageId: number): void {
    const session = this.sessions.get(messageId);
    if (session) {
      logger.info(
        `Ending ${session.type} session ${session.sessionId} for message ${messageId}`
      );
      this.sessions.delete(messageId);
    }
  }

  /**
   * Gets the active session for a message
   *
   * @param messageId - Message ID
   * @returns Active session or null if none exists
   */
  getSession(messageId: number): GenerationSession | null {
    return this.sessions.get(messageId) || null;
  }

  /**
   * Gets all active sessions
   *
   * @returns Array of all active sessions
   */
  getAllSessions(): GenerationSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Checks if a session is active for a specific message or any message
   *
   * @param messageId - Optional message ID to check
   * @returns True if session(s) exist
   */
  isActive(messageId?: number): boolean {
    if (messageId !== undefined) {
      return this.sessions.has(messageId);
    }
    return this.sessions.size > 0;
  }

  /**
   * Gets session type for a message
   *
   * @param messageId - Message ID
   * @returns Session type or null if no session
   */
  getSessionType(messageId: number): SessionType | null {
    const session = this.sessions.get(messageId);
    return session ? session.type : null;
  }

  /**
   * Gets status summary of all active sessions
   *
   * @returns Status object with session counts and details
   */
  getStatus(): {
    totalSessions: number;
    streamingSessions: number;
    regenerationSessions: number;
    sessions: Array<{
      messageId: number;
      sessionId: string;
      type: SessionType;
      queueSize: number;
      uptime: number;
    }>;
  } {
    const sessions = Array.from(this.sessions.values());

    return {
      totalSessions: sessions.length,
      streamingSessions: sessions.filter(s => s.type === 'streaming').length,
      regenerationSessions: sessions.filter(s => s.type === 'regeneration')
        .length,
      sessions: sessions.map(s => ({
        messageId: s.messageId,
        sessionId: s.sessionId,
        type: s.type,
        queueSize: s.queue.size(),
        uptime: Date.now() - s.startedAt,
      })),
    };
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
