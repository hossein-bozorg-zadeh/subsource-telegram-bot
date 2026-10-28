export interface SessionState {
  name: string;
  data: Record<string, unknown>;
  expiresAt: number;
}

interface SessionRow {
  name: string;
  data: string;
  expires_at: number;
}

const DEFAULT_TTL_SECONDS = 15 * 60;

export async function getSession(
  db: D1Database,
  telegramId: number,
): Promise<SessionState | null> {
  const row = await db
    .prepare("SELECT name, data, expires_at FROM sessions WHERE telegram_id = ?")
    .bind(telegramId)
    .first<SessionRow>();

  if (!row) return null;

  if (row.expires_at <= Date.now()) {
    await db.prepare("DELETE FROM sessions WHERE telegram_id = ?").bind(telegramId).run();
    return null;
  }

  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.data) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    data = {};
  }

  return { name: row.name, data, expiresAt: row.expires_at };
}

export async function setSession(
  db: D1Database,
  telegramId: number,
  name: string,
  data: Record<string, unknown> = {},
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  const expiresAt = Date.now() + Math.max(1, ttlSeconds) * 1000;

  await db
    .prepare(
      `INSERT INTO sessions (telegram_id, name, data, expires_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(telegram_id) DO UPDATE SET
         name = excluded.name,
         data = excluded.data,
         expires_at = excluded.expires_at,
         updated_at = datetime('now')`,
    )
    .bind(telegramId, name, JSON.stringify(data), expiresAt)
    .run();
}

export async function clearSession(
  db: D1Database,
  telegramId: number,
): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE telegram_id = ?").bind(telegramId).run();
}

/** Used by the scheduled cleanup so expired prompts do not pile up. */
export async function cleanupSessions(
  db: D1Database,
  now: number = Date.now(),
): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now).run();
}
