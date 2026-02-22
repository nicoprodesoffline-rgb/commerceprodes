/**
 * Centralized JSON logger.
 * Use this instead of bare console.log in API routes and server code.
 */

type LogLevel = 'info' | 'warn' | 'error';

export function log(
  level: LogLevel,
  event: string,
  data?: Record<string, unknown>,
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  };

  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}
