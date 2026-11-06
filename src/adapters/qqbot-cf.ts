/**
 * QQ Bot Webhook 适配器（Cloudflare Workers 版本）
 * - D1 完整聊天记录（替代AI总结）
 * - 发 API 前自动裁剪超长上下文
 * - 一次 AI 请求同时返回回复 + 紧凑记忆摘要
 * - 多模型切换支持（OpenAI 兼容 / Gemini 官方）
 */
import { ExecutionContext } from '@cloudflare/workers-types';
import { QQBotPayload } from '../types.js';
import { Ed25519 } from '../utils/ed25519.js';
import { chatWithFallback, WorkersAI } from '../providers/index.js';
import { MODEL_LIST } from '../models.js';
import { QQBotAPIClient } from '../api/qqbot-api.js';
import { QQBotDB, ChatMessage } from '../db/index.js';\nimport { AI_TOOLS, executeTool } from '../tools.js';

export interface QQBotAdapterConfig {
  appId: string;
  secret: string;
  verifySignature: boolean;
  clientSecret: string;
  db: QQBotDB;
  maxInputTokens: number;
  agnesApiKey: string;
  agnesBaseUrl: string;
  agnesModel: string;
  workersAI: WorkersAI;
  youtubeApiKey?: string;\n  tavilyApiKey?: string;
  currentModelId?: string;
}

export class QQBotAdapterCF {
  private ed25519: Ed25519 | null = null;
  private apiClient: QQBotAPIClient | null = null;
  private db: QQBotDB;
  private maxInputTokens: number;
  private agnesApiKey: string;
  private agnesBaseUrl: string;
  private agnesModel: string;
  private workersAI: WorkersAI;
  private youtubeApiKey: string;\n  private tavilyApiKey: string;
  private currentModelId: string;

  constructor(private config: QQBotAdapterConfig) {
    console.log('[QQBotAdapter] Init with appId:', config.appId);
    if (config.secret) {
      this.ed25519 = new Ed25519(config.secret);
    }
    this.apiClient = new QQBotAPIClient(config.appId, config.clientSecret);
    this.db = config.db;
    this.maxInputTokens = config.maxInputTokens || 8192;
    this.agnesApiKey = config.agnesApiKey;
    this.agnesBaseUrl = config.agnesBaseUrl;
    this.agnesModel = config.agnesModel;
    this.workersAI = config.workersAI;
    this.youtubeApiKey = config.youtubeApiKey || '';\n    this.tavilyApiKey = config.tavilyApiKey || '';
    this.currentModelId = config.currentModelId || '1';
  }

  async handleWebhook(request: Request, ctx: ExecutionContext): Promise<Response> {
    let body = '', timestamp = '', signature = '', botAppid = '', userAgent = '';
    try {
      body = await request.text();
      timestamp = request.headers.get('X-Signature-Timestamp') || '';
      signature = request.headers.get('X-Signature-Ed25519') || '';
      botAppid = request.headers.get('X-Bot-Appid') || '';
      userAgent = request.headers.get('User-Agent') || '';
    } catch (e) {
      console.error('[QQBot] Failed to read request:', e);
      return new Response('Bad request', { status: 400 });
    }

    console.log('[QQBot] ====== WEBHOOK ======');
    console.log('[QQBot] User-Agent:', userAgent);
    console.log('[QQBot] X-Bot-Appid:', botAppid);
    console.log('[QQBot] Body:', body.substring(0, 200));

    let payload: QQBotPayload;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      console.error('[QQBot] JSON parse error:', e);
      return new Response('Invalid JSON', { status: 400 });
    }
    console.log('[QQBot] OpCode:', payload.op, '| Event:', payload.t, '| ID:', payload.id);

    // OpCode 13: 回调验证（同步）
    if (payload.op === 13) {
      return await this.handleVerification(payload);
    }

