/**
 * D1 persistence layer. Conversation history is scoped to a QQ group/session,
 * while affection and blacklist records use QQ Open Platform user IDs.
 */
export interface ApiUsageStats {
  total_api_calls: number; total_tokens: number;
  today_api_calls: number; today_tokens: number;
}
/** 按模型 provider 统计的调用次数（全站，按北京时间计日）。 */
export interface ProviderUsage {
  nvidiaNim: number; 'workers-ai': number; total: number;
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
export type GroupTone = 'default' | 'gentle' | 'lively' | 'concise';
/** 每个群独立的一组开关。replyProbability 存在 group_settings，其余存 global_settings。 */
export interface GroupOptions {
  replyProbability: number;
  aiEnabled: boolean;
  atOnly: boolean;
  allowTools: boolean;
  tone: GroupTone;
}
export const DEFAULT_GROUP_OPTIONS: GroupOptions = {
  replyProbability: 30, aiEnabled: true, atOnly: false, allowTools: true, tone: 'default',
};
export const GROUP_TONES: { value: GroupTone; label: string; hint: string }[] = [
  { value: 'default', label: '继承全局', hint: '只使用系统提示词里的人格设定' },
  { value: 'gentle', label: '温柔陪伴', hint: '更缓慢安抚，多用陪伴式表达' },
  { value: 'lively', label: '轻快活泼', hint: '带一点迷迷时期的天真和小玩笑' },
  { value: 'concise', label: '简明扼要', hint: '一两句说完，不铺陈' },
];
export const TONE_PROMPTS: Record<GroupTone, string> = {
  default: '',
  gentle: '\n\n## 本群语气设定\n更温柔、更缓慢一些，多用安抚与陪伴的表达，句子可以稍长。',
  lively: '\n\n## 本群语气设定\n更轻快活泼，可以带一点迷迷时期的天真和小玩笑，但不要脱离角色。',
  concise: '\n\n## 本群语气设定\n尽量简短，一两句话把意思说完，不要铺陈和展开。',
};
export interface GroupRecord {
  group_id: string; reply_probability: number; options: GroupOptions;
  conversation_id: string; messageCount: number; lastMessageAt: number | null;
}
export interface ConversationMeta {
  conversation_id: string; last_message_at: number; messageCount: number;
  preview: string; kind: 'group' | 'c2c'; groupId: string | null;
}

export class QQBotDB {
  constructor(private db: DBApi) {}

