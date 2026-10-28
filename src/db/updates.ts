/**
 * Returns false when Telegram retries an update that was already processed.
 * `INSERT OR IGNORE` makes the claim atomic.
 */
export async function claimUpdate(
  db: D1Database,
  updateId: number,
): Promise<boolean> {
  const result = await db
    .prepare("INSERT OR IGNORE INTO processed_updates (update_id) VALUES (?)")
    .bind(updateId)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

export async function cleanupProcessedUpdates(db: D1Database): Promise<void> {
  await db
    .prepare("DELETE FROM processed_updates WHERE created_at < datetime('now', '-2 days')")
    .run();
}
