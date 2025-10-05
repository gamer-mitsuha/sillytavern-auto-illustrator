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
│   ├── index.ts              # Entry point, initialization
│   ├── prompt_injector.ts    # Meta-prompt injection logic
│   ├── message_handler.ts    # MESSAGE_RECEIVED event handler
│   ├── image_extractor.ts    # Regex-based prompt extraction
│   ├── image_generator.ts    # SD command integration, toastr notifications
│   ├── settings.ts           # Settings management & UI
│   ├── test_helpers.ts       # Test utility functions (createMockContext)
│   ├── style.css             # Extension styles
│   └── *.test.ts             # Unit tests (36 tests, 100% passing)
├── globals.d.ts              # TypeScript type definitions (SillyTavern context, toastr)
├── manifest.json             # Extension metadata
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration (with DOM types)
├── tsconfig.build.json       # Production build config (excludes tests)
├── webpack.config.js         # Webpack build configuration
└── docs/
    ├── CHANGELOG.md          # Version history
    ├── DEVELOPMENT.md        # This file
    └── design_doc.md         # Architecture documentation
```

### Coding Standards

- **Style Guide**: Google TypeScript Style Guide (enforced by `gts`)
- **Testing**: Vitest with comprehensive code coverage (36 tests)
- **Type Safety**: Strict TypeScript with zero `any` in production code
- **Architecture**: Modular design with single responsibility principle
- **Test Helpers**: Use `createMockContext()` for type-safe partial mocks
- **Notifications**: Use toastr for user feedback

### Testing

The extension uses Vitest for unit testing with jsdom environment:

```bash
# Run all tests (36 tests)
npm test

# Watch mode for TDD
npm run test:watch

# Coverage report
npm run test:coverage
```

**Test Utilities:**
- `createMockContext()` - Helper for creating type-safe partial SillyTavern context mocks
- Global `toastr` mock - Prevents notification errors in tests
- All tests use proper TypeScript types (no `as any` in assertions)

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