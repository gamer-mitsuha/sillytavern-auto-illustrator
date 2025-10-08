# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Simplified Chinese (zh-CN) README translation (README_CN.md)
- Per-message operation queue system to serialize manual generation and regeneration operations
- Manual generation state tracking for each message to avoid conflicts with streaming
- Multi-pattern prompt detection system supporting multiple tag formats simultaneously
- Configurable prompt detection patterns in settings UI (one regex pattern per line)
- Support for HTML comment format: `<!--img-prompt="..."--->` (invisible, passes through DOMPurify)
- Backward compatibility with old `<img_prompt>` (underscore) tags from existing chats
- Real-time validation indicator showing if prompt detection patterns can find prompts in the current meta prompt template
  - Visual feedback with green checkmark for valid patterns
  - Warning indicator with helpful hints when patterns don't match meta prompt format
  - Updates automatically when changing presets or modifying patterns

### Changed
- **BREAKING**: Changed default output format to HTML comment format `<!--img-prompt="..."-->` to fix invisible spacing issue
- **BREAKING**: Changed tag format from `<img_prompt>` to `<img-prompt>` for HTML5 compliance and reliable CSS styling
- **BREAKING**: Changed default manual generation mode from "Replace" to "Append"
- Updated meta prompt presets to use HTML comment format for new messages
- Extended prompt detection to support three formats: HTML comments (new), hyphenated tags, and underscored tags (legacy)
- Manual generation and image regeneration now check message-specific streaming status before proceeding
- Streaming generation now checks for active manual generation before starting for a message
- All manual generation and regeneration operations for same message now queue and execute sequentially
- `isManualGenerationActive()` now checks both actively executing and queued operations
- Updated documentation to reflect removal of word interval setting
- Clarified that image generation frequency is controlled via meta prompt presets
- Dialog option order changed: "Append" now appears before "Replace" in both manual generation and regeneration dialogs

### Removed
- Word interval setting (non-functional - interval is part of meta prompt presets)
- Obsolete CSS rules attempting to hide `<img-prompt>` tags (tags are now HTML comments or stripped by DOMPurify)

### Fixed
- **CRITICAL**: Fixed image insertion failing by storing full matched tag (`fullMatch`) in queue instead of reconstructing tag format
- Race conditions between manual generation and regeneration on same message by implementing operation queue
- Streaming no longer starts when manual generation operations are queued but not yet executing
- **CRITICAL**: Fixed manual generation not inserting images by using `fullMatch` instead of hardcoded tag format and re-extracting prompts after text modifications
- **CRITICAL**: Fixed image regeneration failing to find prompts by supporting multi-pattern detection in `findPromptForImage()`, `findImageIndexInPrompt()`, and `countRegeneratedImages()`
- **CRITICAL**: Fixed all remaining hardcoded tag patterns in `hasExistingImage()`, `removeExistingImages()`, and `pruneGeneratedImages()` to support multi-pattern detection
- Manual generation button tooltip now properly supports internationalization (zh-CN translation)
- Prevent manual/regeneration operations from interfering with active streaming generation on the same message
- Prevent streaming from starting on a message while manual generation is active on that message
- Fix meta-prompt injection failing for first message in new chat session by defaulting to 'normal' generation type
- Skip setting generation type during dry runs (token counting) to avoid premature type clearing
- Fix img-prompt tags occupying invisible space in chat by using SillyTavern's native CSS loading (manifest.json "css" field)
- Fix mobile behavior where clicking an image when dialog is open creates duplicate dialogs instead of closing existing dialog

### Documentation
- Simplified Chinese (zh-cn) internationalization support
  - Full translation coverage for settings UI, dialogs, and notifications
  - Added translations for Prompt Detection Patterns settings
  - Dynamic translation for count-based messages
  - Automatic language detection via SillyTavern i18n system
- Manual image generation feature for existing `<img_prompt>` tags
  - New button in message actions menu for messages containing image prompts
  - Modal dialog with "Replace" and "Append" modes with backdrop overlay
  - Replace mode: Remove existing images and regenerate new ones
  - Append mode: Keep existing images and add new ones after them
  - Configurable default mode in settings
  - Visual feedback during generation (toastr notifications)
  - Purple wand icon for easy identification
  - Backdrop click to cancel dialog

### Fixed
- Settings now reload on chat change to ensure custom presets stay synced across devices
- Fixed image rendering after deferred insertion by using `updateMessageBlock()` to trigger DOM re-render
- Images now appear immediately after streaming completes without requiring manual message edit
- Proper event sequence (MESSAGE_EDITED → updateMessageBlock → MESSAGE_UPDATED) ensures regex "Run on Edit" scripts execute correctly
- Fixed deferred images being lost when multiple STREAM_TOKEN_RECEIVED events fire for the same message
- Prevented processor recreation that would clear deferred images array during active streaming
- Fixed meta-prompt injection by using direct CHAT_COMPLETION_PROMPT_READY event injection instead of setExtensionPrompt
- Meta-prompt now guaranteed to be the last system message in the chat context
- Generation type filtering prevents meta-prompt injection for quiet and impersonate generations
- Robust state tracking using GENERATION_STARTED and GENERATION_ENDED events

