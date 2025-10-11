/**
 * Session Manager Module
 * Manages streaming session lifecycle and ensures only one active session at a time
 */

import {ImageGenerationQueue} from './streaming_image_queue';
import {StreamingMonitor} from './streaming_monitor';
import {QueueProcessor} from './queue_processor';
import {Barrier} from './barrier';
import {createLogger} from './logger';
import type {StreamingSession} from './types';

const logger = createLogger('SessionManager');

/**
 * Manages streaming session lifecycle
 * Supports multiple concurrent sessions (one per message)
 * Each session independently monitors, queues, and processes image generation
 * Image generation is globally rate-limited via Bottleneck limiter
 */
export class SessionManager {
  private sessions: Map<number, StreamingSession> = new Map();

  /**
   * Starts a new streaming session for a message
   * If a session already exists for this message, it will be cancelled first
   * Multiple sessions can exist concurrently for different messages
   *
   * @param messageId - Message being streamed
   * @param context - SillyTavern context
   * @param settings - Extension settings
   * @returns The new streaming session
   */
  startSession(
    messageId: number,
    context: SillyTavernContext,
    settings: AutoIllustratorSettings
  ): StreamingSession {
    // Cancel existing session for this specific message if any
    const existing = this.sessions.get(messageId);
    if (existing) {
      logger.warn(
        `Message ${messageId} already has active session ${existing.sessionId}, cancelling it`
      );
      this.cancelSession(messageId);
    }

    const sessionId = `session_${messageId}_${Date.now()}`;
    const barrier = new Barrier(['genDone', 'messageReceived'], 300000); // 300s timeout (5 minutes)
    const abortController = new AbortController();

    // Create queue
    const queue = new ImageGenerationQueue();

    // Create processor (will trigger on new prompts)
    const processor = new QueueProcessor(
      queue,
      context,
      settings,
      settings.maxConcurrentGenerations
    );

    // Create monitor (will add prompts to queue and trigger processor)
    const monitor = new StreamingMonitor(
      queue,
      context,
      settings,
      settings.streamingPollInterval,
      () => {
        // Callback when new prompts detected
        processor.trigger();
      }
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

    this.sessions.set(messageId, session);

    logger.info(
      `Started streaming session ${sessionId} for message ${messageId} (${this.sessions.size} total active)`
    );

    // Start monitor and processor
    monitor.start(messageId);
    processor.start(messageId, barrier);

    return session;
  }

  /**
   * Cancels a specific streaming session
   * Aborts ongoing operations and stops components
   * @param messageId - Message ID of the session to cancel
   */
  cancelSession(messageId: number): void {
    const session = this.sessions.get(messageId);
    if (!session) {
      return;
    }

    const {sessionId, abortController, monitor, processor} = session;

    logger.info(
      `Cancelling streaming session ${sessionId} for message ${messageId}`
    );

    // Signal cancellation
    abortController.abort();

    // Stop components
    monitor.stop();
    processor.stop();

    // Remove from map
    this.sessions.delete(messageId);
    logger.info(
      `Cancelled session for message ${messageId} (${this.sessions.size} remaining)`
    );
  }

  /**
   * Ends a specific session gracefully (completed, not cancelled)
   * Assumes monitor and processor have already been stopped by caller
   * @param messageId - Message ID of the session to end
   */
  endSession(messageId: number): void {
    const session = this.sessions.get(messageId);
    if (!session) {
      return;
    }

    const {sessionId, startedAt} = session;
    const duration = Date.now() - startedAt;

    logger.info(
      `Ending streaming session ${sessionId} for message ${messageId} (duration: ${duration}ms)`
    );

    // Remove from map (monitor/processor already stopped by caller)
    this.sessions.delete(messageId);
    logger.info(
      `Ended session for message ${messageId} (${this.sessions.size} remaining)`
    );
  }

  /**
   * Gets a specific session by message ID
   * @param messageId - Message ID to get session for
   * @returns Session for the message or null if none exists
   */
  getSession(messageId: number): StreamingSession | null {
    return this.sessions.get(messageId) ?? null;
  }

  /**
   * Gets the most recent session (last one added to map)
   * @deprecated Use getSession(messageId) instead for explicit session lookup
   * @returns Most recent session or null if none active
   */
  getCurrentSession(): StreamingSession | null {
    if (this.sessions.size === 0) {
      return null;
    }
    const sessions = Array.from(this.sessions.values());
    return sessions[sessions.length - 1];
  }

  /**
   * Gets all active sessions
   * @returns Array of all active streaming sessions
   */
  getAllSessions(): StreamingSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Checks if streaming is active
   * @param messageId - Optional message ID to check if THIS specific message is streaming
   * @returns True if streaming is active (optionally for specific message)
   */
  isActive(messageId?: number): boolean {
    if (messageId === undefined) {
      // Check if any session is active
      return this.sessions.size > 0;
    }

    // Check if specific message has an active session
    return this.sessions.has(messageId);
  }

  /**
   * Gets status information for debugging
   * @returns Status object with details for all active sessions
   */
  getStatus(): {
    activeSessionCount: number;
    sessions: Array<{
      sessionId: string;
      messageId: number;
      duration: number;
      queueSize: number;
      monitorActive: boolean;
      processorActive: boolean;
    }>;
  } {
    return {
      activeSessionCount: this.sessions.size,
      sessions: Array.from(this.sessions.values()).map(s => ({
        sessionId: s.sessionId,
        messageId: s.messageId,
        duration: Date.now() - s.startedAt,
        queueSize: s.queue.size(),
        monitorActive: s.monitor.isActive(),
        processorActive: s.processor.getStatus().isRunning,
      })),
    };
  }
}
