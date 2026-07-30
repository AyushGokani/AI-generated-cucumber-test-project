export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let minLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function write(level: LogLevel, message: string, meta?: unknown): void {
  if (!shouldLog(level)) return;
  const ts = new Date().toISOString();
  const line = `[${ts}] ${level.toUpperCase()} ${message}`;
  if (meta !== undefined) {
    // eslint-disable-next-line no-console
    console[level === "debug" ? "log" : level](line, meta);
  } else {
    // eslint-disable-next-line no-console
    console[level === "debug" ? "log" : level](line);
  }
}

export const logger = {
  debug: (m: string, meta?: unknown) => write("debug", m, meta),
  info: (m: string, meta?: unknown) => write("info", m, meta),
  warn: (m: string, meta?: unknown) => write("warn", m, meta),
  error: (m: string, meta?: unknown) => write("error", m, meta),
};
