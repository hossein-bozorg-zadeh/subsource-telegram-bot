import {
  mergeFilters,
  parseFilters,
  serializeFilters,
  type UserFilters,
} from "../lib/filters";

/** Filter preferences are stored as JSON in `users.settings`. */
export async function getUserFilters(
  db: D1Database,
  telegramId: number,
): Promise<UserFilters> {
  const row = await db
    .prepare("SELECT settings FROM users WHERE telegram_id = ?")
    .bind(telegramId)
    .first<{ settings: string }>();

  return parseFilters(row?.settings);
}

export async function updateUserFilters(
  db: D1Database,
  telegramId: number,
  patch: Partial<UserFilters>,
): Promise<UserFilters> {
  const current = await getUserFilters(db, telegramId);
  const next = mergeFilters(current, patch);

  await db
    .prepare("UPDATE users SET settings = ? WHERE telegram_id = ?")
    .bind(serializeFilters(next), telegramId)
    .run();

  return next;
}
