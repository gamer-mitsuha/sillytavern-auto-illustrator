# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Centralized logging system using loglevel library with configurable log levels
- Contextual loggers for each module (Monitor, Queue, Processor, Generator, etc.)
- Comprehensive logging documentation in docs/LOGGING.md

### Changed
- Replaced all console.log/warn/error calls with structured logging
- Improved chat history pruner regex to match img tags regardless of attributes
- Simplified image title/alt attributes to use numeric indices (#1, #2, etc.)

### Fixed
- Chat history pruner now skips dry run operations to prevent removing images from UI when loading chats or counting tokens

### Removed
- Direct console.log usage throughout the codebase
