export interface DownloadRecord {
  id: number;
  telegram_id: number;
  subtitle_id: number;
  movie_id: number | null;
  language: string | null;
  title: string | null;
  created_at: string;
}

export interface DownloadWithUser extends DownloadRecord {
  username: string | null;
  first_name: string | null;
  last_name: string | null;
}

export interface DownloadPage {
  results: DownloadRecord[];
  total: number;
  page: number;
  pages: number;
}

export async function logDownload(
  db: D1Database,
  telegramId: number,
  subtitleId: number,
  movieId: number | null,
  language: string | null,
  title: string | null = null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO downloads (telegram_id, subtitle_id, movie_id, language, title)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(telegramId, subtitleId, movieId, language, title)
    .run();
}

export async function listUserDownloads(
  db: D1Database,
  telegramId: number,
  page = 1,
  perPage = 8,
): Promise<DownloadPage> {
  const size = Math.min(Math.max(Math.trunc(perPage), 1), 25);
  const totalRow = await db
    .prepare("SELECT COUNT(*) AS count FROM downloads WHERE telegram_id = ?")
    .bind(telegramId)
    .first<{ count: number }>();

  const total = Number(totalRow?.count ?? 0);
  const pages = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(Math.max(Math.trunc(page), 1), pages);
  const offset = (currentPage - 1) * size;

  const rows = await db
    .prepare(
      `SELECT * FROM downloads
       WHERE telegram_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(telegramId, size, offset)
    .all<DownloadRecord>();

  return { results: rows.results, total, page: currentPage, pages };
}

export function listRecentDownloads(
  db: D1Database,
  limit = 10,
): Promise<{ results: DownloadWithUser[] }> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);

  return db
    .prepare(
      `SELECT d.*, u.username, u.first_name, u.last_name
       FROM downloads d
       LEFT JOIN users u ON u.telegram_id = d.telegram_id
       ORDER BY d.created_at DESC, d.id DESC
       LIMIT ?`,
    )
    .bind(safeLimit)
    .all<DownloadWithUser>();
}
