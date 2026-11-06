-- Apply once to an existing D1 database. Safe to re-run.
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
CREATE TABLE IF NOT EXISTS blacklist (user_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL);

-- Preserve legacy one-to-one private chat history as private conversations.
INSERT OR IGNORE INTO conversations(conversation_id,messages,last_message_at,updated_at)
SELECT 'c2c:' || user_id, COALESCE(messages,'[]'), COALESCE(last_message_at,unixepoch()), COALESCE(last_message_at,unixepoch())
FROM user_context WHERE user_id IS NOT NULL;
