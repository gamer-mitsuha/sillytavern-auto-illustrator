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

  // Regeneration metadata (presence indicates this is a regeneration request)
  /** Which image to replace (URL of existing image) */
  targetImageUrl?: string;
  /** Prompt being regenerated (links to PromptNode.id from prompt_manager) */
  targetPromptId?: string;
  /** How to insert the regenerated image (default: 'replace-image') */
  insertionMode?: ImageInsertionMode;
}

/**
 * Deferred image for batch insertion after streaming completes
 */
export interface DeferredImage {
  /** The queued prompt metadata */
  prompt: QueuedPrompt;
  /** Generated image URL */
  imageUrl: string;
  /** Links to PromptNode.id from prompt_manager for image association tracking */
  promptId: string;
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
 * Auto-illustrator metadata stored per-chat
 */
export interface AutoIllustratorChatMetadata {
  /** Prompt registry (from prompt_manager.ts) - primary storage for all prompt data */
  promptRegistry?: import('./prompt_manager').PromptRegistry;

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
 * SillyTavern's chat metadata structure
 * Contains auto_illustrator metadata and potentially other extensions' data
 */
export interface ChatMetadata {
  auto_illustrator?: AutoIllustratorChatMetadata;
  [key: string]: unknown;
}

/**
 * Session type - streaming or regeneration (mutually exclusive)
 */
export type SessionType = 'streaming' | 'regeneration';

/**
 * Image insertion modes for controlling where images are placed
 */
export type ImageInsertionMode =
  | 'replace-image' // Replace existing image (default for regeneration)
  | 'append-after-image' // Append after existing image (regeneration variant)
  | 'append-after-prompt'; // Append after prompt tag (streaming default)

/**
 * Represents a generation session (streaming or regeneration) with all its components
 * Used by SessionManager to track active generation state
 */
export interface GenerationSession {
  /** Unique identifier for this session */
  readonly sessionId: string;
  /** Message ID being processed */
  readonly messageId: number;
  /** Type of session - streaming or regeneration */
  readonly type: SessionType;

  // Shared components for both session types
  /** Queue of prompts for this session */
  readonly queue: import('./streaming_image_queue').ImageGenerationQueue;
  /** Processor that generates images */
  readonly processor: import('./queue_processor').QueueProcessor;
  /** AbortController for cancelling this session */
  readonly abortController: AbortController;

  // Streaming-only (undefined for regeneration sessions)
  /** Monitor that detects new prompts during streaming (streaming only) */
  readonly monitor?: import('./streaming_monitor').StreamingMonitor;

  /** Timestamp when session started */
  readonly startedAt: number;
}

// Old StreamingSession interface removed - use GenerationSession instead
