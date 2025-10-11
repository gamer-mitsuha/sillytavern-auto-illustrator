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
 * Ensures only one streaming session is active at a time
 * Encapsulates all session state (queue, monitor, processor, barrier)
 */
export class SessionManager {
  private currentSession: StreamingSession | null = null;

  /**
   * Starts a new streaming session for a message
   * If another session is active, it will be cancelled first
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

    this.currentSession = session;

    logger.info(
      `Started streaming session ${sessionId} for message ${messageId}`
    );

    // Start monitor and processor
    monitor.start(messageId);
    processor.start(messageId);

    return session;
  }

  /**
   * Cancels the current streaming session
   * Aborts ongoing operations and stops components
   */
  cancelSession(): void {
    if (!this.currentSession) {
      return;
    }

    const {sessionId, messageId, abortController, monitor, processor} =
      this.currentSession;

    logger.info(
      `Cancelling streaming session ${sessionId} for message ${messageId}`
    );

    // Signal cancellation
    abortController.abort();

    // Stop components
    monitor.stop();
    processor.stop();

    // Clear reference
    this.currentSession = null;
  }

  /**
   * Ends the current session gracefully (completed, not cancelled)
   * Assumes monitor and processor have already been stopped by caller
   */
  endSession(): void {
    if (!this.currentSession) {
      return;
    }

    const {sessionId, messageId, startedAt} = this.currentSession;
    const duration = Date.now() - startedAt;

    logger.info(
      `Ending streaming session ${sessionId} for message ${messageId} (duration: ${duration}ms)`
    );

    // Clear reference (monitor/processor already stopped by caller)
    this.currentSession = null;
  }

  /**
   * Gets the current active session
   * @returns Current session or null if none active
   */
  getCurrentSession(): StreamingSession | null {
    return this.currentSession;
  }

  /**
   * Checks if streaming is active
   * @param messageId - Optional message ID to check if THIS specific message is streaming
   * @returns True if streaming is active (optionally for specific message)
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
   * Gets status information for debugging
   * @returns Status object with session details
   */
  getStatus(): {
    hasActiveSession: boolean;
    sessionId: string | null;
    messageId: number | null;
    duration: number | null;
    queueSize: number | null;
    monitorActive: boolean;
    processorActive: boolean;
  } {
    if (!this.currentSession) {
      return {
        hasActiveSession: false,
        sessionId: null,
        messageId: null,
        duration: null,
        queueSize: null,
        monitorActive: false,
        processorActive: false,
      };
    }

    const {sessionId, messageId, startedAt, queue, monitor, processor} =
      this.currentSession;

    return {
      hasActiveSession: true,
      sessionId,
      messageId,
      duration: Date.now() - startedAt,
      queueSize: queue.size(),
      monitorActive: monitor.isActive(),
      processorActive: processor.getStatus().isRunning,
    };
  }
}
