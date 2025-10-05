# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Automatic inline image generation based on LLM-generated prompts
- Meta-prompt injection using SillyTavern's `setExtensionPrompt` API
- Regex-based image prompt extraction (`<img_prompt="...">` format)
- Integration with Stable Diffusion slash command (`/sd`)
- Toastr notifications for image generation feedback
  - Info: "Generating X images..." when starting
  - Success: When all images generated successfully
  - Warning: For partial success scenarios
  - Error: When all images failed
- **Streaming image generation** (NEW!)
  - Generate images progressively as streaming text arrives
  - Queue-based architecture detects prompts during LLM streaming
  - Images appear as soon as generated (no waiting for full response)
  - Configurable polling interval (100-1000ms, default 300ms)
  - Configurable max concurrent generations (default: 1 for rate limiting)
  - Significantly reduces perceived latency for image generation
- Chat history pruning using `CHAT_COMPLETION_PROMPT_READY` event
  - Removes generated `<img>` tags from chat history before sending to LLM
  - Preserves `<img_prompt>` tags so LLM recognizes its own format
  - Only removes images in assistant messages (preserves user-uploaded images)
  - Does not modify saved chat files, only in-memory chat sent to LLM
- Image generation duration logging
  - Logs individual image generation time
  - Logs total batch time and average per image
- Settings panel with configurable options:
  - Enable/disable toggle
  - Word interval slider (50-1000 words)
  - Meta-prompt template customization
  - Enable streaming image generation toggle
  - Streaming poll interval slider (100-1000ms)
  - Max concurrent generations slider (1-5)
  - Reset to defaults button
- Event-driven architecture using MESSAGE_RECEIVED, MESSAGE_EDITED, CHAT_COMPLETION_PROMPT_READY, GENERATION_STARTED, and GENERATION_ENDED events
- Comprehensive unit test suite with Vitest (114 tests, 100% passing)
  - 22 tests for streaming queue data structure
  - 23 tests for streaming monitor (polling, prompt detection, lifecycle)
  - 14 tests for queue processor (concurrency control, state management)
  - 6 tests for progressive image insertion (insertImageIntoMessage)
  - 49 tests for existing functionality (extraction, generation, settings, prompt injection)
- Full TypeScript type definitions for SillyTavern API
- Google TypeScript Style Guide compliance with `gts`
- Webpack build system for production bundling

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

## [1.0.0] - TBD

Initial release
