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
  /** Prompt text preview (truncated for display) */
  promptPreview?: string;
  /** Timestamp when image was generated */
  completedAt: number;
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

/**
 * Immutable position identifier for a prompt in chat
 */
export interface PromptPosition {
  readonly messageId: number;
  readonly promptIndex: number;
}

/**
 * Metadata for a single prompt version
 */
export interface PromptVersionMetadata {
  /** Unique identifier for this prompt string */
  promptId: string;

  /** User feedback that led to this version (empty string for original) */
  feedback: string;

  /** When this version was created */
  timestamp: number;
}

/**
 * History of prompt versions at a specific position in chat
 */
export interface PromptPositionHistory {
  /** Chronological list of prompt versions */
  versions: PromptVersionMetadata[];
}

/**
 * Auto-illustrator metadata stored per-chat
 */
export interface AutoIllustratorChatMetadata {
  /** Maps image URL to the prompt ID used to generate it */
  imageUrlToPromptId: Record<string, string>;

  /** Maps prompt ID to actual prompt text (de-duplicated storage) */
  promptIdToText: Record<string, string>;

  /** Maps prompt position key to version history */
  promptPositionHistory: Record<string, PromptPositionHistory>;

  /** Gallery widget state (per-chat) */
  galleryWidget?: {
    /** Whether the gallery widget is visible */
    visible: boolean;
    /** Whether the gallery is minimized to FAB */
    minimized: boolean;
    /** Array of message IDs that are expanded in the gallery */
    expandedMessages: number[];
  };
}

/**
 * Represents a streaming session with all its components
 * Used by SessionManager to track active streaming state
 */
export interface StreamingSession {
  /** Unique identifier for this session */
  readonly sessionId: string;
  /** Message ID being streamed */
  readonly messageId: number;
  /** Barrier for coordinating generation completion + message finalization */
  readonly barrier: import('./barrier').Barrier;
  /** AbortController for cancelling this session */
  readonly abortController: AbortController;
  /** Queue of prompts for this session */
  readonly queue: import('./streaming_image_queue').ImageGenerationQueue;
  /** Monitor that detects new prompts during streaming */
  readonly monitor: import('./streaming_monitor').StreamingMonitor;
  /** Processor that generates images */
  readonly processor: import('./queue_processor').QueueProcessor;
  /** Timestamp when session started */
  readonly startedAt: number;
}
