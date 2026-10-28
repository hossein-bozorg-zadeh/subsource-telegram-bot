export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

const ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

/** Keeps logging available even when the rest of the config is invalid. */
export function normalizeLogLevel(value: string | undefined): LogLevel {
  const level = (value ?? "info").toLowerCase();
  return LOG_LEVELS.includes(level as LogLevel) ? (level as LogLevel) : "info";
}

/**
 * Structured JSON logging. Cloudflare captures `console.log` output in
 * Workers Logs / `wrangler tail`.
 */
export function createLogger(level: LogLevel): Logger {
  const minimum = ORDER[level];

  const write = (entryLevel: LogLevel, message: string, fields?: Record<string, unknown>) => {
    if (ORDER[entryLevel] < minimum) return;

    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level: entryLevel,
      message,
      ...fields,
    };

    // Keep stack traces out of JSON.stringify's ignored properties.
    const caught = entry.error;
    if (caught instanceof Error) {
      entry.error = caught.message;
      entry.stack = caught.stack;
    }

    console.log(JSON.stringify(entry));
  };

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
  };
}
