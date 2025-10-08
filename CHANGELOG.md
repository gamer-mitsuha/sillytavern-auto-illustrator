# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed
- Word interval setting (non-functional - interval is part of meta prompt presets)

### Fixed
- Manual generation button tooltip now properly supports internationalization (zh-CN translation)

### Added
- Simplified Chinese (zh-cn) internationalization support
  - Full translation coverage for settings UI, dialogs, and notifications
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
