-- D1 schema（全新安装；本项目不再提供旧库迁移，请使用新数据库）。
CREATE TABLE IF NOT EXISTS api_usage (
 id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,date TEXT NOT NULL,
 api_calls INTEGER DEFAULT 0,total_tokens INTEGER DEFAULT 0,
 created_at INTEGER DEFAULT (unixepoch()),updated_at INTEGER DEFAULT (unixepoch()),
 UNIQUE(user_id,date)
);
CREATE TABLE IF NOT EXISTS global_settings (
 setting_key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
 conversation_id TEXT PRIMARY KEY,messages TEXT NOT NULL DEFAULT '[]',
 last_message_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_recent ON conversations(last_message_at DESC);
CREATE TABLE IF NOT EXISTS user_affection (
 user_id TEXT PRIMARY KEY,affection INTEGER NOT NULL DEFAULT 50 CHECK(affection BETWEEN 0 AND 100),
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS group_settings (
 group_id TEXT PRIMARY KEY,reply_probability INTEGER NOT NULL DEFAULT 30 CHECK(reply_probability BETWEEN 0 AND 100),
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blacklist (
 user_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL
);
