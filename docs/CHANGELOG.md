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
- Chat history pruning using `CHAT_COMPLETION_PROMPT_READY` event
  - Removes generated `<img>` tags from chat history before sending to LLM
  - Preserves `<img_prompt>` tags so LLM recognizes its own format
  - Only removes images in assistant messages (preserves user-uploaded images)
  - Does not modify saved chat files, only in-memory chat sent to LLM
- Settings panel with configurable options:
  - Enable/disable toggle
  - Word interval slider (50-1000 words)
  - Meta-prompt template customization
  - Reset to defaults button
- Event-driven architecture using MESSAGE_RECEIVED, MESSAGE_EDITED, and CHAT_COMPLETION_PROMPT_READY events
- Comprehensive unit test suite with Vitest (49 tests, 100% passing)
- Full TypeScript type definitions for SillyTavern API
- Google TypeScript Style Guide compliance with `gts`
- Webpack build system for production bundling

### Technical Details
- Built with TypeScript and Webpack
- Sequential image generation to prevent rate limiting (NovelAI 429 errors)
- Zero `any` types in production code (full type safety)
- Modular architecture with single responsibility principle
- `createMockContext()` helper for clean, type-safe test mocks
- Proper DOM type definitions in tsconfig
- Zero lint warnings
- In-place image prompt replacement preserving text order
- Chat history interceptor prevents LLM context pollution from generated images

## [1.0.0] - TBD

Initial release
