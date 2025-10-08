/**
 * Type Definitions Module
 * Centralized type definitions for the Auto Illustrator extension
 */

/**
 * State of a queued image generation prompt
 */
export type PromptState =
  | 'DETECTED' // Prompt detected in streaming text
  | 'QUEUED' // Queued for generation
  | 'GENERATING' // Currently generating
  | 'COMPLETED' // Successfully generated
  | 'FAILED'; // Generation failed

/**
 * A queued image generation prompt with metadata
 */
export interface QueuedPrompt {
  /** Unique identifier (hash of prompt + position) */
  id: string;
  /** The image generation prompt text */
  prompt: string;
  /** The full matched tag (e.g., '<!--img-prompt="..."-->', '<img-prompt="...">', etc.) */
  fullMatch: string;
  /** Start index in the message text */
  startIndex: number;
  /** End index in the message text */
  endIndex: number;
  /** Current state of the prompt */
  state: PromptState;
  /** Generated image URL (if completed) */
  imageUrl?: string;
  /** Error message (if failed) */
  error?: string;
  /** Number of generation attempts */
  attempts: number;
  /** Timestamp when prompt was detected */
  detectedAt: number;
  /** Timestamp when generation started */
  generationStartedAt?: number;
  /** Timestamp when completed/failed */
  completedAt?: number;
}

/**
 * Deferred image for batch insertion after streaming completes
 */
export interface DeferredImage {
  /** The queued prompt metadata */
  prompt: QueuedPrompt;
  /** Generated image URL */
  imageUrl: string;
}

/**
 * Match result for an image prompt extracted from text
 */
export interface ImagePromptMatch {
  /** The full matched text (e.g., '<img-prompt="...">') */
  fullMatch: string;
  /** The extracted prompt text (unescaped) */
  prompt: string;
  /** Start index of the match in the text */
  startIndex: number;
  /** End index of the match in the text */
  endIndex: number;
}

/**
 * Manual generation mode type
 */
export type ManualGenerationMode = 'replace' | 'append';

/**
 * Style tag position type
 */
export type StyleTagPosition = 'prefix' | 'suffix';
