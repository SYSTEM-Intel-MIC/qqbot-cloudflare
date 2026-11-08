import { QQBotDB, DEFAULT_GROUP_OPTIONS, GROUP_TONES, GroupTone } from "./db/index.js";
import { DEFAULT_SYSTEM_PROMPT } from "./persona.js";
import { FIXED_COMMANDS, NO_SLASH_ALIASES } from "./adapters/qqbot-cf.js";
import { TOOL_CATALOG, FREE_TOOL_DEFAULTS } from "./tools.js";
import { ADMIN_PAGE_HTML } from "./admin-page.js";

/**
 * 管理后台密码：明文保存在 Worker Secret `ADMIN_PASSWORD` 中，不做哈希/加密。
 * 每次 POST 都带密码校验；密码不会写进浏览器存储，也不会出现在任何日志里。
 */
export interface AdminEnv {
  ADMIN_PASSWORD?: string;
  DB: any;
  NVIDIA_MODEL?: string;
  NVIDIA_API_KEY?: string;
  TAVILY_API_KEY?: string;
  QQ_BOT_APP_ID?: string;
  QQ_BOT_SECRET?: string;
  AI?: unknown;
}
/** 占位值：部署时若仍是它，后台会明确报错而不是让一个公开默认密码生效。 */
const PLACEHOLDER = "CHANGE_ME_SET_YOUR_PASSWORD";

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'none'; frame-ancestors 'none'",
};
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: JSON_HEADERS });

/** 明文等长比较（常量时间），避免简单时序侧信道；不做任何哈希或加密。 */
function passwordEquals(input: string, expected: string): boolean {
  const a = new TextEncoder().encode(input);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** 按 IP 的失败次数限流：连错 8 次锁 10 分钟，期间输对也拒绝。 */
const failedAttempts = new Map<string, { count: number; until: number }>();

function requireId(value: unknown, label: string): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id || id.length > 200) throw new Error(label + " 不能为空，且不能超过 200 字符");
  return id;
}
function clampInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.trunc(n))) : fallback;
}
function requireIndex(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 10000) throw new Error("消息序号无效");
  return n;
}

/** 工具开关的「当前生效值」：后台保存过则以保存值为准，免密钥工具缺失键时保持默认开。 */
async function effectiveTools(db: QQBotDB, env: AdminEnv): Promise<{ tools: Record<string, boolean>; source: "auto" | "admin" }> {
  const auto: Record<string, boolean> = {
    tavily: !!env.TAVILY_API_KEY, ...FREE_TOOL_DEFAULTS,
  };
  const raw = await db.getGlobalSetting("tools_enabled");
  if (!raw) return { tools: auto, source: "auto" };
  try {
    const saved = JSON.parse(raw);
    const tools: Record<string, boolean> = { tavily: !!saved.tavily };
    for (const [key, fallback] of Object.entries(FREE_TOOL_DEFAULTS)) tools[key] = saved[key] ?? fallback;
    return { tools, source: "admin" };
  } catch { return { tools: auto, source: "auto" }; }
}

