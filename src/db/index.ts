/**
 * D1 persistence layer. Conversation history is scoped to a QQ group/session,
 * while affection and blacklist records use QQ Open Platform user IDs.
 */
export interface ApiUsageStats {
  total_api_calls: number; total_tokens: number;
  today_api_calls: number; today_tokens: number;
}
export interface DBStatement {
  bind(...args: unknown[]): DBStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success?: boolean }>;
  run(): Promise<{ success?: boolean; meta?: { changes?: number } }>;
}
export interface DBApi { prepare(sql: string): DBStatement; }
export interface ChatMessage { role: "user" | "assistant"; content: string; }
export interface UserRecord { user_id: string; affection: number; updated_at: number; }

export class QQBotDB {
  constructor(private db: DBApi) {}

  async recordApiUsage(userId: string, tokens: number): Promise<void> {
    const date = this.todayDate(), now = Date.now();
    await this.db.prepare(
      "INSERT INTO api_usage (user_id,date,api_calls,total_tokens,updated_at) VALUES (?,?,1,?,?) " +
      "ON CONFLICT(user_id,date) DO UPDATE SET api_calls=api_calls+1,total_tokens=total_tokens+excluded.total_tokens,updated_at=excluded.updated_at"
    ).bind(userId,date,tokens,now).run();
  }
  async getUsageStats(userId: string): Promise<ApiUsageStats> {
    const date=this.todayDate();
    const total=await this.db.prepare("SELECT COALESCE(SUM(api_calls),0) total_api_calls,COALESCE(SUM(total_tokens),0) total_tokens FROM api_usage WHERE user_id=?").bind(userId).first<any>();
    const today=await this.db.prepare("SELECT COALESCE(api_calls,0) today_api_calls,COALESCE(total_tokens,0) today_tokens FROM api_usage WHERE user_id=? AND date=?").bind(userId,date).first<any>();
    return {total_api_calls:total?.total_api_calls??0,total_tokens:total?.total_tokens??0,today_api_calls:today?.today_api_calls??0,today_tokens:today?.today_tokens??0};
  }

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const row=await this.db.prepare("SELECT messages FROM conversations WHERE conversation_id=?").bind(conversationId).first<any>();
    if(row?.messages) try { const parsed=JSON.parse(row.messages); return Array.isArray(parsed)?parsed:[]; } catch {}
    // One-time compatibility read of the legacy private-session table.
    if(conversationId.startsWith("c2c:")) {
      const legacy=await this.db.prepare("SELECT messages FROM user_context WHERE user_id=?").bind(conversationId.slice(4)).first<any>();
      const raw=legacy?.messages ?? legacy?.chat_history;
      if(raw) try { const parsed=JSON.parse(raw); return Array.isArray(parsed)?parsed:[]; } catch {}
    }
    return [];
  }
  async appendIncomingMessage(conversationId:string,userMsg:string,maxMessages=80):Promise<void>{
    const messages=await this.getMessages(conversationId);
    messages.push({role:"user",content:userMsg});
    const now=Date.now();
    await this.db.prepare("INSERT INTO conversations(conversation_id,messages,last_message_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET messages=excluded.messages,last_message_at=excluded.last_message_at,updated_at=excluded.updated_at")
      .bind(conversationId,JSON.stringify(messages.slice(-maxMessages)),now,now).run();
  }
  async appendMessages(conversationId: string,userMsg: string,assistantMsg: string,maxMessages=80): Promise<void> {
    const messages=await this.getMessages(conversationId);
    messages.push({role:"user",content:userMsg},{role:"assistant",content:assistantMsg});
    const bounded=messages.slice(-maxMessages),now=Date.now();
    await this.db.prepare(
      "INSERT INTO conversations(conversation_id,messages,last_message_at,updated_at) VALUES(?,?,?,?) " +
      "ON CONFLICT(conversation_id) DO UPDATE SET messages=excluded.messages,last_message_at=excluded.last_message_at,updated_at=excluded.updated_at"
    ).bind(conversationId,JSON.stringify(bounded),now,now).run();
  }
  async replaceMessages(conversationId:string,messages:ChatMessage[]):Promise<void>{
    const now=Date.now();
    await this.db.prepare("INSERT INTO conversations(conversation_id,messages,last_message_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET messages=excluded.messages,last_message_at=excluded.last_message_at,updated_at=excluded.updated_at")
      .bind(conversationId,JSON.stringify(messages.slice(-80)),now,now).run();
  }

  async getAffection(userId:string):Promise<number>{
    await this.db.prepare("INSERT OR IGNORE INTO user_affection(user_id,affection,updated_at) VALUES(?,50,?)").bind(userId,Date.now()).run();
    const row=await this.db.prepare("SELECT affection FROM user_affection WHERE user_id=?").bind(userId).first<any>();
    return Math.max(0,Math.min(100,Number(row?.affection??50)));
  }
  async changeAffection(userId:string,delta:number):Promise<number>{
    const safe=Number.isFinite(delta)?Math.max(-3,Math.min(3,Math.trunc(delta))):0;
    await this.db.prepare("INSERT INTO user_affection(user_id,affection,updated_at) VALUES(?,MAX(0,MIN(100,50+?)),?) ON CONFLICT(user_id) DO UPDATE SET affection=MAX(0,MIN(100,affection+?)),updated_at=excluded.updated_at")
      .bind(userId,safe,Date.now(),safe).run();
    return this.getAffection(userId);
  }
  async setAffection(userId:string,value:number):Promise<void>{
    await this.db.prepare("INSERT INTO user_affection(user_id,affection,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET affection=excluded.affection,updated_at=excluded.updated_at")
      .bind(userId,Number.isFinite(value)?Math.max(0,Math.min(100,Math.trunc(value))):50,Date.now()).run();
  }
  async listUsers(limit=100):Promise<UserRecord[]>{
    const r=await this.db.prepare("SELECT user_id,affection,updated_at FROM user_affection ORDER BY updated_at DESC LIMIT ?").bind(Math.min(500,Math.max(1,limit))).all<UserRecord>();
    return r.results??[];
  }
  async getReplyProbability(groupId:string):Promise<number>{
    await this.db.prepare("INSERT OR IGNORE INTO group_settings(group_id,reply_probability,updated_at) VALUES(?,30,?)").bind(groupId,Date.now()).run();
    const row=await this.db.prepare("SELECT reply_probability FROM group_settings WHERE group_id=?").bind(groupId).first<any>();
    return Math.max(0,Math.min(100,Number(row?.reply_probability??30)));
  }
  async setReplyProbability(groupId:string,value:number):Promise<void>{
    await this.db.prepare("INSERT INTO group_settings(group_id,reply_probability,updated_at) VALUES(?,?,?) ON CONFLICT(group_id) DO UPDATE SET reply_probability=excluded.reply_probability,updated_at=excluded.updated_at")
      .bind(groupId,Number.isFinite(value)?Math.max(0,Math.min(100,Math.trunc(value))):30,Date.now()).run();
  }
  async listGroups():Promise<{group_id:string;reply_probability:number}[]>{
    const r=await this.db.prepare("SELECT group_id,reply_probability FROM group_settings ORDER BY group_id LIMIT 500").bind().all<any>();
    return r.results??[];
  }
  async isBlacklisted(userId:string):Promise<boolean>{
    return !!(await this.db.prepare("SELECT user_id FROM blacklist WHERE user_id=?").bind(userId).first());
  }
  async setBlacklisted(userId:string,blocked:boolean):Promise<void>{
    if(blocked) await this.db.prepare("INSERT OR IGNORE INTO blacklist(user_id,created_at) VALUES(?,?)").bind(userId,Date.now()).run();
    else await this.db.prepare("DELETE FROM blacklist WHERE user_id=?").bind(userId).run();
  }
  async listBlacklist():Promise<string[]>{
    const r=await this.db.prepare("SELECT user_id FROM blacklist ORDER BY created_at DESC LIMIT 500").bind().all<any>();
    return (r.results??[]).map(x=>String(x.user_id));
  }
  async getConversationList(limit=50):Promise<{conversation_id:string;last_message_at:number;messages:string}[]>{
    const r=await this.db.prepare("SELECT conversation_id,last_message_at,messages FROM conversations ORDER BY last_message_at DESC LIMIT ?").bind(Math.min(100,Math.max(1,limit))).all<any>();
    return r.results??[];
  }
  async getGlobalSetting(key:string):Promise<string|null>{
    const row=await this.db.prepare("SELECT value FROM global_settings WHERE setting_key=?").bind(key).first<any>();
    return row?.value??null;
  }
  async setGlobalSetting(key:string,value:string):Promise<void>{
    await this.db.prepare("INSERT INTO global_settings(setting_key,value,updated_at) VALUES(?,?,?) ON CONFLICT(setting_key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .bind(key,value,Date.now()).run();
  }
  async getModelId(_userId:string):Promise<string>{return "1";}
  async setModelId(_userId:string,_modelId:string):Promise<void>{}
  private todayDate():string{return new Date(Date.now()+8*3600000).toISOString().slice(0,10);}
}