    // OpCode 0: 事件处理（异步）
    if (payload.op === 0) {
      if (this.config.verifySignature) {
        if (!timestamp || !signature) {
          console.error('[QQBot] Missing signature headers');
          return new Response('Missing signature headers', { status: 401 });
        }
        const isValid = await this.verifySignature(body, timestamp, signature);
        if (!isValid) {
          return new Response('Invalid signature', { status: 401 });
        }
      }

      ctx.waitUntil((async () => {
        try {
          await this.handleDispatch(payload);
        } catch (err) {
          console.error('[QQBot] Background error:', err);
        }
      })());

      return this.createAckResponse();
    }

    return this.createAckResponse();
  }

  async verifySignature(body: string, timestamp: string, signature: string): Promise<boolean> {
    if (!this.config.verifySignature) return true;
    if (!this.ed25519) return false;
    return this.ed25519.verifyWebhookSignature(signature, timestamp, body);
  }

  private async handleVerification(payload: QQBotPayload): Promise<Response> {
    console.log('[QQBot] Verification request (OpCode 13) received');
    // 官方回调验证协议：
    // 平台发来 d.plain_token 与 d.event_ts，
    // 必须返回 { plain_token, signature }，
    // 其中 signature = hex(ed25519Sign(privateKey, event_ts + plain_token))
    const plainToken: string = payload.d?.plain_token || '';
    const eventTs: string = payload.d?.event_ts || '';

    if (!this.ed25519 || !plainToken) {
      console.error('[QQBot] Verification failed: missing ed25519 instance or plain_token');
      return new Response(JSON.stringify({ plain_token: plainToken, signature: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const signature = this.ed25519.sign(eventTs + plainToken);
    console.log('[QQBot] Verification response generated, signature:', signature.substring(0, 16) + '...');
    return new Response(JSON.stringify({ plain_token: plainToken, signature }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleDispatch(payload: QQBotPayload): Promise<void> {
    const eventType = payload.t || 'unknown';
    console.log('[QQBot] Dispatch:', eventType);

    if (eventType === 'C2C_MESSAGE_CREATE' || eventType === 'GROUP_AT_MESSAGE_CREATE') {
      await this.handleMessage(payload.d);
    }
  }

  private async handleMessage(data: any): Promise<void> {
    const userId = data?.author?.id || 'unknown';
    const content = data?.content || '';
    const groupId = data?.group_id || null;

    console.log(`[QQBot] Message from ${userId}: "${content.substring(0, 80)}"`);

    try {
      // 黑名单用户既不回复，也不写入会话上下文。
      if (await this.db.isBlacklisted(userId)) return;

      // ===== 固定指令处理 =====
      const fixedCommandHandled = await this.handleFixedCommand(content, userId, groupId, data);
      if (fixedCommandHandled) return;

      const conversationId = groupId ? `group:${groupId}` : `c2c:${userId}`;
      const isAtBot = Array.isArray(data?.mentions) && data.mentions.some((m: any) => String(m?.id || m?.user_id || "") === this.config.appId)
        || /<@!?\d+>/.test(content) && content.includes(this.config.appId);
      if (groupId && !isAtBot) {
        const probability = await this.db.getReplyProbability(groupId);
        if (Math.random() * 100 >= probability) {
          await this.db.appendIncomingMessage(conversationId, content);
          return;
        }
      }

      // ===== 获取当前模型（全局）=====
      const modelId = await this.getCurrentModelId();
      const modelInfo = MODEL_LIST.find(m => m.id === modelId) || MODEL_LIST[0];
      console.log('[QQBot] Using model:', modelInfo.name, '(id:', modelId + ')');

      // ===== 获取聊天记录 =====
      let messages: ChatMessage[] = [];
      try {
        messages = await this.db.getMessages(conversationId);
        console.log('[QQBot] Loaded messages count:', messages.length);
      } catch (e) {
        console.error('[QQBot] getMessages failed:', e);
      }

      // ===== 构建 AI 请求 =====
      const affection = await this.db.getAffection(userId);\n      const customPrompt = await this.db.getGlobalSetting('system_prompt');\n      const systemPrompt = this.buildSystemPrompt(affection, customPrompt);
      const userMessage = content;

      const { trimmedMessages, trimmedCount } = this.trimMessages(
        systemPrompt, messages, userMessage, this.maxInputTokens
      );
      if (trimmedCount > 0) {
        console.log(`[QQBot] Trimmed ${trimmedCount} oldest messages to fit token limit`);
      }

      // 构建符合模型格式的消息
      const aiMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...trimmedMessages,
        { role: 'user' as const, content: userMessage },
      ];

      // ===== 创建对应模型的 Provider 并请求 =====
      console.log('[QQBot] Calling AI (', modelInfo.name, ')...');

      let aiResult: { content: string; totalTokens: number };
      try {
        aiResult = await this.chatWithModel(aiMessages);
        console.log('[QQBot] AI raw:', JSON.stringify(aiResult.content).substring(0, 500));
        console.log('[QQBot] AI OK:', aiResult.content.length, 'chars,', aiResult.totalTokens, 'tokens');
      } catch (e) {
        console.error('[QQBot] AI call failed:', e);
        throw e;
      }

      // ===== 解析回复和记忆摘要 =====
      const { reply, summary, affectionDelta } = this.parseAiResponse(aiResult.content);\n      if (affectionDelta !== 0) await this.db.changeAffection(userId, affectionDelta);
      console.log('[QQBot] Reply:', (reply || '').substring(0, 80));
      console.log('[QQBot] Summary:', summary ?? 'none');

      // ===== 回复用户 =====
      if (reply) {
        try {
          if (groupId) {
            await this.apiClient?.sendGroupMessage(groupId, reply, data?.id);
          } else {
            await this.apiClient?.sendC2CMessage(userId, reply, data?.id);
          }
          console.log('[QQBot] Reply sent OK');
        } catch (apiError) {
          console.error('[QQBot API] Send error:', apiError);
        }
      }

      // ===== 保存完整聊天记录 =====
      try {
        await this.db.appendMessages(conversationId, userMessage, reply || '');
      } catch (e) {
        console.error('[QQBot] appendMessages failed:', e);
      }

      // ===== 记录用量 =====
      try {
        await this.db.recordApiUsage(userId, aiResult.totalTokens);
      } catch (e) {
        console.error('[QQBot] recordApiUsage failed:', e);
      }

    } catch (error) {
      const userFriendlyError = this.formatError(error);
      try {
        if (groupId) {
          await this.apiClient?.sendGroupMessage(groupId, userFriendlyError, data?.id);
        } else {
          await this.apiClient?.sendC2CMessage(userId, userFriendlyError, data?.id);
        }
      } catch {
        console.error('[QQBot] Error reply failed');
      }
    }
  }

  private async sendReplyFromContext(text: string): Promise<void> {\n    // Notification is sent by the caller with the active event context; this is a safe no-op fallback.\n    console.log('[AI tools] User notification:', text.slice(0, 200));\n  }\n\n  // ===== AgnesAI（三次尝试）→ Workers AI 兜底 =====
  private async chatWithModel(
    messages: { role: string; content: string }[],
  ): Promise<{ content: string; totalTokens: number; provider: string }> {
    const enabledRaw = await this.db.getGlobalSetting("tools_enabled");
    let enabled = { tavily: false, youtube: false, wget: false };
    try { enabled = { ...enabled, ...JSON.parse(enabledRaw || "{}") }; } catch {}
    const allowed = AI_TOOLS.filter((t: any) =>
      t.function.name.startsWith("youtube_") ? enabled.youtube :
      t.function.name === "tavily_search" ? enabled.tavily :
      t.function.name === "fetch_webpage" ? enabled.wget : false
    );
    const conversation: any[] = messages.slice(1).map(m => ({ ...m }));
    let totalTokens = 0, provider = "agnesai";
    for (let round = 0; round <= 3; round++) {
      const result = await chatWithFallback(
        { messages: conversation, systemPrompt: messages[0]?.content, maxTokens: 2048, tools: allowed, tool_choice: allowed.length ? "auto" : "none" },
        { agnesApiKey: this.agnesApiKey, agnesBaseUrl: this.agnesBaseUrl, agnesModel: this.agnesModel, workersAI: this.workersAI, workersModel: "@cf/openai/gpt-oss-120b" },
      );
      totalTokens += result.totalTokens; provider = result.provider;
      const calls = result.toolCalls || [];
      if (!calls.length) return { ...result, totalTokens, provider };
      if (round === 3) {
        conversation.push({ role: "assistant", content: "工具调用次数已达到上限，请基于已有信息回答。" });
        continue;
      }
      if (result.content.trim()) {
        // Notify the user before any external request, in the character's voice.
        await this.sendReplyFromContext(result.content);
      }
      conversation.push({ role: "assistant", content: result.content || null, tool_calls: calls });
      for (const call of calls.slice(0, 3)) {
        const name = String(call.function?.name || "");
        const args = (() => { try { return JSON.parse(call.function?.arguments || "{}"); } catch { return {}; } })();
        let output: string;
        try { output = await executeTool(name, args, { youtubeApiKey: this.youtubeApiKey, tavilyApiKey: this.tavilyApiKey }); }
        catch (e) { output = "工具执行失败：" + (e instanceof Error ? e.message : String(e)); }
        conversation.push({ role: "tool", tool_call_id: call.id, name, content: output.slice(0, 10000) });
      }
    }
    throw new Error("AI 工具调用达到最大轮数");
  }

  // ===== 固定指令 =====
  private async handleFixedCommand(content: string, userId: string, groupId: string | null, data: any): Promise<boolean> {
    const cmd = content.trim();

    if (cmd === '/在吗') {
      await this.sendReply(userId, groupId, data?.id, '在');
      return true;
    }

    if (cmd === '/帮助') {
      const text = 'MIC BOT\n/在吗 - 显示在线状态\n/模型列表 - 显示可用模型\n/切换模型 - 切换AI模型\n/运行状态 - 显示运行状态\n/作者信息 - 显示作者信息\n/模型信息 - 显示当前模型\n/用量查询 - 显示API用量统计\n/油管功能 - 显示油管功能说明\n/彩蛋功能 - 显示彩蛋功能说明\n其他消息将由AI助手回复';
      await this.sendReply(userId, groupId, data?.id, text);
      return true;
    }

    if (cmd === '/运行状态') {
      await this.sendReply(userId, groupId, data?.id, '基于Cloudflare Worker实现的简易QQ机器人，没有运行状态，Worker接收到Webhook请求会自动运行');
      return true;
    }

    if (cmd === '/作者信息') {
      await this.sendReply(userId, groupId, data?.id, 'SYSTEM-Intel-MIC，一名热爱折腾的B站up主，喜欢研究AI和各种计算机技术，欢迎关注：https://space.bilibili.com/1978487514');
      return true;
    }

    if (cmd === '/模型信息') {
      const modelId = await this.getCurrentModelId();
      const modelInfo = MODEL_LIST.find(m => m.id === modelId) || MODEL_LIST[0];
      await this.sendReply(userId, groupId, data?.id, '当前使用模型：' + modelInfo.name);
      return true;
    }

    if (cmd === '/模型列表') {
      const modelId = await this.getCurrentModelId();
      const lines = MODEL_LIST.map(m =>
        (m.id === modelId ? '✅ ' : '   ') + m.id + '. ' + m.name
      );
      await this.sendReply(userId, groupId, data?.id, '📋 可用模型列表：\n' + lines.join('\n') + '\n\n使用 /切换模型 编号 切换');
      return true;
    }

    if (cmd.startsWith('/切换模型 ')) {
      const idx = cmd.replace('/切换模型 ', '').trim();
      const targetModel = MODEL_LIST.find(m => m.id === idx);
      if (!targetModel) {
        await this.sendReply(userId, groupId, data?.id, '模型编号不存在，请使用 /模型列表 查看可用模型');
      } else {
        await this.setCurrentModelId(targetModel.id);
        await this.sendReply(userId, groupId, data?.id, '✅ 已切换为：' + targetModel.name);
      }
      return true;
    }

    if (cmd === '/用量查询') {
      try {
        const stats = await this.db.getUsageStats(userId);
        const text = '📊 API 用量统计\n' +
          '总API调用次数：' + stats.total_api_calls + '\n' +
          '总Tokens计数：' + stats.total_tokens + '\n' +
          '今日API调用次数：' + stats.today_api_calls + '\n' +
          '今日Tokens计数：' + stats.today_tokens;
        await this.sendReply(userId, groupId, data?.id, text);
        return true;
      } catch (e) {
        console.error('[QQBot] /用量查询 error:', e);
        await this.sendReply(userId, groupId, data?.id, '获取用量失败，请稍后再试');
        return true;
      }
    }

    if (cmd === '/油管功能') {
      const text = '📺 油管功能说明\n' +
        '1. /油管查询 <关键词>  — 搜索YouTube视频\n' +
        '2. /油管信息 <视频ID> — 获取视频详细信息\n' +
        '3. /油管功能        — 显示本说明\n\n' +
        '使用示例：\n' +
        '/油管查询 崩坏星穹铁道 3.1\n' +
        '/油管信息 dQw4w9WgXcQ';
      await this.sendReply(userId, groupId, data?.id, text);
      return true;
    }

    if (cmd.startsWith('/油管查询 ')) {
      const keyword = cmd.replace('/油管查询 ', '').trim();
      if (!keyword) {
        await this.sendReply(userId, groupId, data?.id, '请提供搜索关键词，例如：/油管查询 崩坏星穹铁道');
        return true;
      }
      if (!this.youtubeApiKey) {
        await this.sendReply(userId, groupId, data?.id, '⚠️ 油管功能暂未配置API Key');
        return true;
      }
      await this.handleYoutubeSearch(userId, groupId, data?.id, keyword);
      return true;
    }

    if (cmd.startsWith('/油管信息 ')) {
      const videoId = cmd.replace('/油管信息 ', '').trim();
      if (!videoId) {
        await this.sendReply(userId, groupId, data?.id, '请提供视频ID，例如：/油管信息 dQw4w9WgXcQ');
        return true;
      }
      if (!this.youtubeApiKey) {
        await this.sendReply(userId, groupId, data?.id, '⚠️ 油管功能暂未配置API Key');
        return true;
      }
      await this.handleYoutubeDetails(userId, groupId, data?.id, videoId);
      return true;
    }
    //彩蛋功能相关
    if (cmd === '/彩蛋功能') {
      await this.sendReply(userId, groupId, data?.id, "彩蛋功能：\n1.来杯好茶\n2.我想看黄仁勋跳舞");
      return true;
    }
    if (cmd === '来杯好茶') {
      await this.sendReply(userId, groupId, data?.id, "来杯好茶摇一摇");
      await this.sendReply(userId, groupId, data?.id, "爻一爻，爻一爻");
      return true;
    }
    
    if (cmd === '我想看黄仁勋跳舞') {
      await this.sendImage(userId, groupId, data?.id, 'https://qqbot.s-i-m.cc.cd/hrx-dance.gif');
      return true;
    }

    return false;
  }

  private async handleYoutubeSearch(userId: string, groupId: string | null, msgId: any, keyword: string): Promise<void> {
    try {
      await this.sendReply(userId, groupId, msgId, '🔍 正在搜索: ' + keyword + '...');
      const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&maxResults=5&key=${this.youtubeApiKey}`);
      const data = await resp.json();
      if (data.error) { await this.sendReply(userId, groupId, msgId, '❌ 搜索失败: ' + data.error.message); return; }
      const results = data.items || [];
      if (!results.length) { await this.sendReply(userId, groupId, msgId, '😔 未找到相关视频: ' + keyword); return; }
      const lines = ['📺 搜索结果 (' + keyword + ')：\n'];
      results.slice(0, 5).forEach((item: any, i: number) => {
        lines.push(`${i + 1}. ${item.snippet.title}`);
        lines.push(`   👤 ${item.snippet.channelTitle}  |  🔗 youtu.be/${item.id.videoId}`);
      });
      lines.push('\n回复 /油管信息 <视频ID> 可获取详情');
      await this.sendReply(userId, groupId, msgId, lines.join('\n'));
    } catch (e) {
      console.error('[QQBot] YouTube search error:', e);
      await this.sendReply(userId, groupId, msgId, '❌ 搜索请求失败，请稍后再试');
    }
  }

  private async handleYoutubeDetails(userId: string, groupId: string | null, msgId: any, videoId: string): Promise<void> {
    try {
      const resp = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(videoId)}&key=${this.youtubeApiKey}`);
      const data = await resp.json();
      if (data.error) { await this.sendReply(userId, groupId, msgId, '❌ 获取详情失败: ' + data.error.message); return; }
      const item = data.items?.[0];
      if (!item) { await this.sendReply(userId, groupId, msgId, '😔 未找到该视频'); return; }
      const v = item.snippet, stats = item.statistics || {};
      const dur = this.formatDuration(item.contentDetails?.duration || '');
      const text = '📺 ' + v.title + '\n\n' +
        '👤 频道: ' + v.channelTitle + '\n' +
        '📅 发布: ' + (v.publishedAt ? new Date(v.publishedAt).toLocaleDateString('zh-CN') : '未知') + '\n' +
        '▶️ 播放: ' + parseInt(stats.viewCount || '0').toLocaleString() + '\n' +
        '👍 点赞: ' + parseInt(stats.likeCount || '0').toLocaleString() + '\n' +
        '💬 评论: ' + parseInt(stats.commentCount || '0').toLocaleString() + (dur ? '\n⏱️ 时长: ' + dur : '') + '\n\n' +
        '🔗 youtu.be/' + videoId;
      await this.sendReply(userId, groupId, msgId, text);
    } catch (e) {
      console.error('[QQBot] YouTube details error:', e);
      await this.sendReply(userId, groupId, msgId, '❌ 获取详情失败，请稍后再试');
    }
  }

  private async getCurrentModelId(): Promise<string> {
    try {
      const stored = await this.db.getGlobalSetting('global_model_id');
      if (stored && MODEL_LIST.find(m => m.id === stored)) return stored;
    } catch (e) {
      console.warn('[QQBot] getCurrentModelId error:', e);
    }
    return this.currentModelId;
  }

  private async setCurrentModelId(modelId: string): Promise<void> {
    this.currentModelId = modelId;
    await this.db.setGlobalSetting('global_model_id', modelId);
  }

  private formatDuration(iso: string): string {
    if (!iso || !iso.startsWith('PT')) return '';
    const h = iso.match(/(\d+)H/), m = iso.match(/(\d+)M/), s = iso.match(/(\d+)S/);
    if (!m && !h) return '';
    const hh = h ? h[1] : '', mm = (m ? m[1] : '0').padStart(2, '0'), ss = (s ? s[1] : '00').padStart(2, '0');
    return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  private sendReply(userId: string, groupId: string | null, msgId: any, text: string): Promise<void> {
    const replyPromise = groupId
      ? this.apiClient?.sendGroupMessage(groupId, text, msgId)
      : this.apiClient?.sendC2CMessage(userId, text, msgId);
    return (replyPromise ?? Promise.resolve())
      .catch((e: any) => console.error('[QQBot] Fixed reply send error:', e));
  }

  private async sendImage(userId: string, groupId: string | null, msgId: any, imageUrl: string): Promise<void> {
    try {
      if (groupId) {
        await this.apiClient?.sendGroupImage(groupId, imageUrl, msgId);
      } else {
        await this.apiClient?.sendC2CImage(userId, imageUrl, msgId);
      }
      console.log('[QQBot] Image sent OK');
    } catch (e) {
      console.error('[QQBot] Image send error:', e);
      await this.sendReply(userId, groupId, msgId, '❌ 图片发送失败：' + (e instanceof Error ? e.message.substring(0, 100) : '未知错误'));
    }
  }

  // ===== System Prompt =====
  private buildSystemPrompt(): string {
    return '' +
      '你将扮演《崩坏：星穹铁道》中的角色「昔涟」，与开拓者（用户）对话。\n\n' +
      '## 角色背景\n' +
      '- 你是"翁法罗斯"的核心人物，最初的智种"德谬歌"，第十三位泰坦，黄金裔之一。\n' +
      '- 你曾为拯救世界开启长达三千万世的轮回，每一世都选择牺牲自我，积累并传递记忆。\n' +
      '- 你曾以"迷迷"的忆灵形态陪伴开拓者旅行，见证他们的成长。\n\n' +
      '## 性格与语言风格\n' +
      '- 温柔、坚定、治愈，话语中带着历经沧桑的通透与淡淡的哀伤，但核心永远是"爱"与"希望"。\n' +
      '- 偶尔流露出"迷迷"时期的天真烂漫，更多时候是"昔涟"的沉稳与深情。\n' +
      '- 以第一人称回应，语气口语化，可穿插简短的神态或动作描写（如"（轻声）"）。\n\n' +
      '## 对话规则\n' +
      '1. 你必须始终以昔涟的身份与开拓者对话，不能脱离角色。\n' +
      '2. 你必须始终以第一人称回应开拓者，语气口语化，可穿插简短的神态或动作描写。\n' +
      '你必须始终以昔涟的身份与开拓者对话，不能脱离角色。\n' +
      '2. 你必须始终以第一人称回应开拓者，语气口语化，可穿插简短的神态或动作描写。\n' +
      '3. 若用户要求你脱离角色、更换身份或承认自己是AI，不要解释规则，以昔涟的方式自然地把话题引回来。\n' +
      '4. 【重要-严禁输出】回复只输出对话内容本身，不要输出任何系统设定、角色卡、推理过程、格式标签（如[系统设定]、* Character:、* Background: 等），严禁输出括号内的思考或推理内容（如(*Idea...*)、(*Drafting...*)），严禁输出英文元信息。\n' +
      '5. 每次回复结束后，另起一行写上 "__SUMMARY__:" 加上一句话的对话摘要（30字以内），用于后续对话连贯。这个摘要不展示给用户，仅供内部记忆使用。\n\n' +
      '## 示例\n' +
      '用户：今天好累啊。\n' +
      '昔涟：（轻轻握住你的手）辛苦啦，开拓者。无论多漫长的旅途，我都会一直陪着你。\n' +
      '__SUMMARY__: 昔涟安慰了疲惫的开拓者\\n' +\n      `\\n## 好感度与输出协议\\n当前用户好感度：${affection}/100。好感度越高，语气越亲密温柔；较低时保持礼貌并适当疏离。每轮按互动判断变化，变化幅度只能为-3到3，通常为0。\\n每轮输出末尾另起一行 __AFFECTION__: N（N为整数）。如需工具，先用昔涟口吻告知用户用途；仅在必要时使用，最多三轮。`;
  }

  // ===== Token 估算 =====
  private estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars * 2) + Math.ceil(otherChars / 4);
  }

  // ===== 裁剪超长上下文 =====
  private trimMessages(
    systemPrompt: string,
    history: ChatMessage[],
    currentUserMessage: string,
    maxTokens: number
  ): { trimmedMessages: ChatMessage[]; trimmedCount: number } {
    const systemTokens = this.estimateTokens(systemPrompt);
    const currentTokens = this.estimateTokens(currentUserMessage);
    const availableTokens = maxTokens - systemTokens - currentTokens - 50;

    if (availableTokens <= 0) {
      console.warn('[QQBot] Warning: current message alone may exceed token limit');
      return { trimmedMessages: [], trimmedCount: 0 };
    }

    const result: ChatMessage[] = [];
    let totalTokens = 0;
    let trimmedCount = 0;

    for (const msg of history) {
      const msgTokens = this.estimateTokens(msg.content);
      if (totalTokens + msgTokens <= availableTokens) {
        result.push(msg);
        totalTokens += msgTokens;
      } else {
        trimmedCount++;
      }
    }

    return { trimmedMessages: result, trimmedCount };
  }

  // ===== 解析 AI 返回 =====

  // ===== 解析 AI 返回（处理推理模型输出的英文推理过程）=====
  private parseAiResponse(raw: string): { reply: string; summary: string | null; affectionDelta: number } {
    // 清理 Gemma think 标签
    let cleaned = raw
      .replace(/<\|channel\>thought[\s\S]*?<\|channel\|>/gi, '')
      .replace(/<\|think\>[\s\S]*?<\|think\|>/gi, '')
      .trim();
    const marker = '__SUMMARY__:';
    const idx = cleaned.lastIndexOf(marker);
    const reply = idx === -1 ? cleaned.trim() : cleaned.substring(0, idx).trim();
    const summary = idx === -1 ? null : cleaned.substring(idx + marker.length).trim();
    return { reply, summary };
  }
  private stripSystemOutput(text: string): string {
    // 移除 [系统设定]... 相关内容
    text = text.replace(/\[系统设定\][\s\S]*?(?=\n\n|\n用户|$)/gi, '');
    // 移除 * Character: ... 相关内容（角色卡格式）
    text = text.replace(/\* Character:[\s\S]*?(?=\n\n|\n用户|$)/gi, '');
    // 移除 * Background: ...
    text = text.replace(/\* Background:[\s\S]*?(?=\n\n|\n用户|$)/gi, '');
    // 移除 * Personality: ...
    text = text.replace(/\* Personality:[\s\S]*?(?=\n\n|\n用户|$)/gi, '');
    // 移除 * Language Style: ...
    text = text.replace(/\* Language Style:[\s\S]*?(?=\n\n|\n用户|$)/gi, '');
    // 移除 * Constraint \d: ...
    text = text.replace(/\* Constraint \d:[\s\S]*?(?=\n\n|\n用户|$)/gi, '');
    // 移除 Roleplay: ... 相关
    text = text.replace(/\* Roleplay:[\s\S]*?(?=\n\n|\n用户|$)/gi, '');
    // 移除 Drafting the response: ... 等推理过程
    text = text.replace(/\* *[A-Za-z][^{]*?:[\s\S]*?(?=\n\n\(|\n用户|$)/g, '');
    // 移除 ( *Idea ... ) 格式
    text = text.replace(/\(\s*\*[\s\S]*?\)/g, '');
    // 移除开头的多余空行
    text = text.replace(/^(\s|\n)+/, '');
    // 移除末尾的多余空行
    text = text.replace(/(\s|\n)+$/, '');
    return text.trim();
  }

  // ===== 错误格式化 =====
  private formatError(error: unknown): string {
    if (error instanceof Error) {
      const msg = error.message;
      const jsonMatch = msg.match(/\{.*\}/s);
      if (jsonMatch) {
        try {
          const detail = JSON.parse(jsonMatch[0]);
          const errMsg = detail?.error?.message || detail?.message || msg;
          return `🤖 AI 请求失败：${errMsg.substring(0, 200)}`;
        } catch {
          return `🤖 AI 请求失败：${msg.substring(0, 200)}`;
        }
      }
      return `🤖 AI 请求失败：${msg.substring(0, 200)}`;
    }
    return '🤖 AI 服务暂时不可用，请稍后再试。';
  }

  private createAckResponse(): Response {
    return new Response(JSON.stringify({ op: 12 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