  /**
   * 按 provider 记今日调用次数。写进 global_settings 的按日 key，靠 SQL 原子自增，
   * 不改表结构、不需要迁移，线上 D1 部署后立即生效。
   */
  async recordProviderUsage(counts: Partial<Record<'nvidia-nim' | 'workers-ai', number>>): Promise<void> {
    const date = this.todayDate(), now = Date.now();
    for (const provider of ['nvidia-nim', 'workers-ai'] as const) {
      const n = Math.trunc(Number(counts[provider] || 0));
      if (!Number.isFinite(n) || n <= 0) continue;
      await this.db.prepare(
        "INSERT INTO global_settings(setting_key,value,updated_at) VALUES(?,?,?) " +
        "ON CONFLICT(setting_key) DO UPDATE SET value=CAST(CAST(global_settings.value AS INTEGER)+CAST(? AS INTEGER) AS TEXT),updated_at=excluded.updated_at"
      ).bind('provider_usage:' + provider + ':' + date, String(n), now, n).run();
    }
  }
  /** 今日各 provider 的调用次数；没有记录时返回 0。 */
  async getProviderUsageToday(): Promise<ProviderUsage> {
    const date = this.todayDate();
    const rows = await this.db.prepare(
      "SELECT setting_key,value FROM global_settings WHERE setting_key IN (?,?)"
    ).bind('provider_usage:nvidia-nim:' + date, 'provider_usage:workers-ai:' + date).all<any>();
    let nvidiaNim = 0, workers = 0;
    for (const r of rows.results ?? []) {
      const v = Math.max(0, Math.trunc(Number(r.value) || 0));
      const key = String(r.setting_key);
      if (key.indexOf(':nvidia-nim:') >= 0) nvidiaNim = v;
      else if (key.indexOf(':workers-ai:') >= 0) workers = v;
    }
    return { nvidiaNim, 'workers-ai': workers, total: nvidiaNim + workers };
  }
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
  /** 全库用量汇总，供管理后台概览页展示（不含任何密钥或用户消息内容）。 */
  async getUsageOverview():Promise<{totalCalls:number;totalTokens:number;todayCalls:number;todayTokens:number;todayProviders:ProviderUsage;days:{date:string;calls:number;tokens:number}[]}>{
    const date=this.todayDate();
    const total=await this.db.prepare("SELECT COALESCE(SUM(api_calls),0) c,COALESCE(SUM(total_tokens),0) t FROM api_usage").first<any>();
    const today=await this.db.prepare("SELECT COALESCE(SUM(api_calls),0) c,COALESCE(SUM(total_tokens),0) t FROM api_usage WHERE date=?").bind(date).first<any>();
    const r=await this.db.prepare("SELECT date,SUM(api_calls) c,SUM(total_tokens) t FROM api_usage GROUP BY date ORDER BY date DESC LIMIT 7").all<any>();
    const todayProviders=await this.getProviderUsageToday();
    return {
      totalCalls:Number(total?.c??0),totalTokens:Number(total?.t??0),
      todayCalls:Number(today?.c??0),todayTokens:Number(today?.t??0),
      todayProviders,
      days:(r.results??[]).map(x=>({date:String(x.date),calls:Number(x.c??0),tokens:Number(x.t??0)})).reverse(),
    };
  }

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const row=await this.db.prepare("SELECT messages FROM conversations WHERE conversation_id=?").bind(conversationId).first<any>();
    if(row?.messages) try { const parsed=JSON.parse(row.messages); return Array.isArray(parsed)?parsed:[]; } catch {}
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
    const row=await this.db.prepare("SELECT reply_probability FROM group_settings WHERE group_id=?").bind(groupId).first<any>();
    if(row){const v=Number(row.reply_probability);if(Number.isFinite(v))return Math.max(0,Math.min(100,v));}
    // 后台「全局设置」里可改新群默认概率；没改过就是 30。
    const raw=await this.getGlobalSetting('default_reply_probability');
    const def=Number(raw);
    const value=Number.isFinite(def)&&def>=0&&def<=100?Math.trunc(def):30;
    await this.setReplyProbability(groupId,value);
    return value;
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
  /** 会话列表只取元信息，避免后台一次拉回全部历史消息。 */
  async getConversationMeta(limit=50):Promise<ConversationMeta[]>{
    const rows=await this.getConversationList(limit);
    return rows.map(r=>{
      let messages:any[]=[];
      try{const parsed=JSON.parse(r.messages||"[]");if(Array.isArray(parsed))messages=parsed;}catch{}
      const last=messages.at(-1);
      const isGroup=String(r.conversation_id).startsWith('group:');
      return {
        conversation_id:r.conversation_id,last_message_at:r.last_message_at,
        messageCount:messages.length,
        preview:last?String(last.content??"").replace(/\s+/g," ").slice(0,60):"",
        kind:isGroup?'group' as const:'c2c' as const,
        groupId:isGroup?String(r.conversation_id).slice(6):null,
      };
    });
  }
  async deleteConversation(conversationId:string):Promise<void>{
    await this.db.prepare("DELETE FROM conversations WHERE conversation_id=?").bind(conversationId).run();
  }

