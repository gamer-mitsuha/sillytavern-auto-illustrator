# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of Auto Illustrator extension
- Automatic inline image generation based on LLM-generated prompts
- Meta-prompt injection system for instructing LLMs to generate image prompts
- Regex-based image prompt extraction (`<img_prompt="...">` format)
- Integration with Stable Diffusion slash command (`/sd`)
- Settings panel with configurable options:
  - Enable/disable toggle
  - Word interval slider (50-1000 words)
  - Meta-prompt template customization
  - Reset to defaults button
- Event-driven architecture using SillyTavern's MESSAGE_RECEIVED and MESSAGE_EDITED events
- Comprehensive unit test suite with Vitest
- TypeScript type definitions for SillyTavern API
- Google TypeScript Style Guide compliance with `gts`
- Webpack build system for production bundling
- Development workflow with TDD support

### Technical Details
- Built with TypeScript and Webpack
- Modular architecture with single responsibility principle
- Synchronous prompt interceptor for in-place chat array modification
- Proper event type constants usage (avoiding string literals)
- Context initialization inside initialize() function for proper timing
- In-place image prompt replacement preserving text order

## [1.0.0] - TBD

Initial release
