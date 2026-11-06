/**
 * QQ Bot → Cloudflare Worker → AI 桥接服务
 */
import { ExecutionContext } from '@cloudflare/workers-types';
import { QQBotAdapterCF } from './adapters/qqbot-cf.js';
import { QQBotDB } from './db/index.js';
import type { WorkersAI } from './providers/index.js';
import { handleAdmin } from './admin.js';

interface Env {
  QQ_BOT_APP_ID: string;
  QQ_BOT_SECRET: string;
  QQ_BOT_VERIFY_SIGNATURE?: string;
  AGNESAI_API_KEY: string;
  AGNESAI_BASE_URL?: string;
  AGNESAI_MODEL?: string;
  AI: WorkersAI;
  AI_MAX_TOKENS?: string;
  AI_MAX_INPUT_TOKENS?: string;
  YOUTUBE_API_KEY?: string;\n  TAVILY_API_KEY?: string;\n  ADMIN_PASSWORD_HASH?: string;
  CURRENT_MODEL_ID?: string;
  DB: D1Database;
}

function getOrCreateAdapter(env: Env): QQBotAdapterCF {
  // 每次请求都重新构建，避免模块级缓存导致 secret 变更后不生效
  const db = new QQBotDB(env.DB as any);
  const maxInputTokens = parseInt(env.AI_MAX_INPUT_TOKENS || '8192', 10);
  return new QQBotAdapterCF({
    appId: env.QQ_BOT_APP_ID,
    secret: env.QQ_BOT_SECRET,
    verifySignature: env.QQ_BOT_VERIFY_SIGNATURE !== 'false',
    clientSecret: env.QQ_BOT_SECRET,
    db,
    maxInputTokens,
    agnesApiKey: env.AGNESAI_API_KEY || '',
    agnesBaseUrl: env.AGNESAI_BASE_URL || 'https://apihub.agnes-ai.com/v1',
    agnesModel: env.AGNESAI_MODEL || 'agnes-2.0-flash',
    workersAI: env.AI,
    youtubeApiKey: env.YOUTUBE_API_KEY || '',
    currentModelId: env.CURRENT_MODEL_ID || '1',
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(
        JSON.stringify({ status: 'ok', service: 'qq-bot-cloudflare-worker' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.pathname === '/admin') return handleAdmin(request, env);\n\n    if (url.pathname === '/webhook/qqbot') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }
      const adapter = getOrCreateAdapter(env);
      return adapter.handleWebhook(request, ctx);
    }

    return new Response('Not found', { status: 404 });\n  },\n};\n