# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Gallery widget now visible by default and correctly extracts images
  - Widget now visible by default for new chats (previously hidden)
  - Fixed image extraction by reusing existing `extractImagePrompts()` function
  - Supports all three prompt formats: HTML comment `<!--img-prompt="..."-->` (primary), hyphenated `<img-prompt="...">`, and legacy underscore `<img_prompt="...">`
  - Deleted broken `IMAGE_PROMPT_WITH_IMG_PATTERN` constant that only matched hyphenated format
  - State now stored per-chat in `chat_metadata` instead of global localStorage
  - Each chat remembers its own gallery visibility, minimization, and expanded messages
  - State persists with chat backups/exports
  - Widget shows automatically on initialization to scan for existing images
  - Listens for CHAT_CHANGED to reload state when switching chats
  - Listens for MESSAGE_EDITED to detect new images from manual generation
- Widget state preservation during updates
  - **Smart DOM updates**: Progress widget now uses differential DOM updates instead of full rebuilds
  - **Scroll position preservation**: Thumbnail gallery scroll positions are saved and restored during updates
  - **Image viewer state maintained**: Zoom and pan states in the image modal no longer reset during progress updates
  - **Improved performance**: Only changed elements are updated, reducing DOM thrashing
  - Fixes UX issue where interacting with images (zooming, panning, scrolling) would reset when progress updated
- Regeneration now properly clears old thumbnails
  - Progress widget clears existing completedImages array when regenerating same message
  - Thumbnail gallery updates correctly when image count decreases
  - Fixes issue where stale thumbnails remained visible during regeneration

### Added

