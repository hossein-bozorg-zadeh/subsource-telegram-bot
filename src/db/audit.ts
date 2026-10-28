export interface AdminActionRecord {
  id: number;
  admin_id: number;
  action: string;
  target: string | null;
  details: string | null;
  created_at: string;
}

/** Best-effort audit trail; callers log failures without breaking the action. */
export async function logAdminAction(
  db: D1Database,
  adminId: number,
  action: string,
  target: string | number | null = null,
  details: string | null = null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO admin_actions (admin_id, action, target, details)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(
      adminId,
      action.slice(0, 100),
      target === null ? null : String(target).slice(0, 100),
      details === null ? null : details.slice(0, 500),
    )
    .run();
}

export function listAdminActions(
  db: D1Database,
  limit = 10,
): Promise<{ results: AdminActionRecord[] }> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);

  return db
    .prepare("SELECT * FROM admin_actions ORDER BY id DESC LIMIT ?")
    .bind(safeLimit)
    .all<AdminActionRecord>();
}
