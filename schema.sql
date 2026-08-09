-- QQ Bot Cloudflare Worker 数据库表结构
-- 运行以下命令创建表：
-- wrangler d1 execute qq-bot-db --command "$(cat schema.sql)" --remote --yes

-- API 用量统计表
CREATE TABLE IF NOT EXISTS api_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    api_calls INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(user_id, date)
);

-- 用户上下文记忆表（存完整聊天记录，JSON 数组）
CREATE TABLE IF NOT EXISTS user_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    messages TEXT NOT NULL DEFAULT '[]',
    last_message_at INTEGER DEFAULT (unixepoch()),
    created_at INTEGER DEFAULT (unixepoch())
);
