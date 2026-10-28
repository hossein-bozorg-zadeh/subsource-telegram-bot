-- Subtitle title on downloads so "My downloads" can show something readable.
ALTER TABLE downloads ADD COLUMN title TEXT;

-- Broadcast jobs are processed in small batches by waitUntil/cron, so a large
-- user base never blocks a single webhook request.
CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  cursor INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts (status, updated_at);

-- Audit trail for every privileged action performed from the admin panel.
CREATE TABLE IF NOT EXISTS admin_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions (created_at);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions (admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON admin_actions (target);
