# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Centralized logging system using loglevel library with configurable log levels
- Contextual loggers for each module (Monitor, Queue, Processor, Generator, etc.)
- Comprehensive logging documentation in docs/LOGGING.md
- Log level setting in UI (TRACE, DEBUG, INFO, WARN, ERROR, SILENT)
- Centralized regex patterns module (src/regex.ts) to avoid duplication
- Constants module (src/constants.ts) for settings defaults and validation ranges

### Changed
- Replaced all console.log/warn/error calls with structured logging
- Improved chat history pruner regex to match img tags regardless of attributes
- Simplified image title/alt attributes to use numeric indices (#1, #2, etc.)
- Verbose "Text changed" logs in streaming monitor now use DEBUG level instead of INFO
- Refactored regex patterns into reusable module with helper functions
- Centralized all magic numbers into constants module with proper validation ranges

### Fixed
- Chat history pruner now skips dry run operations to prevent removing images from UI when loading chats or counting tokens
- Generated images now persist after chat reload by calling context.saveChat() after image insertion

### Removed
- Direct console.log usage throughout the codebase
