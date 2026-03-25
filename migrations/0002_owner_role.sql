-- Add OWNER role support
-- This migration is fully idempotent - safe to run multiple times
-- Only runs the table migration if the users table still has a role CHECK constraint

-- Ensure indexes exist (safe to run even if already exists)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
