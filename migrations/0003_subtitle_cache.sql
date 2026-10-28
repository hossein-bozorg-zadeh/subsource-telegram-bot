-- Subtitle cache: maps a SubSource subtitle id to the Telegram message that
-- holds its file in the storage channel. Repeated downloads are served with
-- copyMessage from the channel instead of hitting the SubSource API again.
CREATE TABLE IF NOT EXISTS sub_cache (
  subtitle_id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  file_name TEXT,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
