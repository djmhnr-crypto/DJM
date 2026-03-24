PRAGMA foreign_keys=OFF;
ALTER TABLE users RENAME TO users_old;
CREATE TABLE users (
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
INSERT INTO users SELECT * FROM users_old;
DROP TABLE users_old;
UPDATE users SET role='OWNER' WHERE id='admin-001';
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
PRAGMA foreign_keys=ON;
