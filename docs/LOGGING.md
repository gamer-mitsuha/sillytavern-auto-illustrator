# Logging Guide

This document explains how to use the centralized logging system in the Auto Illustrator extension.

## Overview

The extension uses the [`loglevel`](https://github.com/pimterry/loglevel) library for logging, wrapped in a custom logger module for consistency.

## Basic Usage

### Global Logging

```typescript
import {info, warn, error, debug} from './logger';

info('Extension initialized');
warn('Settings not found, using defaults');
error('Failed to generate image:', err);
debug('Queue state:', queue.getState());
```

### Contextual Logging

For modules, create a contextual logger with a specific prefix:

```typescript
import {createLogger} from './logger';

const logger = createLogger('Monitor'); // Context: Monitor

logger.info('Starting monitor'); // [Auto Illustrator] [Monitor] Starting monitor
logger.warn('Message not found'); // [Auto Illustrator] [Monitor] Message not found
logger.error('Poll failed:', err); // [Auto Illustrator] [Monitor] Poll failed: ...
```

## Log Levels

The library supports 6 log levels (from most to least verbose):

1. **TRACE** (0) - Very detailed debugging information
2. **DEBUG** (1) - Detailed debugging information
3. **INFO** (2) - General informational messages (default)
4. **WARN** (3) - Warning messages
5. **ERROR** (4) - Error messages
6. **SILENT** (5) - No logging

### Setting Log Level

```typescript
import {setLogLevel, log} from './logger';

// Set to show only warnings and errors
setLogLevel(log.levels.WARN);

// Set to show all logs including debug
setLogLevel(log.levels.DEBUG);

// Disable all logging
setLogLevel(log.levels.SILENT);
```

### Log Level in Settings UI

You can add a log level control to the settings UI:

```typescript
// In settings.ts
export interface AutoIllustratorSettings {
  // ... existing settings
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
}

// Apply log level on load
import {setLogLevel, log} from './logger';

const settings = loadSettings();
setLogLevel(log.levels[settings.logLevel.toUpperCase()]);
```

## Migration Guide

### Replacing console.log

**Before:**
```typescript
console.log('[Auto Illustrator Monitor] Processing message:', messageId);
console.warn('[Auto Illustrator] Warning:', message);
console.error('[Auto Illustrator Queue] Error:', error);
```

**After:**
```typescript
import {createLogger} from './logger';
const logger = createLogger('Monitor');

logger.info('Processing message:', messageId);
logger.warn('Warning:', message);
logger.error('Error:', error);
```

### Pattern Matching

Find all console.log statements:
```bash
grep -r "console\.\(log\|warn\|error\)" src/ --include="*.ts" --exclude="*.test.ts"
```

Common patterns to replace:

| Pattern | Replacement |
|---------|-------------|
| `console.log('[Auto Illustrator] ...')` | `info('...')` |
| `console.log('[Auto Illustrator Module] ...')` | `createLogger('Module').info('...')` |
| `console.warn(...)` | `warn(...)` or `logger.warn(...)` |
| `console.error(...)` | `error(...)` or `logger.error(...)` |

## Best Practices

### 1. Use Appropriate Log Levels

```typescript
// ✅ Good
logger.debug('Queue state:', queue); // Verbose details
logger.info('Processing message'); // Normal operations
logger.warn('Retrying failed request'); // Potential issues
logger.error('Failed to save settings'); // Actual errors

// ❌ Bad
logger.info('Variable x =', x); // Use debug
logger.error('User clicked button'); // Use info
```

### 2. Use Contextual Loggers

```typescript
// ✅ Good - Clear context
const logger = createLogger('Queue');
logger.info('Added prompt');
// Output: [Auto Illustrator] [Queue] Added prompt

// ❌ Bad - Generic
info('[Queue] Added prompt');
// Output: [Auto Illustrator] [Queue] Added prompt (works but inconsistent)
```

### 3. Avoid String Concatenation

```typescript
// ✅ Good - Let the logger handle formatting
logger.info('Processing message', messageId, 'with', promptCount, 'prompts');

// ❌ Bad - Manual concatenation
logger.info('Processing message ' + messageId + ' with ' + promptCount + ' prompts');
```

### 4. Use Structured Logging for Objects

```typescript
// ✅ Good - Objects are formatted nicely
logger.debug('Queue state:', {
  size: queue.size(),
  pending: queue.getPending(),
  completed: queue.getCompleted()
});

// ❌ Bad - Loses structure
logger.debug('Queue state: size=' + queue.size() + ' pending=' + queue.getPending());
```

## Production Configuration

### Disable Debug Logs

In production, set the log level to `INFO` or higher to reduce noise:

```typescript
// In index.ts
if (process.env.NODE_ENV === 'production') {
  setLogLevel(log.levels.INFO);
} else {
  setLogLevel(log.levels.DEBUG);
}
```

### User-Configurable Logging

Allow users to control log verbosity through settings:

```html
<!-- In settings UI -->
<label>
  Log Level:
  <select id="auto_illustrator_log_level">
    <option value="debug">Debug (Verbose)</option>
    <option value="info" selected>Info (Normal)</option>
    <option value="warn">Warnings Only</option>
    <option value="error">Errors Only</option>
    <option value="silent">Silent</option>
  </select>
</label>
```

```typescript
// Update log level when setting changes
$('#auto_illustrator_log_level').on('change', (e) => {
  const level = $(e.target).val();
  setLogLevel(log.levels[level.toUpperCase()]);
});
```

## Testing

In tests, you can suppress logs or verify log output:

```typescript
import {setLogLevel, log} from './logger';

// Suppress logs during tests
beforeAll(() => {
  setLogLevel(log.levels.SILENT);
});

// Or spy on logs
import * as logger from './logger';

it('should log error on failure', () => {
  const errorSpy = vi.spyOn(logger, 'error');

  someFunction();

  expect(errorSpy).toHaveBeenCalledWith('Expected error message');
});
```

## Advanced Usage

### Custom Log Formats

The loglevel library supports custom formatting through plugins:

```typescript
import {log} from './logger';

// Add timestamps (requires loglevel-plugin-prefix)
const originalFactory = log.methodFactory;
log.methodFactory = function (methodName, logLevel, loggerName) {
  const rawMethod = originalFactory(methodName, logLevel, loggerName);

  return function (message) {
    const timestamp = new Date().toISOString();
    rawMethod(`[${timestamp}]`, message);
  };
};
log.setLevel(log.getLevel()); // Apply changes
```

### Remote Logging

For production error tracking, you can intercept error logs:

```typescript
import {log} from './logger';

const originalError = log.error;
log.error = function(...args) {
  // Send to error tracking service
  sendToSentry(args);

  // Also log normally
  originalError.apply(this, args);
};
```

## References

- [loglevel Documentation](https://github.com/pimterry/loglevel)
- [loglevel Plugins](https://github.com/pimterry/loglevel#plugins)
