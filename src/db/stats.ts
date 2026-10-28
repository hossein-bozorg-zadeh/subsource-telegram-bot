export interface AdminStats {
  totalUsers: number;
  activeUsers24h: number;
  searches24h: number;
  downloads24h: number;
  admins: number;
}

export async function getAdminStats(db: D1Database): Promise<AdminStats> {
  const [users, searches, downloads, admins] = await Promise.all([
    db
      .prepare(
        `SELECT
           COUNT(*) AS total_users,
           COALESCE(SUM(CASE WHEN last_seen_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END), 0) AS active_users
         FROM users`,
      )
      .first<{ total_users: number; active_users: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM search_log WHERE created_at >= datetime('now', '-1 day')",
      )
      .first<{ count: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM downloads WHERE created_at >= datetime('now', '-1 day')",
      )
      .first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM admins").first<{ count: number }>(),
  ]);

  return {
    totalUsers: Number(users?.total_users ?? 0),
    activeUsers24h: Number(users?.active_users ?? 0),
    searches24h: Number(searches?.count ?? 0),
    downloads24h: Number(downloads?.count ?? 0),
    admins: Number(admins?.count ?? 0),
  };
}
