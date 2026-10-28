interface SettingRow {
  value: string;
}

/** Runtime settings are stored in the `settings` table as strings. */
export const MAINTENANCE_KEY = "maintenance";

export async function getSetting(
  db: D1Database,
  key: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key)
    .first<SettingRow>();

  return row?.value ?? null;
}

export async function setSetting(
  db: D1Database,
  key: string,
  value: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = datetime('now')`,
    )
    .bind(key, value)
    .run();
}

export async function getBooleanSetting(
  db: D1Database,
  key: string,
  fallback = false,
): Promise<boolean> {
  const value = await getSetting(db, key);
  if (value === null) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}
