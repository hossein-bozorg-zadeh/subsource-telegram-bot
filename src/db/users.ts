import type { TelegramUser } from "../telegram/types";

export interface BotUser {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  is_blocked: number;
  settings: string;
  created_at: string;
  last_seen_at: string;
}

export interface UserUsage {
  searches: number;
  downloads: number;
}

export async function upsertUser(db: D1Database, user: TelegramUser): Promise<BotUser> {
  await db
    .prepare(
      `INSERT INTO users (telegram_id, username, first_name, last_name, language_code)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET
         username = excluded.username,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         language_code = excluded.language_code,
         last_seen_at = datetime('now')`,
    )
    .bind(
      user.id,
      user.username ?? null,
      user.first_name ?? null,
      user.last_name ?? null,
      user.language_code ?? null,
    )
    .run();

  const row = await db
    .prepare("SELECT * FROM users WHERE telegram_id = ?")
    .bind(user.id)
    .first<BotUser>();

  if (!row) {
    throw new Error(`Failed to load user ${user.id} after upsert`);
  }

  return row;
}

export function getUser(db: D1Database, telegramId: number): Promise<BotUser | null> {
  return db
    .prepare("SELECT * FROM users WHERE telegram_id = ?")
    .bind(telegramId)
    .first<BotUser>();
}

export interface UserCounts {
  total: number;
  blocked: number;
}

export async function countUsers(db: D1Database): Promise<UserCounts> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN is_blocked = 1 THEN 1 ELSE 0 END), 0) AS blocked
       FROM users`,
    )
    .first<{ total: number; blocked: number }>();

  return {
    total: Number(row?.total ?? 0),
    blocked: Number(row?.blocked ?? 0),
  };
}

export function listRecentUsers(
  db: D1Database,
  limit = 10,
): Promise<{ results: BotUser[] }> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);

  return db
    .prepare("SELECT * FROM users ORDER BY last_seen_at DESC LIMIT ?")
    .bind(safeLimit)
    .all<BotUser>();
}

export interface UserPage {
  results: BotUser[];
  page: number;
  pages: number;
  total: number;
}

export async function listUsers(
  db: D1Database,
  page = 1,
  perPage = 6,
): Promise<UserPage> {
  const size = Math.min(Math.max(Math.trunc(perPage), 1), 25);
  const counts = await countUsers(db);
  const pages = Math.max(1, Math.ceil(counts.total / size));
  const currentPage = Math.min(Math.max(Math.trunc(page), 1), pages);
  const offset = (currentPage - 1) * size;

  const rows = await db
    .prepare(
      `SELECT * FROM users
       ORDER BY last_seen_at DESC, telegram_id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(size, offset)
    .all<BotUser>();

  return {
    results: rows.results,
    page: currentPage,
    pages,
    total: counts.total,
  };
}

export async function setUserBlocked(
  db: D1Database,
  telegramId: number,
  blocked: boolean,
): Promise<void> {
  await db
    .prepare("UPDATE users SET is_blocked = ? WHERE telegram_id = ?")
    .bind(blocked ? 1 : 0, telegramId)
    .run();
}

export async function getUserUsage(
  db: D1Database,
  telegramId: number,
): Promise<UserUsage> {
  const [searches, downloads] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) AS count FROM search_log WHERE telegram_id = ?")
      .bind(telegramId)
      .first<{ count: number }>(),
    db
      .prepare("SELECT COUNT(*) AS count FROM downloads WHERE telegram_id = ?")
      .bind(telegramId)
      .first<{ count: number }>(),
  ]);

  return {
    searches: Number(searches?.count ?? 0),
    downloads: Number(downloads?.count ?? 0),
  };
}

export async function logSearch(
  db: D1Database,
  telegramId: number,
  kind: "movie" | "recent" | "movie-view",
  query: string,
): Promise<void> {
  await db
    .prepare("INSERT INTO search_log (telegram_id, kind, query) VALUES (?, ?, ?)")
    .bind(telegramId, kind, query.slice(0, 500))
    .run();
}