- Permanent image gallery widget for reviewing all generated images (#50)
  - **Separate from progress widget**: Always-available gallery independent of generation progress
  - **Message grouping**: Groups images by assistant message with collapsible headers
  - **Message preview**: Shows first 100 chars of message text for context
  - **Thumbnail grid**: Responsive grid layout (100px thumbnails) with image count badges
  - **FAB minimization**: Minimizes to floating action button with image count badge
  - **State persistence**: Remembers visibility, minimization, and expanded messages in localStorage
  - **Auto-refresh**: Automatically updates when new images complete via progress manager events
  - **Global functions**: Exposed `toggleImageGallery()`, `showImageGallery()`, `hideImageGallery()` for easy access
  - **Reuses UI components**: Leverages thumbnail styling and modal patterns from progress widget
  - **Mobile responsive**: Glassmorphism design with safe-area padding and responsive layouts
  - Solves issue where users needed easy way to review all generated images in current chat
  - Located at top-right of chat area (fixed position, z-index 99)

- Two-level collapsible progress widget for improved scalability
  - **Widget-level collapse**: Entire widget collapses to compact bar showing summary (e.g., "✓ 3 message(s) complete (6 images) ▼")
  - **Message-level collapse**: Individual messages collapse to single line (e.g., "✓ Message #3: 2 ok (2 images) ▼")
  - **Smart auto-expand/collapse**: Messages that are generating stay expanded, completed messages with images auto-expand (to show thumbnails), completed messages without images can be collapsed
  - **Manual override**: Users can click to expand/collapse any message or the entire widget
    - Manual collapse/expand actions are persisted and respected by auto-expand logic
    - Collapsed messages stay collapsed until user manually expands them
  - **Space efficiency**: 5 messages reduce from ~2000px to ~600px height (1 expanded + 4 collapsed)
  - **Increased widget size**: Widget now uses explicit width and minimum height
    - Expanded width: `width: min(900px, 95%)` ensures full 900px width on desktop
    - Collapsed width: `width: min(800px, 95%)` ensures full 800px width for collapsed bar
    - Expanded height: `min-height: 350px` ensures thumbnails are fully visible without tiny scrolling
    - Fixes issue where widget stayed narrow (~300px) and short with content
  - **Better thumbnail layout**: Thumbnails now wrap to multiple rows instead of horizontal scrolling
  - **Taller widget**: Max-height increased from 70vh to 80vh for better content visibility
  - **Smooth animations**: CSS transitions with cubic-bezier easing for polished UX
  - **Persistent state tracking**: Widget remembers which messages are expanded/collapsed
  - **Clickable headers**: Entire message header is clickable to expand (not just the toggle button)
  - Solves UX problem where widget with many messages becomes unusably long

- Progress widget now remains visible after image generation completes
  - Widget stays open after all images finish generating, allowing users to review status at their convenience
  - **Close button**: Added (×) button in widget header for manual dismissal
  - **Completion indicator**: Spinner changes to green checkmark (✓) when all tasks complete
  - **Title change**: "Generating Images" changes to "Images Generated" when done
  - Users can inspect generated images and prompts before closing the widget
  - Closing the widget does not remove generated images from chat
  - Improves UX by giving users control over when to dismiss progress information

- Enhanced zoom and pan controls for image modal
  - **Desktop**: Mouse wheel zoom (progressive 1x-3x), click-and-drag panning, double-click zoom toggle
  - **Mobile**: Pinch-to-zoom gesture, one-finger panning when zoomed, double-tap zoom toggle
  - **Zoom indicator**: Shows current zoom level (e.g., "150%") with auto-fade
  - **Smart gestures**: Swipe navigation only works at 1x zoom, panning takes over when zoomed
  - **Keyboard shortcuts**: `+`/`=` to zoom in, `-` to zoom out, `0` to reset
  - **Reset button**: Dynamically appears when zoomed >1x to quickly return to fit
  - **Boundary constraints**: Panning limited to image edges with smooth containment
  - **Hardware accelerated**: Smooth 60fps transforms with GPU acceleration

### Fixed

- Desktop: Progress widget no longer overlaps with chat input area (adjusted bottom position from 0 to 2rem)
- Desktop: Image modal no longer overlaps with prompt area and action buttons
  - Replaced hardcoded image height calculation with proper flexbox layout
  - Added max-height constraints to info bar (35vh) and prompt (25vh) with scrolling
  - Image and info bar now dynamically share available vertical space
  - Long prompts scroll internally instead of pushing content out of viewport
- Mobile: Action buttons (zoom, download) now fully visible and not cut off at bottom
  - Reduced image container height (70vh → 65dvh) to reserve space for info bar
  - Limited info bar expanded height (45vh → 30dvh) to keep buttons in viewport
  - Added iOS safe area support for devices with notch/home indicator
- Mobile: Eliminated auto-scroll when expanding prompt viewer
  - Added overflow-anchor: none to prevent browser scroll adjustment
  - Added overscroll-behavior: contain to prevent scroll chaining
  - Made prompt scrollable internally instead of scrolling entire info bar
- Improved mobile compatibility: Using dvh (dynamic viewport height) units for better handling of mobile browser chrome showing/hiding

### Added

- Image preview gallery in progress widget during streaming mode (#49)
  - Shows completed images as thumbnails (100x100px) while streaming continues
  - Click thumbnails to view full-size images in modal
  - Modal features: navigation (prev/next), zoom, download, keyboard shortcuts
  - Solves issue where LLM streaming output overrides inserted image tags
  - Event-driven architecture: ProgressManager emits image-completed events
  - Images remain visible in widget until streaming completes

### Changed

- Enhanced progress widget UI with modern glassmorphism design
  - Changed layout from horizontal to vertical (column)
  - Added gradient background with enhanced blur effects (backdrop-filter: blur(16px))
  - Implemented status badge system with icons (✓ success, ✗ failed, ⏳ pending)
  - Added animated progress bar with shimmer effect
  - Increased thumbnail size from 80x80px to 100x100px with index badges
  - Enhanced hover effects with scale and shadow animations
  - Mobile optimizations with responsive padding and touch-friendly controls
- Enhanced image modal with comprehensive functionality
  - Added prev/next navigation buttons with disabled states
  - Implemented zoom on click (toggle between 1x and 1.5x scale)
  - Added download button with automatic filename generation
  - Keyboard navigation: Escape to close, Arrow keys for navigation
  - Display image index, dimensions, and full prompt text

### Fixed

- Image modal now updates in real-time when new images complete (#49)
  - Navigation buttons (next/prev) automatically enable when new images finish
  - Image count updates dynamically without needing to close and reopen modal
  - Modal now references live progress state instead of snapshot at open time
  - Provides seamless viewing experience during concurrent image generation
- Progress widget now shows cumulative count for sequential image regenerations
  - When clicking multiple regenerate buttons rapidly (e.g., 3 images), widget now shows "0/3 → 1/3 → 2/3 → 3/3" instead of "0/1 → 1/1" for each
  - Added regeneration tracking to accumulate pending and completed counts per message
  - Widget only disappears after all regenerations complete

### Changed

- Improved logging level assignments for reduced verbosity at INFO level (#42)
  - Moved 40+ internal operation logs from INFO to DEBUG level (session start/stop, queue operations, barrier signals, progress updates)
  - Moved detailed widget rendering logs from INFO to TRACE level (DOM position, CSS styles)
  - INFO level now focuses on user-facing events only (generation complete, errors, user actions)
  - DEBUG level shows development details for troubleshooting
  - TRACE level shows very detailed state changes (useful for deep debugging)

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
