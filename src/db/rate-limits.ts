export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  resetAt: number;
}

/**
 * Fixed-window counter. The key is scoped by the caller (for example
 * `search:<telegramId>`), so the same table serves multiple limits.
 */
export async function consumeRateLimit(
  db: D1Database,
  key: string,
  windowSeconds: number,
  limit: number,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const windowMs = Math.max(1, windowSeconds) * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;

  await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count)
       VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE
           WHEN rate_limits.window_start = excluded.window_start
             THEN rate_limits.count + 1
           ELSE 1
         END,
         window_start = excluded.window_start`,
    )
    .bind(key, windowStart)
    .run();

  const row = await db
    .prepare("SELECT count, window_start FROM rate_limits WHERE key = ?")
    .bind(key)
    .first<{ count: number; window_start: number }>();

  const count = Number(row?.count ?? 1);
  return { allowed: count <= limit, count, limit, resetAt };
}

export async function cleanupRateLimits(db: D1Database): Promise<void> {
  const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
  await db
    .prepare("DELETE FROM rate_limits WHERE window_start < ?")
    .bind(cutoff)
    .run();
}
