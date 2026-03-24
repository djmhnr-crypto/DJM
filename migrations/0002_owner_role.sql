-- Add OWNER role support via direct SQL update approach
-- Since SQLite CHECK constraints can't be easily altered,
-- we use a pragma-based workaround

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'TECHNICIAN',
  specialty TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  avatar_color TEXT DEFAULT '#3B82F6',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users_new SELECT * FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Promote the first ADMIN to OWNER
UPDATE users SET role = 'OWNER' WHERE id = 'admin-001';

PRAGMA foreign_keys = ON;
