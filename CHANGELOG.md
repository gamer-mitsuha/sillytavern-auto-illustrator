# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2025-10-17

### Added
- **Meta Prompt Depth Setting** - New setting to control where the meta prompt is inserted in chat history for shared API mode (depth=0: last position, depth=1: one before last, etc.)
- **Separate LLM Call for Prompt Generation** (#32)
  - New opt-in "Independent API Call" prompt generation mode (default remains "Shared API Call")
  - Prevents prompt generation from influencing main text response quality
  - Context-based insertion using text snippets instead of byte offsets
  - Context awareness: LLM considers previous messages for better understanding of characters, settings, and situations
  - Automatic chat history cleanup (removes prompt tags from future AI calls in Independent API mode)
  - Cost control setting: max prompts per message (default: 5)
  - Customizable guidelines for prompt frequency and writing style
  - Plain text delimiter format for robust LLM output parsing
  - Preserves prompt tags in message HTML for feature compatibility (regeneration, gallery)
  - Clear UI warnings about token cost implications (+1 API call per message in Independent API mode)
  - Debug logging for monitoring LLM prompts and showing what blocks are skipped
  - Comprehensive implementation plan document (`docs/IMPLEMENTATION_PLAN_ISSUE_32.md`)

### Fixed
- **Meta-prompt Injection Logic** - Now requires explicit generation type instead of defaulting to 'normal', preventing unexpected meta-prompt injection in direct API calls like `generateRaw`

## [1.4.0] - 2025-10-15

### Added

- **Image Rotation Feature**
  - Rotate button in modal viewer (90° clockwise increments)
  - Rotation persists across modal reopening within same session
  - Rotation-aware fullscreen and image fitting
  - Automatic dimension-swap for portrait↔landscape transitions
  - Works seamlessly with zoom, pan, and fullscreen features

- **Tap Navigation for Mobile**
  - Tap left/right side of image to navigate between images
  - Visual tap indicators with ripple animation
  - Automatically disabled when image is zoomed (panning takes priority)
  - Complements existing swipe navigation

- **View All Images Button**
  - Added to regeneration dialog (alongside Generate/Update Prompt/Delete/Cancel)
  - Opens global image viewer starting from the clicked image
  - Collects all AI-generated images from all messages in chronological order
  - Allows browsing through entire chat's image collection from any starting point
  - Shared utility functions reduce code duplication across modules

- **Fullscreen Enhancements**
  - Tap center of image to toggle fullscreen on mobile devices
  - Immersive fullscreen mode with screen rotation lock support
  - Icon-only action buttons on mobile for maximum screen space
  - Improved visual feedback for fullscreen transitions

- **Gallery Widget Improvements**
  - Message order toggle button (newest-first ⇄ oldest-first)
  - Smart DOM updates prevent duplicate elements and visual disruption
  - Automatically refreshes when images are added/edited (MESSAGE_EDITED event)
  - Reduced code duplication with shared image extraction utilities

### Fixed

- **Modal Viewer Fixes**
  - Keyboard shortcuts no longer trigger unintended SillyTavern actions
  - Text input fields now properly accept keyboard input during modal viewer
  - Correct image fitting and positioning for rotated images in fullscreen
  - Removed conflicting double-click/tap-to-zoom feature (conflicts with tap navigation)
  - Hidden "swipe to navigate" hint text (tap navigation is now primary on mobile)

- **Metadata & Context Management**
  - PromptRegistry now persists correctly after inserting images
  - Image URL normalization ensures consistent prompt lookups
  - Always fetch fresh context from SillyTavern (eliminates stale data issues)

- **Progress Widget Fixes**
  - Widget state properly cleared when switching between chats
  - No more DOM disruption during real-time updates

- **Image Generation**
  - Fixed support for manual image generation when streaming mode is disabled
  - Event-driven session finalization (eliminates race conditions from idle timer)
  - Improved reliability for click-to-regenerate dialog

### Changed

- **Architecture Improvements** (Internal)
  - Unified streaming and regeneration into single generation pipeline
  - Removed _v2 suffixes from all modules (migration complete)
  - Consolidated prompt tracking via prompt_manager.ts
  - Removed Barrier pattern in favor of explicit await conditions
  - Comprehensive test coverage for all core modules
  - Deleted obsolete files: barrier.ts, old module versions, deprecated metadata functions

## [1.3.0] - 2025-10-13

### Added

- **Permanent Gallery Widget** (#50)
  - Always-available widget for reviewing all generated images in current chat
  - Groups images by assistant message with collapsible headers and message previews
  - Minimizes to floating action button (FAB) with image count badge
  - State persistence: remembers visibility, minimization, and expanded messages per-chat
  - Located at top-right of chat area with modern glassmorphism design
  - Automatically updates when new images complete

- **Widget Visibility Controls**
  - New settings to show/hide Progress Widget and Gallery Widget independently
  - Both widgets default to enabled for backward compatibility
  - Requires page reload to take effect when changed

- **Progress Widget Enhancements**
  - **Close functionality**: Added close button (×) in widget header and for individual completed messages
  - **Two-level collapse**: Widget-level and message-level collapsing for better scalability
  - **Persistent after completion**: Widget remains visible after generation completes with manual close control
  - **Improved visual design**: Modern glassmorphism UI with gradient background and status badges
  - **Better thumbnail layout**: Thumbnails wrap to multiple rows instead of horizontal scrolling
  - **Space efficiency**: 5 messages reduce from ~2000px to ~600px height when collapsed
  - Widget stays expanded after all images finish, showing completion indicator (checkmark) and "Images Generated" title

- **Mobile Image Viewing Experience**
  - **Comprehensive zoom/pan system**: Pinch-to-zoom gesture, one-finger panning when zoomed, double-tap zoom toggle
  - **Zoom indicator**: Shows current zoom level (e.g., "150%") with auto-fade
  - **Touch-optimized controls**: Zoom centers on touch point, momentum scrolling with velocity tracking
  - **iOS-specific improvements**: Safe area support for notch/home indicator, new-tab download with long-press instruction
  - **Gesture coordination**: Swipe navigation only works at 1x zoom, panning takes over when zoomed

- **Desktop Image Viewing Experience**
  - Mouse wheel zoom (progressive 1x-3x), click-and-drag panning, double-click zoom toggle
  - Keyboard shortcuts: `+`/`=` to zoom in, `-` to zoom out, `0` to reset
  - Reset button appears when zoomed >1x to quickly return to fit
  - Hardware accelerated transforms for smooth 60fps performance

- **Image Modal Features**
  - Streaming image preview gallery: shows completed images as thumbnails (100x100px) while streaming continues
  - Click thumbnails to view full-size images with navigation (prev/next), zoom, download
  - Real-time updates: modal automatically reflects new images without needing to close/reopen
  - Navigation buttons enable dynamically as images complete
  - Keyboard navigation: Escape to close, Arrow keys for navigation
  - Displays image index, dimensions, and full prompt text

### Fixed

- **Context Caching Issues** (#34)
  - Eliminated stale context/metadata access after chat switches
  - All code now calls `SillyTavern.getContext()` when accessing chat or chatMetadata
  - Ensures extension always operates on correct chat's data after switching chats
  - Fixed in QueueProcessor, StreamingMonitor, MessageHandler, and ManualGeneration modules

- **Extension Enable/Disable**
  - Extension toggle now properly controls all functionality
  - When disabled: no event handlers registered, no widgets initialized, no automatic processing
  - User notified to reload page when toggling setting
  - Provides true on/off control

- **Gallery Widget Improvements**
  - Now visible by default for new chats (previously hidden)
  - Only appears during active chat sessions (hidden on settings/character management pages)
  - Fixed image extraction by reusing existing `extractImagePrompts()` function
  - State stored per-chat in `chat_metadata` instead of global localStorage
  - State persists with chat backups/exports

- **Progress Widget Improvements**
  - Smart DOM updates: uses differential updates instead of full rebuilds
  - Scroll position preservation: thumbnail gallery positions saved and restored
  - Image viewer state maintained: zoom and pan no longer reset during progress updates
  - Properly clears old thumbnails when regenerating same message
  - Shows cumulative count for sequential regenerations (e.g., "0/3 → 1/3 → 2/3 → 3/3")
  - Widget reappears when new streaming starts after being closed

- **Modal Viewer Refactoring**
  - Progress and gallery widgets now share unified modal implementation
  - Eliminated 597 lines of duplicate code
  - Reduced bundle size by 8 KiB (from 255 KiB to 247 KiB)
  - Both widgets automatically benefit from all mobile UX improvements

- **Desktop UI Fixes**
  - Progress widget no longer overlaps with chat input area
  - Image modal no longer overlaps with prompt area and action buttons
  - Proper flexbox layout replaces hardcoded height calculations
  - Long prompts scroll internally instead of pushing content out of viewport

- **Mobile UI Fixes**
  - Action buttons (zoom, download) now fully visible and not cut off
  - Eliminated auto-scroll when expanding prompt viewer
  - iOS safe area support for devices with notch/home indicator
  - Using dvh (dynamic viewport height) units for better browser chrome handling
  - Toast notification positioning avoids safe area overlap

### Changed

- **Logging Improvements** (#42)
  - INFO level now focuses on user-facing events only (generation complete, errors, user actions)
  - DEBUG level shows development details (40+ logs moved from INFO including session start/stop, queue operations)
  - TRACE level shows very detailed state changes (widget rendering logs moved from INFO)
  - Significantly reduced console verbosity at default INFO level

## [1.2.0] - 2025-10-11

### Added

- Multiple concurrent streaming sessions support (#43)
  - Each message now maintains its own independent streaming session
  - Sessions can run concurrently without interfering with each other
  - No more image loss when sending messages quickly
  - Progress widgets show all active messages simultaneously
  - Image generation remains globally rate-limited via Bottleneck
  - Automatic session cleanup on chat changes
  - Better UX: users see all active generations

- Phase 3: Complete streaming coordination refactor with SessionManager (#41)
  - Replaced 6 scattered module-level state variables with single SessionManager
  - Replaced manual flag-based coordination with explicit Barrier pattern
  - Simplified streaming event handlers (handleFirstStreamToken, handleMessageReceivedForStreaming, handleGenerationEnded)
  - Removed ~60 lines of complex state management code
  - Better encapsulation: all session state now in one place
  - Easier to maintain and extend

- Image loading progress indicators (#19)
  - Real-time progress widget showing "Generating images: X of N"
  - Animated spinner with visual feedback
  - Works for both streaming and manual generation
  - Automatically removed after images are inserted
  - Mobile-responsive design

### Fixed

- HTML attribute escaping for image tags to prevent XSS and rendering issues (#40)
  - Added `escapeHtmlAttr()` function to escape special characters (&, ", ') in HTML attributes
  - Applied escaping to `src`, `title`, and `alt` attributes in generated image tags
  - Prevents XSS attacks and rendering issues from malicious or special characters in image URLs/titles
- Custom prompt detection patterns now passed to `hasImagePrompts()` for consistency (#40)
- Preset deletion confirmation dialog now shows correct "Delete preset" message instead of "Overwrite preset" (#40)
- Image generation now works correctly when LLM streaming is disabled (#26)
  - Extension now auto-detects whether LLM is actually streaming at runtime
  - Automatically falls back to immediate processing when LLM streaming is off
  - Removes reliance on static `streamingEnabled` setting for determining processing mode
- Progress widget no longer shows "Message element not found" errors
  - Redesigned as global fixed-position widget above user input area
  - No longer tied to message DOM elements (eliminates timing issues)
  - Shows progress for all messages with message ID context
  - Always visible and accessible regardless of scroll position
  - Works reliably in all modes (streaming, non-streaming, manual generation)
- Progress widget total count now updates correctly when new prompts are detected during streaming (#19)
  - Widget now shows accurate intermediate states (1/2, 2/3, etc.) instead of just current/current (1/1, 2/2)
  - `insertProgressWidget()` now updates total count when widget already exists instead of failing
- Progress widget now shows during image regeneration (#19)
  - Widget displays "Generating images: 0 of 1" during regeneration
  - Automatically removed after regeneration completes or fails

### Changed

- "Text changed" logging in streaming monitor changed to TRACE level to reduce log verbosity at DEBUG level

## [1.1.0] - 2025-10-09

### Added

- Prompt metadata tracking system for supporting prompt regeneration (#14)
  - Stores prompt history per-position in chat
  - Tracks image-to-prompt associations
  - De-duplicates identical prompts across chat
- AI-powered prompt update dialog (#14)
  - Click on any AI-generated image and select "Update Prompt"
  - Provide feedback on what you want to change
  - LLM automatically updates the prompt based on your feedback
  - Optionally regenerate image with updated prompt
- Minimum generation interval setting to enforce time delay between consecutive image generation requests (helps prevent rate limiting)

### Improved

- Added validation to enforce min/max constraints on all numeric settings (streaming poll interval, max concurrent generations, minimum generation interval)
- Prompt update operations now queued with generation to prevent race conditions (#14)
- Enhanced race condition protection: manual operations (generation, regeneration, prompt update) now blocked when streaming active for the same message, preventing conflicts from simultaneous operations
- Dialog positioning and mobile responsiveness (#14)
  - Regeneration confirmation dialog positioned at 35vh for easier interaction
  - Mobile-optimized layouts with responsive font sizes and spacing
  - Better button layouts with flex-wrap for small screens
  - Improved textarea styling with focus states

### Fixed

- Prompt update and regeneration confirmation dialogs now visible (#14)
  - Added CSS styling for `.auto-illustrator-dialog` class
  - Fixed invisible dialogs that prevented completing the update workflow
  - Refactored dialog CSS to use generic class for all dialogs (DRY approach)
- Defensive check for undefined `chat_metadata` prevents errors in old chats (#14)
- Dialog duplicate prevention for smoother mobile experience (#14)
- Legacy images without metadata automatically initialized on first access (#14)
- LLM prompt updates now use `generateRaw()` instead of `generateQuietPrompt()` to prevent story text generation (#14)
- Prompt IDs no longer written to message text - properly converts IDs to actual prompt text (#14)
- Image regeneration after prompt update now works correctly with separated sequential operations (#14)

### Changed

- Simplified README documentation by removing redundant image captions now that demo images are in place
- Removed REQUIRED_IMAGES.md planning document as all images are completed

## [1.0.0] - 2025-10-09

Initial release of SillyTavern Auto Illustrator extension.

### Added

- **Core Features**
  - Common style tags: Add comma-separated tags to all image prompts with configurable prefix/suffix position and automatic deduplication
  - Automatic inline image generation based on LLM-generated prompts
  - Integration with Stable Diffusion slash command (`/sd`)
  - Regex-based image prompt extraction with multi-pattern support
  - Support for multiple tag formats: HTML comments `<!--img-prompt="..."-->`, hyphenated `<img-prompt>`, and legacy underscore `<img_prompt>` tags
  - Configurable prompt detection patterns in settings UI (one regex pattern per line)

- **Streaming Image Generation**
  - Progressive image generation as streaming text arrives
  - Queue-based architecture detects prompts during LLM streaming
  - Images appear as soon as generated (no waiting for full response)
  - Configurable polling interval (100-1000ms, default 300ms)
  - Configurable max concurrent generations (1-5, default: 1)
  - Two-way handshake coordination for deferred image insertion
  - Batch image insertion using single-write approach
  - Final scan on GENERATION_ENDED to catch prompts added at end of stream
  - Per-message operation queue to serialize manual generation and regeneration operations

- **Manual Image Generation**
  - Manual generation button in message actions menu for messages with image prompts
  - Modal dialog with "Append" and "Replace" modes
  - Replace mode: Remove existing images and regenerate
  - Append mode: Keep existing images and add new ones
  - Configurable default mode in settings UI (default: Append)
  - Purple wand icon for easy identification
  - Image regeneration feature for existing images

- **Meta Prompt Management**
  - Preset management system for meta-prompt templates
  - Two predefined presets: Default and NAI 4.5 Full (optimized for NovelAI Diffusion 4.5)
  - Create, update, and delete custom presets
  - Edit mode with Save and Save As functionality
  - Preset content preview with scrollable display
  - Meta-prompt injection via CHAT_COMPLETION_PROMPT_READY event
  - Generation type filtering (normal, quiet, impersonate)

- **Chat History Pruning**
  - Removes generated `<img>` tags from chat history before sending to LLM
  - Preserves `<img_prompt>` tags so LLM recognizes format
  - Only removes images in assistant messages (preserves user-uploaded images)
  - Does not modify saved chat files, only in-memory chat

- **Validation & Feedback**
  - Real-time validation indicator for prompt detection patterns vs meta prompt
  - Visual feedback with green checkmark for valid patterns
  - Warning indicator when patterns don't match meta prompt format
  - Toastr notifications for image generation feedback

- **Internationalization**
  - Full i18n support with English (en-us) and Simplified Chinese (zh-cn)
  - 76 translation keys covering all UI text
  - Automatic language detection via SillyTavern i18n system
  - Simplified Chinese README translation (README_CN.md)

- **Logging & Debugging**
  - Centralized logging system using loglevel library
  - Contextual loggers for each module (Monitor, Queue, Processor, Generator, etc.)
  - Configurable log level in UI (TRACE, DEBUG, INFO, WARN, ERROR, SILENT)
  - Image generation duration logging
  - Comprehensive logging documentation (docs/LOGGING.md)

- **Settings & Configuration**
  - Enable/disable toggle
  - Meta-prompt template customization via presets
  - Streaming enable/disable toggle
  - Streaming poll interval slider (100-1000ms)
  - Max concurrent generations slider (1-5)
  - Prompt detection patterns configuration
  - Common style tags with prefix/suffix position control
  - Default manual generation mode (Append/Replace)
  - Log level dropdown
  - Reset to defaults button

- **Development & Testing**
  - Comprehensive unit test suite with Vitest (214 tests)
  - Tests for streaming queue, monitor, processor
  - Tests for image extraction, generation, settings
  - Tests for manual generation and regeneration
  - Full TypeScript type definitions for SillyTavern API
  - Google TypeScript Style Guide compliance with `gts`
  - Webpack build system for production bundling
  - Development documentation (docs/DEVELOPMENT.md)

- **Documentation**
  - Comprehensive README with installation, usage, troubleshooting
  - Chinese README translation (README_CN.md)
  - Development guide (docs/DEVELOPMENT.md)
  - Logging documentation (docs/LOGGING.md)
  - Architecture documentation (docs/design_doc.md, docs/silly_tavern_dev_tips.md)
  - GitHub issue template for error handling improvements

### Technical Details

- **Architecture**
  - Event-driven architecture using SillyTavern events (MESSAGE_RECEIVED, MESSAGE_UPDATED, MESSAGE_EDITED, CHAT_COMPLETION_PROMPT_READY, STREAM_TOKEN_RECEIVED, GENERATION_ENDED, CHAT_CHANGED)
  - Queue-based streaming architecture with state management
  - Modular design with single responsibility principle
  - Centralized configuration (constants.ts, types.ts, regex.ts)

- **Code Quality**
  - Built with TypeScript and Webpack
  - Zero lint warnings (Google TypeScript Style Guide)
  - Minimal use of `any` types (full type safety in production code)
  - Proper DOM type definitions in tsconfig
  - `createMockContext()` helper for clean, type-safe test mocks

- **Performance & Reliability**
  - Sequential image generation to prevent rate limiting (NovelAI 429 errors)
  - Smart deduplication prevents duplicate image generation
  - Polling-based prompt detection (300ms intervals during streaming)
  - Progressive image insertion into streaming messages
  - Position-aware image insertion handles growing streaming text
  - Graceful fallback to non-streaming mode if disabled

- **Implementation Details**
  - In-place image prompt replacement preserving text order
  - Chat history interceptor prevents LLM context pollution
  - Helper functions eliminate code duplication (~340 lines reduced)
  - Direct type imports from types.ts (no re-exports)
  - Event type references use eventTypes properties directly
  - Image titles use simple numeric indices (#1, #2, etc.)
  - Generated images persist after chat reload via context.saveChat()
  - MESSAGE_UPDATED and MESSAGE_EDITED events emitted for proper rendering
