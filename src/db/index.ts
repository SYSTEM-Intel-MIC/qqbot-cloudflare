/**
 * D1 数据库操作工具
 * - API 用量统计（api_usage 表）
 * - 完整聊天记录（user_context 表）
 * - 模型选择（user_context.model_id）
 */

export interface ApiUsageStats {
  total_api_calls: number;
  total_tokens: number;
  today_api_calls: number;
  today_tokens: number;
}

export interface DBApi {
  prepare(sql: string): {
    bind(...args: any[]): {
      first(): Promise<any>;
      run(): Promise<{ meta?: any }>;
    };
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class QQBotDB {
  constructor(private db: DBApi) {}

  // ===== API 用量统计 =====

  async recordApiUsage(userId: string, tokens: number): Promise<void> {
    const date = this.todayDate();
    const now = Date.now();
    console.log('[DB] recordApiUsage:', userId, date, tokens);
    try {
      await this.db.prepare(
        'INSERT INTO api_usage (user_id, date, api_calls, total_tokens, updated_at) VALUES (?, ?, 1, ?, ?) ' +
        'ON CONFLICT(user_id, date) DO UPDATE SET api_calls = api_calls + 1, total_tokens = total_tokens + ?, updated_at = ?'
      ).bind(userId, date, tokens, now, tokens, now).run();
      console.log('[DB] recordApiUsage: OK');
    } catch (e: any) {
      console.error('[DB] recordApiUsage ERROR:', e?.message || e);
      throw e;
    }
  }

  async getUsageStats(userId: string): Promise<ApiUsageStats> {
    const date = this.todayDate();
    console.log('[DB] getUsageStats for', userId, 'date:', date);
    try {
      const total = await this.db.prepare(
        'SELECT COALESCE(SUM(api_calls), 0) as total_api_calls, COALESCE(SUM(total_tokens), 0) as total_tokens FROM api_usage WHERE user_id = ?'
      ).bind(userId).first();
      const today = await this.db.prepare(
        'SELECT COALESCE(api_calls, 0) as today_api_calls, COALESCE(total_tokens, 0) as today_tokens FROM api_usage WHERE user_id = ? AND date = ?'
      ).bind(userId, date).first();
      return {
        total_api_calls: total?.total_api_calls ?? 0,
        total_tokens: total?.total_tokens ?? 0,
        today_api_calls: today?.today_api_calls ?? 0,
        today_tokens: today?.today_tokens ?? 0,
      };
    } catch (e: any) {
      console.error('[DB] getUsageStats ERROR:', e?.message || e);
      return { total_api_calls: 0, total_tokens: 0, today_api_calls: 0, today_tokens: 0 };
    }
  }

  // ===== 聊天记录 =====

  async getMessages(userId: string): Promise<ChatMessage[]> {
    console.log('[DB] getMessages:', userId);
    try {
      const row = await this.db.prepare(
        'SELECT chat_history FROM user_context WHERE user_id = ?'
      ).bind(userId).first();
      if (!row?.chat_history) return [];
      try {
        const parsed = JSON.parse(row.chat_history as string);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    } catch (e: any) {
      console.error('[DB] getMessages ERROR:', e?.message || e);
      return [];
    }
  }

  async appendMessages(userId: string, userMsg: string, assistantMsg: string): Promise<void> {
    const now = Date.now();
    const messages = await this.getMessages(userId);
    messages.push({ role: 'user', content: userMsg });
    messages.push({ role: 'assistant', content: assistantMsg });
    const messagesJson = JSON.stringify(messages);
    try {
      await this.db.prepare(
        'INSERT INTO user_context (user_id, chat_history, last_message_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(user_id) DO UPDATE SET chat_history = excluded.chat_history, last_message_at = excluded.last_message_at'
      ).bind(userId, messagesJson, now).run();
    } catch (e: any) {
      console.error('[DB] appendMessages ERROR:', e?.message || e);
      throw e;
    }
  }

  // ===== 模型选择 =====

  async getModelId(userId: string): Promise<string> {
    try {
      const row = await this.db.prepare(
        'SELECT model_id FROM user_context WHERE user_id = ?'
      ).bind(userId).first();
      return row?.model_id ?? '1';
    } catch {
      return '1';
    }
  }

  async setModelId(userId: string, modelId: string): Promise<void> {
    const now = Date.now();
    try {
      await this.db.prepare(
        'INSERT INTO user_context (user_id, model_id, last_message_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(user_id) DO UPDATE SET model_id = excluded.model_id, last_message_at = excluded.last_message_at'
      ).bind(userId, modelId, now).run();
      console.log('[DB] setModelId:', userId, modelId);
    } catch (e: any) {
      console.error('[DB] setModelId ERROR:', e?.message || e);
      throw e;
    }
  }

  // ===== 全局设置 =====

  async getGlobalSetting(key: string): Promise<string | null> {
    try {
      const row = await this.db.prepare(
        'SELECT value FROM global_settings WHERE setting_key = ?'
      ).bind(key).first();
      return row?.value ?? null;
    } catch {
      return null;
    }
  }

  async setGlobalSetting(key: string, value: string): Promise<void> {
    try {
      await this.db.prepare(
        'INSERT INTO global_settings (setting_key, value, updated_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(setting_key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      ).bind(key, value, Date.now()).run();
    } catch (e: any) {
      console.error('[DB] setGlobalSetting ERROR:', e?.message || e);
    }
  }

  // ===== 工具 =====

  private todayDate(): string {
    const now = new Date();
    const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return utc8.toISOString().substring(0, 10);
  }
}
