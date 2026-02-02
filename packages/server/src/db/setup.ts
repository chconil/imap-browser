// Database setup script - creates tables from schema
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const dbPath = process.env.DATABASE_PATH || './data/imap-browser.db';

// Ensure directory exists
const dir = dirname(dbPath);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
const createTablesSQL = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  encryption_salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  imap_host TEXT NOT NULL,
  imap_port INTEGER NOT NULL,
  imap_security TEXT NOT NULL CHECK (imap_security IN ('tls', 'starttls', 'none')),
  imap_username BLOB NOT NULL,
  imap_password BLOB NOT NULL,
  imap_iv TEXT NOT NULL,
  imap_password_iv TEXT NOT NULL,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL,
  smtp_security TEXT NOT NULL CHECK (smtp_security IN ('tls', 'starttls', 'none')),
  smtp_username BLOB NOT NULL,
  smtp_password BLOB NOT NULL,
  smtp_iv TEXT NOT NULL,
  smtp_password_iv TEXT NOT NULL,
  is_connected INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT,
  last_error TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);
CREATE INDEX IF NOT EXISTS accounts_user_id_sort_order_idx ON accounts(user_id, sort_order);

-- Folders table
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  delimiter TEXT NOT NULL,
  parent_path TEXT,
  special_use TEXT,
  total_messages INTEGER NOT NULL DEFAULT 0,
  unread_messages INTEGER NOT NULL DEFAULT 0,
  uid_validity INTEGER,
  uid_next INTEGER,
  highest_mod_seq TEXT,
  is_subscribed INTEGER NOT NULL DEFAULT 1,
  is_selectable INTEGER NOT NULL DEFAULT 1,
  has_children INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT
);
CREATE INDEX IF NOT EXISTS folders_account_id_idx ON folders(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS folders_account_path_idx ON folders(account_id, path);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  uid INTEGER NOT NULL,
  message_id TEXT,
  subject TEXT NOT NULL,
  from_json TEXT NOT NULL,
  to_json TEXT NOT NULL,
  cc_json TEXT NOT NULL,
  bcc_json TEXT NOT NULL,
  reply_to_json TEXT NOT NULL,
  date TEXT NOT NULL,
  received_at TEXT NOT NULL,
  flags_json TEXT NOT NULL,
  size INTEGER NOT NULL,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  preview_text TEXT NOT NULL,
  thread_id TEXT,
  in_reply_to TEXT,
  references_json TEXT
);
CREATE INDEX IF NOT EXISTS messages_account_id_idx ON messages(account_id);
CREATE INDEX IF NOT EXISTS messages_folder_id_idx ON messages(folder_id);
CREATE UNIQUE INDEX IF NOT EXISTS messages_folder_uid_idx ON messages(folder_id, uid);
CREATE INDEX IF NOT EXISTS messages_date_idx ON messages(date);
CREATE INDEX IF NOT EXISTS messages_message_id_idx ON messages(message_id);
CREATE INDEX IF NOT EXISTS messages_thread_id_idx ON messages(thread_id);

-- Message bodies table
CREATE TABLE IF NOT EXISTS message_bodies (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
  text_body TEXT,
  html_body TEXT,
  raw_headers_json TEXT,
  fetched_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS message_bodies_message_id_idx ON message_bodies(message_id);

-- Attachments table
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  content_id TEXT,
  disposition TEXT NOT NULL DEFAULT 'attachment' CHECK (disposition IN ('attachment', 'inline')),
  part_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS attachments_message_id_idx ON attachments(message_id);

-- Drafts table
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_json TEXT NOT NULL,
  cc_json TEXT NOT NULL,
  bcc_json TEXT NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  html_body TEXT NOT NULL,
  in_reply_to TEXT,
  references_json TEXT,
  attachment_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS drafts_account_id_idx ON drafts(account_id);
CREATE INDEX IF NOT EXISTS drafts_user_id_idx ON drafts(user_id);

-- Draft attachments table
CREATE TABLE IF NOT EXISTS draft_attachments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS draft_attachments_user_id_idx ON draft_attachments(user_id);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  navigation_mode TEXT NOT NULL DEFAULT 'dropdown' CHECK (navigation_mode IN ('dropdown', 'tree')),
  emails_per_page INTEGER NOT NULL DEFAULT 50,
  preview_lines INTEGER NOT NULL DEFAULT 2,
  default_signature TEXT NOT NULL DEFAULT '',
  reply_quote_position TEXT NOT NULL DEFAULT 'top' CHECK (reply_quote_position IN ('top', 'bottom')),
  enable_desktop_notifications INTEGER NOT NULL DEFAULT 1,
  enable_sound_notifications INTEGER NOT NULL DEFAULT 0,
  auto_sync_interval INTEGER NOT NULL DEFAULT 5,
  auto_lock_timeout INTEGER NOT NULL DEFAULT 15,
  updated_at TEXT NOT NULL
);
`;

// Execute each statement
const statements = createTablesSQL.split(';').filter(s => s.trim());
for (const stmt of statements) {
  if (stmt.trim()) {
    try {
      db.exec(stmt + ';');
    } catch (err) {
      // Ignore errors for CREATE INDEX IF NOT EXISTS on already existing indexes
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (!errorMsg.includes('already exists')) {
        console.error('Error executing:', stmt.substring(0, 50) + '...');
        console.error(errorMsg);
      }
    }
  }
}

console.log('Database tables created successfully!');
console.log('Database path:', dbPath);

db.close();