  /** ===== 后台：群目录与每群独立设置 ===== */
  /** 合并「显式配置过的群」与「聊过天因此有会话的群」，GUI 里能直接选到真实群。 */
  async listGroupDirectory():Promise<GroupRecord[]>{
    const [settings,convs]=await Promise.all([
      this.db.prepare("SELECT group_id FROM group_settings").all<any>(),
      this.db.prepare("SELECT conversation_id,last_message_at,messages FROM conversations WHERE conversation_id LIKE 'group:%'").all<any>(),
    ]);
    const byId=new Map<string,{messageCount:number;lastMessageAt:number|null}>();
    (settings.results??[]).forEach(r=>byId.set(String(r.group_id),{messageCount:0,lastMessageAt:null}));
    (convs.results??[]).forEach(r=>{
      const id=String(r.conversation_id).slice(6);if(!id)return;
      let count=0;try{const p=JSON.parse(r.messages||'[]');if(Array.isArray(p))count=p.length;}catch{}
      const prev=byId.get(id)||{messageCount:0,lastMessageAt:null};
      byId.set(id,{messageCount:count,lastMessageAt:Number(r.last_message_at)||prev.lastMessageAt});
    });
    const out:GroupRecord[]=[];
    for(const [id,meta] of byId){
      const options=await this.getGroupOptions(id);
      out.push({group_id:id,reply_probability:options.replyProbability,options,
        conversation_id:'group:'+id,messageCount:meta.messageCount,lastMessageAt:meta.lastMessageAt});
    }
    return out.sort((a,b)=>(b.lastMessageAt||0)-(a.lastMessageAt||0));
  }
  async getGroupOptions(groupId:string):Promise<GroupOptions>{
    const row=await this.db.prepare("SELECT reply_probability FROM group_settings WHERE group_id=?").bind(groupId).first<any>();
    const raw=await this.getGlobalSetting('group_options:'+groupId);
    let saved:any={};
    if(raw){try{const p=JSON.parse(raw);if(p&&typeof p==='object')saved=p;}catch{saved={}}}
    const prob=Number(row?.reply_probability);
    return {
      replyProbability:Number.isFinite(prob)?Math.max(0,Math.min(100,prob)):DEFAULT_GROUP_OPTIONS.replyProbability,
      aiEnabled:typeof saved.aiEnabled==='boolean'?saved.aiEnabled:DEFAULT_GROUP_OPTIONS.aiEnabled,
      atOnly:typeof saved.atOnly==='boolean'?saved.atOnly:DEFAULT_GROUP_OPTIONS.atOnly,
      allowTools:typeof saved.allowTools==='boolean'?saved.allowTools:DEFAULT_GROUP_OPTIONS.allowTools,
      tone:GROUP_TONES.some(t=>t.value===saved.tone)?saved.tone:DEFAULT_GROUP_OPTIONS.tone,
    };
  }
  async setGroupOptions(groupId:string,patch:Partial<GroupOptions>):Promise<GroupOptions>{
    const current=await this.getGroupOptions(groupId);
    if(patch.replyProbability!==undefined){
      const v=Number(patch.replyProbability);
      if(Number.isFinite(v))await this.setReplyProbability(groupId,Math.max(0,Math.min(100,Math.trunc(v))));
    }
    const next={aiEnabled:current.aiEnabled,atOnly:current.atOnly,allowTools:current.allowTools,tone:current.tone};
    if(typeof patch.aiEnabled==='boolean')next.aiEnabled=patch.aiEnabled;
    if(typeof patch.atOnly==='boolean')next.atOnly=patch.atOnly;
    if(typeof patch.allowTools==='boolean')next.allowTools=patch.allowTools;
    if(patch.tone&&GROUP_TONES.some(t=>t.value===patch.tone))next.tone=patch.tone;
    await this.setGlobalSetting('group_options:'+groupId,JSON.stringify(next));
    return this.getGroupOptions(groupId);
  }

  /** ===== 后台：会话消息可读 / 可编辑 ===== */
  async editConversationMessage(conversationId:string,index:number,content:string):Promise<ChatMessage[]>{
    const messages=await this.getMessages(conversationId);
    if(!Number.isInteger(index)||index<0||index>=messages.length)throw new Error('消息序号无效');
    messages[index]={...messages[index],content:String(content).slice(0,4000)};
    await this.replaceMessages(conversationId,messages);
    return messages;
  }
  async deleteConversationMessage(conversationId:string,index:number):Promise<ChatMessage[]>{
    const messages=await this.getMessages(conversationId);
    if(!Number.isInteger(index)||index<0||index>=messages.length)throw new Error('消息序号无效');
    messages.splice(index,1);
    await this.replaceMessages(conversationId,messages);
    return messages;
  }
  async clearConversation(conversationId:string):Promise<void>{
    await this.replaceMessages(conversationId,[]);
  }
  async getGlobalSetting(key:string):Promise<string|null>{
    const row=await this.db.prepare("SELECT value FROM global_settings WHERE setting_key=?").bind(key).first<any>();
    return row?.value??null;
  }
  async setGlobalSetting(key:string,value:string):Promise<void>{
    await this.db.prepare("INSERT INTO global_settings(setting_key,value,updated_at) VALUES(?,?,?) ON CONFLICT(setting_key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .bind(key,value,Date.now()).run();
  }
  private todayDate():string{return new Date(Date.now()+8*3600000).toISOString().slice(0,10);}
}
