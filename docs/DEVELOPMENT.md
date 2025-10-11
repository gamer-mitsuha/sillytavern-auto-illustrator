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
│   ├── message_handler.ts          # MESSAGE_RECEIVED event handler
│   ├── image_extractor.ts          # Regex-based prompt extraction from text
│   ├── image_generator.ts          # SD command integration, image insertion
│   ├── chat_history_pruner.ts      # Removes generated images from LLM context
│   ├── settings.ts                 # Settings management & UI generation
│   ├── meta_prompt_presets.ts      # Meta-prompt preset management system
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
    ├── design_doc.md               # Architecture documentation
    └── silly_tavern_dev_tips.md    # SillyTavern extension development guide
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

#### Automated Testing

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
- Barrier coordination and session lifecycle

#### Manual Testing

**Critical**: Before merging feature branches to `main`, perform manual testing in a live SillyTavern environment.

See **[MANUAL_TESTING.md](MANUAL_TESTING.md)** for a comprehensive checklist covering:
- Streaming mode image generation
- Manual generation and regeneration
- Concurrency control
- Session management
- Error handling
- Settings persistence
- Progress widget behavior
- Performance tests
- Edge cases

**Time estimate**: 30-45 minutes for full manual test suite before each major merge.

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

### Adding New Settings

When adding a new setting to the extension, follow these steps to ensure it works correctly:

#### 1. Add the Constant (if applicable)

If the setting has min/max/default values, add them to `src/constants.ts`:

```typescript
export const MY_NEW_SETTING = {
  DEFAULT: 100,
  MIN: 0,
  MAX: 1000,
  STEP: 10,
} as const;
```

#### 2. Update the Settings Type

Add the setting field to `AutoIllustratorSettings` in `globals.d.ts`:

```typescript
interface AutoIllustratorSettings {
  // ... existing fields
  myNewSetting: number;  // Add your new field
}
```

#### 3. Add to Default Settings

Update `DEFAULT_SETTINGS` in `src/constants.ts`:

```typescript
export const DEFAULT_SETTINGS = {
  // ... existing fields
  myNewSetting: MY_NEW_SETTING.DEFAULT,
};
```

#### 4. Add UI Element ID

Add the element ID to `UI_ELEMENT_IDS` in `src/constants.ts`:

```typescript
export const UI_ELEMENT_IDS = {
  // ... existing IDs
  MY_NEW_SETTING: 'auto_illustrator_my_new_setting',
} as const;
```

#### 5. Create the UI Element

Add the HTML input/select to the settings UI in `src/settings.ts`:

```typescript
<label for="${UI_ELEMENT_IDS.MY_NEW_SETTING}">
  <span>${t('settings.myNewSetting')}</span>
  <small>${t('settings.myNewSettingDesc')}</small>
  <input id="${UI_ELEMENT_IDS.MY_NEW_SETTING}" class="text_pole" type="number"
         min="${MY_NEW_SETTING.MIN}" max="${MY_NEW_SETTING.MAX}"
         step="${MY_NEW_SETTING.STEP}" />
</label>
```

#### 6. Add i18n Translations

Add translation keys to both `i18n/en-us.json` and `i18n/zh-cn.json`:

```json
{
  "settings.myNewSetting": "My New Setting",
  "settings.myNewSettingDesc": "Description of what this setting does"
}
```

#### 7. Add to handleSettingsChange()

In `src/index.ts`, retrieve the DOM element in the `handleSettingsChange()` function:

```typescript
function handleSettingsChange(): void {
  // ... existing element retrievals
  const myNewSettingInput = document.getElementById(
    UI_ELEMENT_IDS.MY_NEW_SETTING
  ) as HTMLInputElement;

  // ... read and save the value
  settings.myNewSetting = myNewSettingInput
    ? parseInt(myNewSettingInput.value)
    : settings.myNewSetting;
```

#### 8. Add to updateUI()

In `src/index.ts`, retrieve the element and set its value in `updateUI()`:

```typescript
function updateUI(): void {
  // ... existing element retrievals
  const myNewSettingInput = document.getElementById(
    UI_ELEMENT_IDS.MY_NEW_SETTING
  ) as HTMLInputElement;

  // ... set the value
  if (myNewSettingInput)
    myNewSettingInput.value = settings.myNewSetting.toString();
```

#### 9. **CRITICAL**: Add Event Listener

In the `getApi()` function where event listeners are attached, add:

```typescript
// Get the element
const myNewSettingInput = document.getElementById(
  UI_ELEMENT_IDS.MY_NEW_SETTING
);

// Attach the event listener
myNewSettingInput?.addEventListener('change', handleSettingsChange);
```

**⚠️ Common Pitfall**: Forgetting this step will cause the setting to not persist!
The setting will appear to work but will revert to default on page reload.

#### 10. Use the Setting

Access the setting value through the `settings` object:

```typescript
// Example usage
if (settings.myNewSetting > 0) {
  // Do something with the setting
}
```

#### 11. Add Tests

Create or update tests to verify the setting works correctly:

```typescript
it('should save and load myNewSetting', () => {
  const context = createMockContext();
  context.extensionSettings.auto_illustrator = {
    myNewSetting: 500,
  };

  const loaded = loadSettings(context);
  expect(loaded.myNewSetting).toBe(500);
});
```

#### Checklist

Use this checklist when adding a new setting:

- [ ] Constant added to `src/constants.ts` (if applicable)
- [ ] Field added to `AutoIllustratorSettings` in `globals.d.ts`
- [ ] Default value added to `DEFAULT_SETTINGS` in `src/constants.ts`
- [ ] UI element ID added to `UI_ELEMENT_IDS` in `src/constants.ts`
- [ ] HTML element created in `src/settings.ts`
- [ ] i18n translations added to both `en-us.json` and `zh-cn.json`
- [ ] Element retrieved in `handleSettingsChange()` in `src/index.ts`
- [ ] Value read and saved in `handleSettingsChange()`
- [ ] Element retrieved in `updateUI()` in `src/index.ts`
- [ ] Value set in `updateUI()`
- [ ] **Element retrieved in event listener setup (getApi function)**
- [ ] **Event listener attached to trigger `handleSettingsChange()`**
- [ ] Tests added/updated
- [ ] Code formatted with `npm run fix`
- [ ] All tests pass with `npm test`

### Commit Message Format

Follow Conventional Commits specification:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Build/tooling changes