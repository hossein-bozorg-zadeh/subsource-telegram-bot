export interface CachedSubtitle {
  subtitle_id: number;
  chat_id: number;
  message_id: number;
  file_name: string | null;
  cached_at: string;
}

export async function getCachedSubtitle(
  db: D1Database,
  subtitleId: number,
): Promise<CachedSubtitle | null> {
  return db
    .prepare("SELECT * FROM sub_cache WHERE subtitle_id = ?")
    .bind(subtitleId)
    .first<CachedSubtitle>();
}

export async function saveCachedSubtitle(
  db: D1Database,
  subtitleId: number,
  chatId: number,
  messageId: number,
  fileName: string | null = null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sub_cache (subtitle_id, chat_id, message_id, file_name)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (subtitle_id) DO UPDATE
       SET chat_id = excluded.chat_id,
           message_id = excluded.message_id,
           file_name = excluded.file_name,
           cached_at = datetime('now')`,
    )
    .bind(subtitleId, chatId, messageId, fileName)
    .run();
}