### Added
- Automatic inline image generation based on LLM-generated prompts
- Meta-prompt injection via CHAT_COMPLETION_PROMPT_READY event with generation type filtering
- Regex-based image prompt extraction (`<img_prompt="...">` format)
- Integration with Stable Diffusion slash command (`/sd`)
- Toastr notifications for image generation feedback
  - Info: "Generating X images..." when starting
  - Success: When all images generated successfully
  - Warning: For partial success scenarios
  - Error: When all images failed
- Streaming image generation
  - Generate images progressively as streaming text arrives
  - Queue-based architecture detects prompts during LLM streaming
  - Images appear as soon as generated (no waiting for full response)
  - Configurable polling interval (100-1000ms, default 300ms)
  - Configurable max concurrent generations (default: 1 for rate limiting)
  - Significantly reduces perceived latency for image generation
  - Two-way handshake coordination for deferred image insertion
  - Batch image insertion using single-write approach
  - Streaming message tracking to prevent duplicate processing
  - Full-text search for image insertion (no position tracking needed)
  - Duplicate prompt detection prevention after text shifts
  - Final scan on GENERATION_ENDED to catch prompts added at the very end of streaming
- Meta prompt preset management system
  - Two predefined presets: Default and NAI 4.5 Full (optimized for NovelAI Diffusion 4.5)
  - Create, update, and delete custom presets
  - Edit mode with Save and Save As functionality
  - Preset content preview with scrollable display
  - Predefined presets are read-only (can only be saved as new custom presets)
  - Custom presets can be overwritten with confirmation
  - Cannot use predefined preset names for custom presets
  - Delete button disabled for predefined presets (visible but not clickable)
  - Save button disabled for predefined presets (only Save As available)
- Chat history pruning using `CHAT_COMPLETION_PROMPT_READY` event
  - Removes generated `<img>` tags from chat history before sending to LLM
  - Preserves `<img_prompt>` tags so LLM recognizes its own format
  - Only removes images in assistant messages (preserves user-uploaded images)
  - Does not modify saved chat files, only in-memory chat sent to LLM
  - Skips dry run operations to prevent removing images from UI
- Centralized logging system using loglevel library
  - Contextual loggers for each module (Monitor, Queue, Processor, Generator, etc.)
  - Log level setting in UI (TRACE, DEBUG, INFO, WARN, ERROR, SILENT)
  - Verbose "Text changed" logs use DEBUG level
  - Image generation duration logging (individual and batch metrics)
  - Comprehensive logging documentation in docs/LOGGING.md
- Centralized regex patterns module (src/regex.ts) to avoid duplication
- Constants module (src/constants.ts) for settings defaults and validation ranges
- Centralized type definitions module (src/types.ts) for shared TypeScript types
- Settings panel with configurable options:
  - Enable/disable toggle
  - Word interval slider (50-1000 words)
  - Meta-prompt template customization
  - Enable streaming image generation toggle
  - Streaming poll interval slider (100-1000ms)
  - Max concurrent generations slider (1-5)
  - Log level dropdown (TRACE/DEBUG/INFO/WARN/ERROR/SILENT)
  - Reset to defaults button
- Event-driven architecture using MESSAGE_RECEIVED, MESSAGE_UPDATED, MESSAGE_EDITED, CHAT_COMPLETION_PROMPT_READY, STREAM_TOKEN_RECEIVED, GENERATION_ENDED, and CHAT_CHANGED events
- Comprehensive unit test suite with Vitest
  - Tests for streaming queue (data structure, position adjustment after insertion)
  - Tests for streaming monitor (polling, prompt detection, lifecycle)
  - Tests for queue processor (concurrency control, state management)
  - Tests for messageId detection helper (findLastAssistantMessageId)
  - Tests for progressive image insertion (insertImageIntoMessage)
  - Tests for existing functionality (extraction, generation, settings, prompt injection)
- Full TypeScript type definitions for SillyTavern API
- Google TypeScript Style Guide compliance with `gts`
- Webpack build system for production bundling
- GitHub issue template for error handling improvements (.github-issue-error-handling.md)

### Technical Details
- Built with TypeScript and Webpack
- Queue-based streaming architecture with state management
- Polling-based prompt detection (300ms intervals during streaming)
- Progressive image insertion into streaming messages
- Sequential image generation to prevent rate limiting (NovelAI 429 errors)
- Smart deduplication prevents duplicate image generation
- Graceful fallback to non-streaming mode if disabled or events unavailable
- Zero `any` types in production code (full type safety)
- Modular architecture with single responsibility principle
- `createMockContext()` helper for clean, type-safe test mocks
- Proper DOM type definitions in tsconfig
- Zero lint warnings
- In-place image prompt replacement preserving text order
- Chat history interceptor prevents LLM context pollution from generated images
- Position-aware image insertion handles growing streaming text
- Helper functions to eliminate code duplication (~340 lines reduced in image_generator.ts)
- Direct type imports from types.ts (no re-exports)
- Event type references use eventTypes properties directly (no string fallbacks)
- All event type properties required in globals.d.ts (no optional chaining)
- Image titles use simple numeric indices (#1, #2, etc.) to avoid special character issues
- Chat history pruner regex matches img tags regardless of attributes
- Generated images persist after chat reload via context.saveChat()
- MESSAGE_UPDATED and MESSAGE_EDITED events both emitted for proper UI rendering

## [1.0.0] - TBD

Initial release
