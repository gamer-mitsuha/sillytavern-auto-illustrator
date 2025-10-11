/**
 * DOM Queue Module
 * Provides per-message DOM operation serialization using Bottleneck.Group
 * Prevents race conditions when multiple operations target the same message
 */

import Bottleneck from 'bottleneck';
import {createLogger} from './logger';

const logger = createLogger('DomQueue');

/**
 * Per-message DOM operation queues
 * Each message gets its own serial queue to prevent races
 * Different messages can have DOM operations in parallel
 */
const domQueues = new Bottleneck.Group({
  maxConcurrent: 1, // Serial execution per message
  trackDoneStatus: true,
});

/**
 * Schedules a DOM operation for a specific message
 * Operations for the same message are serialized (one at a time)
 * Operations for different messages can run in parallel
 *
 * @param messageId - The message ID to schedule the operation for
 * @param operation - The async operation to perform
 * @param label - Optional label for debugging
 * @returns Result of the operation
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
 * Note: This is a placeholder for future implementation
 * Currently manual_generation.ts has its own queueing system
 *
 * @param messageId - The message ID to pause
 */
export function pauseMessageQueue(messageId: number): void {
  logger.warn(
    `pauseMessageQueue called for message ${messageId} but not implemented yet`
  );
}

/**
 * Resumes the DOM queue for a message
 * Note: This is a placeholder for future implementation
 *
 * @param messageId - The message ID to resume
 */
export function resumeMessageQueue(messageId: number): void {
  logger.warn(
    `resumeMessageQueue called for message ${messageId} but not implemented yet`
  );
}

/**
 * Checks if the queue for a message is paused
 * Note: This is a placeholder for future implementation
 *
 * @param _messageId - The message ID to check (unused)
 * @returns Always false in current implementation
 */
export function isMessageQueuePaused(_messageId: number): boolean {
  return false;
}

/**
 * Gets the number of pending operations for a message
 *
 * @param messageId - The message ID to check
 * @returns Number of pending operations
 */
export function getQueueLength(messageId: number): number {
  const queue = domQueues.key(messageId.toString());
  const counts = queue.counts();
  return counts.RECEIVED + counts.QUEUED + counts.RUNNING;
}

/**
 * Clears the queue for a message (useful when message is deleted)
 *
 * @param messageId - The message ID to clear
 */
export async function clearMessageQueue(messageId: number): Promise<void> {
  const queue = domQueues.key(messageId.toString());
  await queue.stop();
  logger.info(`Cleared DOM queue for message ${messageId}`);
}

/**
 * Deletes all queues and cleans up
 * Useful for testing or extension cleanup
 */
export async function deleteAllQueues(): Promise<void> {
  // Bottleneck.Group.deleteKey requires a key parameter
  // To delete all, we'd need to track all keys
  // For now, this is a no-op
  logger.info('deleteAllQueues called (no-op in current implementation)');
}
