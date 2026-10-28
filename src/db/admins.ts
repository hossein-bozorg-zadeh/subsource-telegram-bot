export interface AdminRecord {
  telegram_id: number;
  role: string;
  created_by: number | null;
  created_at: string;
}

/**
 * Admins can come from two places: the `ADMIN_TELEGRAM_IDS` environment
 * variable (bootstrap/owner account) or the `admins` table (managed later from
 * the admin panel).
 */
export async function isBotAdmin(
  db: D1Database,
  telegramId: number,
  envAdminIds: ReadonlySet<number>,
): Promise<boolean> {
  if (envAdminIds.has(telegramId)) return true;

  const row = await db
    .prepare("SELECT 1 AS ok FROM admins WHERE telegram_id = ?")
    .bind(telegramId)
    .first<{ ok: number }>();

  return Boolean(row?.ok);
}

export async function addAdmin(
  db: D1Database,
  telegramId: number,
  role = "admin",
  createdBy: number | null = null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO admins (telegram_id, role, created_by)
       VALUES (?, ?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET role = excluded.role`,
    )
    .bind(telegramId, role, createdBy)
    .run();
}

export async function removeAdmin(db: D1Database, telegramId: number): Promise<void> {
  await db.prepare("DELETE FROM admins WHERE telegram_id = ?").bind(telegramId).run();
}

export function listAdmins(db: D1Database): Promise<{ results: AdminRecord[] }> {
  return db
    .prepare("SELECT * FROM admins ORDER BY created_at ASC")
    .all<AdminRecord>();
}

export function getAdmin(
  db: D1Database,
  telegramId: number,
): Promise<AdminRecord | null> {
  return db
    .prepare("SELECT * FROM admins WHERE telegram_id = ?")
    .bind(telegramId)
    .first<AdminRecord>();
}
