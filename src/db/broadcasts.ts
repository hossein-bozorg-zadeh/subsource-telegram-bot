export type BroadcastStatus = "pending" | "running" | "done" | "cancelled";

export interface BroadcastRecord {
  id: number;
  message: string;
  status: BroadcastStatus;
  cursor: number;
  sent: number;
  failed: number;
  total: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface BroadcastRecipient {
  telegram_id: number;
}

export async function createBroadcast(
  db: D1Database,
  message: string,
  createdBy: number,
  total: number,
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO broadcasts (message, created_by, total)
       VALUES (?, ?, ?)`,
    )
    .bind(message, createdBy, total)
    .run();

  return Number(result.meta?.last_row_id ?? 0);
}

export function getBroadcast(
  db: D1Database,
  id: number,
): Promise<BroadcastRecord | null> {
  return db
    .prepare("SELECT * FROM broadcasts WHERE id = ?")
    .bind(id)
    .first<BroadcastRecord>();
}

export function getLatestBroadcast(db: D1Database): Promise<BroadcastRecord | null> {
  return db
    .prepare("SELECT * FROM broadcasts ORDER BY id DESC LIMIT 1")
    .first<BroadcastRecord>();
}

export function getLatestUnfinishedBroadcast(
  db: D1Database,
): Promise<BroadcastRecord | null> {
  return db
    .prepare(
      `SELECT * FROM broadcasts
       WHERE status IN ('pending', 'running')
       ORDER BY id DESC LIMIT 1`,
    )
    .first<BroadcastRecord>();
}

export function listPendingBroadcasts(
  db: D1Database,
  limit = 3,
): Promise<{ results: BroadcastRecord[] }> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 10);

  return db
    .prepare(
      `SELECT * FROM broadcasts
       WHERE status = 'pending'
       ORDER BY id ASC LIMIT ?`,
    )
    .bind(safeLimit)
    .all<BroadcastRecord>();
}

export async function countBroadcastRecipients(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE is_blocked = 0")
    .first<{ count: number }>();

  return Number(row?.count ?? 0);
}

export function nextBroadcastRecipients(
  db: D1Database,
  cursor: number,
  limit: number,
): Promise<{ results: BroadcastRecipient[] }> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

  return db
    .prepare(
      `SELECT telegram_id FROM users
       WHERE is_blocked = 0 AND telegram_id > ?
       ORDER BY telegram_id ASC
       LIMIT ?`,
    )
    .bind(cursor, safeLimit)
    .all<BroadcastRecipient>();
}

/** Claims a pending job so two invocations cannot deliver the same batch. */
export async function claimBroadcast(db: D1Database, id: number): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE broadcasts
       SET status = 'running', updated_at = datetime('now')
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(id)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

export async function advanceBroadcast(
  db: D1Database,
  id: number,
  cursor: number,
  sent: number,
  failed: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE broadcasts
       SET cursor = ?, sent = ?, failed = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(cursor, sent, failed, id)
    .run();
}

export async function setBroadcastStatus(
  db: D1Database,
  id: number,
  status: BroadcastStatus,
): Promise<void> {
  await db
    .prepare(
      `UPDATE broadcasts
       SET status = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(status, id)
    .run();
}

/** A Worker can be evicted mid-batch; stale running jobs become resumable. */
export async function releaseStaleBroadcasts(db: D1Database): Promise<void> {
  await db
    .prepare(
      `UPDATE broadcasts
       SET status = 'pending', updated_at = datetime('now')
       WHERE status = 'running' AND updated_at < datetime('now', '-5 minutes')`,
    )
    .run();
}
