/**
 * Streaming Image Queue Module
 * Manages a queue of image prompts detected during streaming
 */

import type {PromptState, QueuedPrompt} from './types';
import {createLogger} from './logger';

const logger = createLogger('Queue');

/**
 * Generates a unique ID for a prompt based on text and position
 */
function generatePromptId(prompt: string, startIndex: number): string {
  // Simple hash function for generating IDs
  const str = `${prompt}:${startIndex}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `prompt_${Math.abs(hash).toString(36)}`;
}

/**
 * Queue for managing image generation prompts during streaming
 */
export class ImageGenerationQueue {
  private prompts: Map<string, QueuedPrompt> = new Map();

  /**
   * Adds a new prompt to the queue
   * @param prompt - Prompt text
   * @param fullMatch - The full matched tag string
   * @param startIndex - Start position in message
   * @param endIndex - End position in message
   * @param regenerationMetadata - Optional metadata for regeneration requests
   * @param promptId - Optional ID from PromptManager (for linking images to prompts)
   * @returns The queued prompt, or null if already exists
   */
  addPrompt(
    prompt: string,
    fullMatch: string,
    startIndex: number,
    endIndex: number,
    regenerationMetadata?: {
      targetImageUrl?: string;
      targetPromptId?: string;
      insertionMode?: import('./types').ImageInsertionMode;
    },
    promptId?: string
  ): QueuedPrompt | null {
    const id = generatePromptId(prompt, startIndex);

    // Check if already exists
    if (this.prompts.has(id)) {
      logger.info('Prompt already queued:', id);
      return null;
    }

    // Determine targetPromptId: use regeneration metadata if provided, otherwise use promptId
    const targetPromptId = regenerationMetadata?.targetPromptId || promptId;

    const queuedPrompt: QueuedPrompt = {
      id,
      prompt,
      fullMatch,
      startIndex,
      endIndex,
      state: 'QUEUED',
      attempts: 0,
      detectedAt: Date.now(),
      // Set targetPromptId for both streaming (from PromptManager) and regeneration
      ...(targetPromptId && {targetPromptId}),
      // Add other regeneration metadata if provided
      ...(regenerationMetadata && {
        targetImageUrl: regenerationMetadata.targetImageUrl,
        insertionMode: regenerationMetadata.insertionMode,
      }),
    };

    this.prompts.set(id, queuedPrompt);
    logger.info('Added prompt:', id, prompt);
    return queuedPrompt;
  }

  /**
   * Checks if a prompt already exists in the queue
   * @param prompt - Prompt text
   * @param startIndex - Start position
   * @returns True if prompt exists
   */
  hasPrompt(prompt: string, startIndex: number): boolean {
    const id = generatePromptId(prompt, startIndex);
    return this.prompts.has(id);
  }

  /**
   * Checks if a prompt with this text exists anywhere in the queue
   * (ignores position - useful for detecting duplicates after text shifts)
   * @param prompt - Prompt text
   * @returns True if a prompt with this text exists
   */
  hasPromptByText(prompt: string): boolean {
    for (const queuedPrompt of this.prompts.values()) {
      if (queuedPrompt.prompt === prompt) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets the next pending prompt (QUEUED state)
   * @returns Next prompt to process, or null if none available
   */
  getNextPending(): QueuedPrompt | null {
    for (const prompt of this.prompts.values()) {
      if (prompt.state === 'QUEUED') {
        return prompt;
      }
    }
    return null;
  }

  /**
   * Updates the state of a prompt
   * @param id - Prompt ID
   * @param state - New state
   * @param data - Additional data (imageUrl, error)
   */
  updateState(
    id: string,
    state: PromptState,
    data?: {imageUrl?: string; error?: string}
  ): void {
    const prompt = this.prompts.get(id);
    if (!prompt) {
      logger.warn('Prompt not found:', id);
      return;
    }

    prompt.state = state;

    if (state === 'GENERATING') {
      prompt.generationStartedAt = Date.now();
      prompt.attempts++;
    }

    if (state === 'COMPLETED' || state === 'FAILED') {
      prompt.completedAt = Date.now();
    }

    if (data?.imageUrl) {
      prompt.imageUrl = data.imageUrl;
    }

    if (data?.error) {
      prompt.error = data.error;
    }

    logger.info('Updated state:', id, state);
  }

  /**
   * Gets a prompt by ID
   * @param id - Prompt ID
   * @returns The prompt, or undefined if not found
   */
  getPrompt(id: string): QueuedPrompt | undefined {
    return this.prompts.get(id);
  }

  /**
   * Gets all prompts in the queue
   * @returns Array of all prompts
   */
  getAllPrompts(): QueuedPrompt[] {
    return Array.from(this.prompts.values());
  }

  /**
   * Gets prompts by state
   * @param state - State to filter by
   * @returns Array of prompts in the given state
   */
  getPromptsByState(state: PromptState): QueuedPrompt[] {
    return this.getAllPrompts().filter(p => p.state === state);
  }

  /**
   * Gets count of prompts by state
   * @returns Object with counts for each state
   */
  getStats(): Record<PromptState, number> {
    const stats: Record<PromptState, number> = {
      DETECTED: 0,
      QUEUED: 0,
      GENERATING: 0,
      COMPLETED: 0,
      FAILED: 0,
    };

    for (const prompt of this.prompts.values()) {
      stats[prompt.state]++;
    }

    return stats;
  }

  /**
   * Clears all prompts from the queue
   */
  clear(): void {
    logger.info('Clearing queue');
    this.prompts.clear();
  }

  /**
   * Gets the size of the queue
   * @returns Number of prompts in queue
   */
  size(): number {
    return this.prompts.size;
  }

  /**
   * Adjusts positions of all queued prompts after a text insertion
   * Call this after inserting an image to update positions of remaining prompts
   * @param insertionPoint - Position where text was inserted
   * @param insertedLength - Length of inserted text (including newlines and img tag)
   * @param insertionTime - Timestamp when insertion happened
   */
  adjustPositionsAfterInsertion(
    insertionPoint: number,
    insertedLength: number,
    insertionTime: number = Date.now()
  ): void {
    for (const prompt of this.prompts.values()) {
      // Only adjust prompts that:
      // 1. Were detected BEFORE this insertion (detectedAt < insertionTime)
      // 2. Come after the insertion point in the text
      // 3. Are still pending (QUEUED or GENERATING)
      //
      // Prompts detected AFTER insertion already have correct positions
      // because they were extracted from text that already includes the insertion
      if (
        prompt.detectedAt < insertionTime &&
        prompt.startIndex > insertionPoint &&
        (prompt.state === 'QUEUED' || prompt.state === 'GENERATING')
      ) {
        prompt.startIndex += insertedLength;
        prompt.endIndex += insertedLength;
      }
    }
  }
}