export async function handleAdmin(request: Request, env: AdminEnv): Promise<Response> {
  if (request.method === "GET") return new Response(ADMIN_PAGE_HTML, { headers: HTML_HEADERS });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (contentLength > 100000) return new Response("Payload too large", { status: 413 });

  try {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const now = Date.now(), record = failedAttempts.get(ip);
    if (record && record.until > now && record.count >= 8) {
      const minutes = Math.ceil((record.until - now) / 60000);
      return json({ error: `尝试次数过多，请在 ${minutes} 分钟后重试（此期间即使输对密码也会被拒绝）` }, 429);
    }

    const body = await request.json() as any;
    // secret put / --secrets-file 可能带入首尾空白，统一 trim；日志绝不打印密码。
    const configured = (env.ADMIN_PASSWORD || "").trim();
    if (!configured || configured === PLACEHOLDER) {
      console.error("[Admin] ADMIN_PASSWORD 未配置或仍是占位值，请在 .dev.vars 设置后重新部署");
      return json({ error: "管理员密码尚未设置：请在 .dev.vars 的 ADMIN_PASSWORD 填写明文密码后重新部署" }, 401);
    }
    const supplied = typeof body.password === "string" ? body.password.trim() : "";
    if (!supplied || !passwordEquals(supplied, configured)) {
      console.error("[Admin] 明文密码不匹配");
      const next = record && record.until > now
        ? { count: record.count + 1, until: record.until }
        : { count: 1, until: now + 10 * 60 * 1000 };
      failedAttempts.set(ip, next);
      if (failedAttempts.size > 1000) failedAttempts.delete(failedAttempts.keys().next().value!);
      return json({ error: "管理员密码错误（应与 .dev.vars 中 ADMIN_PASSWORD 完全一致）" }, 401);
    }
    failedAttempts.delete(ip);

    const db = new QQBotDB(env.DB);
    const action = String(body.action || "");

    if (action === "overview") {
      const [prompt, toolCallRaw, users, groups, blacklist, conversations, usage, globalAiRaw, defaultProbRaw, toolState] = await Promise.all([
        db.getGlobalSetting("system_prompt"),
        db.getGlobalSetting("last_tool_call"),
        db.listUsers(), db.listGroupDirectory(), db.listBlacklist(),
        db.getConversationMeta(), db.getUsageOverview(),
        db.getGlobalSetting("global_ai_enabled"),
        db.getGlobalSetting("default_reply_probability"),
        effectiveTools(db, env),
      ]);
      let lastToolCall: unknown = null;
      if (toolCallRaw) { try { lastToolCall = JSON.parse(toolCallRaw); } catch { /* 忽略损坏记录 */ } }
      const blocked = new Set(blacklist);
      const prob = Number(defaultProbRaw);
      return json({
        stats: {
          users: users.length, groups: groups.length, blacklist: blacklist.length,
          conversations: conversations.length,
          messages: conversations.reduce((sum, c) => sum + c.messageCount, 0),
        },
        usage,
        config: {
          model: env.NVIDIA_MODEL || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
          keys: {
            appId: !!env.QQ_BOT_APP_ID, secret: !!env.QQ_BOT_SECRET,
            nvidia: !!env.NVIDIA_API_KEY, ai: !!env.AI,
            tavily: !!env.TAVILY_API_KEY,
          },
          toolsSource: toolState.source, lastToolCall,
          fixedCommands: FIXED_COMMANDS.map(c => c.trim()),
          noSlashAliases: Object.keys(NO_SLASH_ALIASES),
          freeToolCount: TOOL_CATALOG.filter(t => t.free).length,
        },
        prompt: prompt || DEFAULT_SYSTEM_PROMPT,
        promptIsCustom: !!prompt,
        tools: toolState.tools,
        toolCatalog: TOOL_CATALOG,
        groupDefaults: DEFAULT_GROUP_OPTIONS,
        tones: GROUP_TONES,
        global: {
          aiEnabled: globalAiRaw !== "false",
          defaultProbability: Number.isFinite(prob) && prob >= 0 && prob <= 100 ? Math.trunc(prob) : 30,
        },
        users: users.map(u => ({ ...u, blocked: blocked.has(u.user_id) })),
        groups, blacklist, conversations,
      });
    }

    if (action === "conversation") {
      const id = requireId(body.conversationId, "会话 ID");
      return json({ messages: await db.getMessages(id) });
    }
    if (action === "message-edit") {
      const id = requireId(body.conversationId, "会话 ID");
      if (typeof body.content !== "string" || body.content.length > 4000) throw new Error("消息内容无效或超过 4000 字符");
      return json({ ok: true, messages: await db.editConversationMessage(id, requireIndex(body.index), body.content) });
    }
    if (action === "message-delete") {
      return json({ ok: true, messages: await db.deleteConversationMessage(requireId(body.conversationId, "会话 ID"), requireIndex(body.index)) });
    }
    if (action === "conversation-clear") {
      await db.clearConversation(requireId(body.conversationId, "会话 ID"));
    }
    else if (action === "conversation-delete") {
      await db.deleteConversation(requireId(body.conversationId, "会话 ID"));
    }
    else if (action === "affection") {
      await db.setAffection(requireId(body.userId, "用户 ID"), clampInt(body.affection, 50));
    }
    else if (action === "group-probability") {
      await db.setReplyProbability(requireId(body.groupId, "群 ID"), clampInt(body.probability, 30));
    }
    else if (action === "group-options") {
      // 只接受白名单字段，前端用开关 / 滑块 / 下拉提交，不需要管理员手输任何 ID 之外的内容。
      const id = requireId(body.groupId, "群 ID");
      const o = body.options && typeof body.options === "object" ? body.options : {};
      const patch: any = {};
      if (o.replyProbability !== undefined) patch.replyProbability = clampInt(o.replyProbability, DEFAULT_GROUP_OPTIONS.replyProbability);
      if (typeof o.aiEnabled === "boolean") patch.aiEnabled = o.aiEnabled;
      if (typeof o.atOnly === "boolean") patch.atOnly = o.atOnly;
      if (typeof o.allowTools === "boolean") patch.allowTools = o.allowTools;
      if (typeof o.tone === "string" && GROUP_TONES.some(t => t.value === o.tone)) patch.tone = o.tone as GroupTone;
      return json({ ok: true, options: await db.setGroupOptions(id, patch) });
    }
    else if (action === "global") {
      // 全局 AI 总开关 + 新群默认回复概率，均为 GUI 控件。
      if (typeof body.aiEnabled === "boolean") await db.setGlobalSetting("global_ai_enabled", body.aiEnabled ? "true" : "false");
      if (body.defaultProbability !== undefined) await db.setGlobalSetting("default_reply_probability", String(clampInt(body.defaultProbability, 30)));
    }
    else if (action === "blacklist") {
      await db.setBlacklisted(requireId(body.userId, "用户 ID"), !!body.blocked);
    }
    else if (action === "prompt") {
      if (typeof body.prompt !== "string" || body.prompt.length > 30000) throw new Error("提示词无效或超过 30000 字符");
      await db.setGlobalSetting("system_prompt", body.prompt);
    }
    else if (action === "prompt-reset") {
      await db.setGlobalSetting("system_prompt", "");
    }
    else if (action === "tools") {
      const { tools } = await effectiveTools(db, env);
      const next: Record<string, boolean> = {};
      // 只更新本次提交的键，旧版请求缺的免密钥工具保持开启，不会被误关。
      for (const item of TOOL_CATALOG) {
        next[item.key] = typeof body[item.key] === "boolean" ? body[item.key] : !!tools[item.key];
      }
      await db.setGlobalSetting("tools_enabled", JSON.stringify(next));
    }
    else return json({ error: "Unknown action" }, 400);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Invalid request" }, 400);
  }
}
