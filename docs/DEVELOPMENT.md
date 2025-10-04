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
│   ├── image_generator.ts    # SD command integration
│   ├── settings.ts           # Settings management & UI
│   ├── style.css             # Extension styles
│   └── *.test.ts             # Unit tests
├── globals.d.ts              # TypeScript type definitions
├── manifest.json             # Extension metadata
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── webpack.config.js         # Webpack build configuration
└── README.md                 # This file
```

### Coding Standards

- **Style Guide**: Google TypeScript Style Guide (enforced by `gts`)
- **Testing**: Vitest with comprehensive code coverage
- **Type Safety**: Strict TypeScript with proper type definitions
- **Architecture**: Modular design with single responsibility principle

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