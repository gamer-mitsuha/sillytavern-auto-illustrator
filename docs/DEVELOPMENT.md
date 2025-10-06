## Development

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/sillytavern-auto-illustrator.git
   cd sillytavern-auto-illustrator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development Workflow

1. **Write Code**: Edit source files in `src/` directory

2. **Run Tests**: Test-driven development approach
   ```bash
   npm test              # Run all tests
   npm run test:watch    # Watch mode for TDD
   ```

3. **Lint Code**: Follow Google TypeScript Style Guide
   ```bash
   npm run lint          # Check for issues
   npm run fix           # Auto-fix formatting
   ```

4. **Build**: Compile TypeScript and bundle with Webpack
   ```bash
   npm run build         # Production build
   ```

5. **Test in SillyTavern**: Clone repo into `/public/scripts/extensions/third-party` for live testing

### Project Structure

```
sillytavern-auto-illustrator/
├── src/
│   ├── index.ts                    # Entry point, initialization, event handlers
│   ├── constants.ts                # Centralized configuration constants & validation ranges
│   ├── types.ts                    # Shared TypeScript type definitions
│   ├── regex.ts                    # Centralized regex patterns for img_prompt tags
│   ├── logger.ts                   # Structured logging with loglevel (configurable verbosity)
│   ├── prompt_injector.ts          # Meta-prompt injection via setExtensionPrompt API
│   ├── message_handler.ts          # MESSAGE_RECEIVED event handler
│   ├── image_extractor.ts          # Regex-based prompt extraction from text
│   ├── image_generator.ts          # SD command integration, image insertion
│   ├── chat_history_pruner.ts      # Removes generated images from LLM context
│   ├── settings.ts                 # Settings management & UI generation
│   ├── streaming_monitor.ts        # Monitors streaming text for new prompts
│   ├── streaming_image_queue.ts    # Queue management for detected prompts
│   ├── queue_processor.ts          # Async image generation processor
│   ├── test_helpers.ts             # Test utility functions (createMockContext)
│   ├── style.css                   # Extension styles
│   └── *.test.ts                   # Unit tests with comprehensive coverage
├── globals.d.ts                    # TypeScript type definitions (SillyTavern context)
├── manifest.json                   # Extension metadata
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration (with DOM types)
├── tsconfig.build.json             # Production build config (excludes tests)
├── webpack.config.js               # Webpack build configuration
├── .github-issue-error-handling.md # Issue template for error handling improvements
├── CHANGELOG.md                    # Version history
└── docs/
    ├── DEVELOPMENT.md              # This file
    ├── LOGGING.md                  # Logging system documentation
    └── design_doc.md               # Architecture documentation
```

### Coding Standards

- **Style Guide**: Google TypeScript Style Guide (enforced by `gts`)
- **Testing**: Vitest with comprehensive code coverage
- **Type Safety**: Strict TypeScript with minimal `any` usage
- **Architecture**: Modular design with single responsibility principle
- **Centralization**:
  - All constants in `src/constants.ts`
  - All regex patterns in `src/regex.ts`
  - All shared types in `src/types.ts`
  - All event types in `globals.d.ts` (no string fallbacks)
- **Logging**: Use structured logging via `logger.ts` (never `console.log`)
- **Test Helpers**: Use `createMockContext()` for type-safe partial mocks
- **Error Handling**: See `.github-issue-error-handling.md` for improvement roadmap

### Testing

The extension uses Vitest for unit testing with jsdom environment:

```bash
# Run all tests
npm test

# Watch mode for TDD
npm run test:watch

# Coverage report
npm run test:coverage
```

**Test Utilities:**
- `createMockContext()` - Helper for creating type-safe partial SillyTavern context mocks
- All tests use proper TypeScript types with minimal `any` usage

**Test Coverage:**
- Comprehensive test suite covering all major modules
- Image extraction and generation
- Settings management
- Streaming monitor and queue
- Queue processor
- Chat history pruning
- Message handling

### Making Changes

1. **Create a Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Write Tests First** (TDD approach):
   ```bash
   npm run test:watch
   ```

3. **Implement Feature**: Write code in `src/`

4. **Ensure Tests Pass**:
   ```bash
   npm test
   ```

5. **Lint and Format**:
   ```bash
   npm run fix
   ```

6. **Build**:
   ```bash
   npm run build
   ```

7. **Commit Changes**:
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

### Commit Message Format

Follow Conventional Commits specification:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Build/tooling changes