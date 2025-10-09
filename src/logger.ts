/**
 * Logger Module
 * Centralized logging using loglevel library
 */

import log from 'loglevel';

// Configure loglevel with a prefix
const prefix = '[Auto Illustrator]';

// Create a root logger instance
const logger = log.getLogger('auto-illustrator');

// Set default log level (can be overridden via setLogLevel)
logger.setLevel(log.levels.INFO);

/**
 * Sets the global log level
 * @param level - Log level ('trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent')
 */
export function setLogLevel(level: log.LogLevelDesc): void {
  logger.setLevel(level);
}

/**
 * Gets the current log level
 * @returns Current log level
 */
export function getLogLevel(): log.LogLevelDesc {
  return logger.getLevel();
}

/**
 * Formats a message with optional context
 * @param context - Optional context (e.g., module name)
 * @param message - Message to log
 * @returns Formatted message
 */
function formatMessage(context: string | undefined, message: string): string {
  if (context) {
    return `${prefix} [${context}] ${message}`;
  }
  return `${prefix} ${message}`;
}

/**
 * Logs a trace message (lowest priority, most verbose)
 * @param message - Trace message
 * @param args - Additional arguments
 */
export function trace(message: string, ...args: unknown[]): void {
  logger.trace(formatMessage(undefined, message), ...args);
}

/**
 * Logs a debug message
 * @param message - Debug message
 * @param args - Additional arguments
 */
export function debug(message: string, ...args: unknown[]): void {
  logger.debug(formatMessage(undefined, message), ...args);
}

/**
 * Logs an info message
 * @param message - Info message
 * @param args - Additional arguments
 */
export function info(message: string, ...args: unknown[]): void {
  logger.info(formatMessage(undefined, message), ...args);
}

/**
 * Logs a warning message
 * @param message - Warning message
 * @param args - Additional arguments
 */
export function warn(message: string, ...args: unknown[]): void {
  logger.warn(formatMessage(undefined, message), ...args);
}

/**
 * Logs an error message
 * @param message - Error message
 * @param args - Additional arguments
 */
export function error(message: string, ...args: unknown[]): void {
  logger.error(formatMessage(undefined, message), ...args);
}

/**
 * Creates a contextual logger with a specific module prefix
 * @param context - Context name (e.g., 'Queue', 'Monitor', 'Generator')
 * @returns Contextual logger object
 */
export function createLogger(context: string) {
  return {
    trace: (message: string, ...args: unknown[]) =>
      logger.trace(formatMessage(context, message), ...args),
    debug: (message: string, ...args: unknown[]) =>
      logger.debug(formatMessage(context, message), ...args),
    info: (message: string, ...args: unknown[]) =>
      logger.info(formatMessage(context, message), ...args),
    warn: (message: string, ...args: unknown[]) =>
      logger.warn(formatMessage(context, message), ...args),
    error: (message: string, ...args: unknown[]) =>
      logger.error(formatMessage(context, message), ...args),
  };
}

// Export the underlying loglevel instance for advanced usage
export {log};
