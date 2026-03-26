export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  debug(msg: string, ...args: unknown[]): void {
    if (shouldLog('debug')) {
      console.debug(`[${timestamp()}] DEBUG ${msg}`, ...args);
    }
  },
  info(msg: string, ...args: unknown[]): void {
    if (shouldLog('info')) {
      console.info(`[${timestamp()}] INFO  ${msg}`, ...args);
    }
  },
  warn(msg: string, ...args: unknown[]): void {
    if (shouldLog('warn')) {
      console.warn(`[${timestamp()}] WARN  ${msg}`, ...args);
    }
  },
  error(msg: string, ...args: unknown[]): void {
    if (shouldLog('error')) {
      console.error(`[${timestamp()}] ERROR ${msg}`, ...args);
    }
  },
};
