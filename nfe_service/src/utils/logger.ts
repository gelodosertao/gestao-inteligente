/**
 * Lightweight structured logger for the NF-e service.
 * Outputs JSON lines with ISO timestamps for easy log parsing.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta !== undefined ? { meta } : {}),
  };
  return JSON.stringify(entry);
}

export const logger = {
  info(message: string, meta?: unknown): void {
    console.log(formatMessage('info', message, meta));
  },

  warn(message: string, meta?: unknown): void {
    console.warn(formatMessage('warn', message, meta));
  },

  error(message: string, meta?: unknown): void {
    console.error(formatMessage('error', message, meta));
  },

  debug(message: string, meta?: unknown): void {
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug(formatMessage('debug', message, meta));
    }
  },
};
