/**
 * QQ Bot → Cloudflare Worker → AI 桥接服务
 */
import { ExecutionContext } from '@cloudflare/workers-types';
import { QQBotAdapterCF } from './adapters/qqbot-cf.js';
import { QQBotDB } from './db/index.js';
import { MODEL_LIST } from './models.js';

interface Env {
  QQ_BOT_APP_ID: string;
  QQ_BOT_SECRET: string;
  QQ_BOT_VERIFY_SIGNATURE?: string;
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  AI_MAX_TOKENS?: string;
  AI_MAX_INPUT_TOKENS?: string;
  GEMINI_API_KEY?: string;
  YOUTUBE_API_KEY?: string;
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
    geminiApiKey: env.GEMINI_API_KEY || '',
    openaiApiKey: env.AI_API_KEY || '',
    openaiBaseUrl: env.AI_BASE_URL || 'https://api.chatanywhere.tech',
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

    if (url.pathname === '/debug/db') {
      try {
        const result = await env.DB.prepare('SELECT 1 as test').bind().first();
        const usage = await env.DB.prepare('SELECT * FROM api_usage WHERE user_id = ?').bind('4E70959805D04540F8A7545F3B46EEB8').first();
        const context = await env.DB.prepare('SELECT * FROM user_context').first();
        return new Response(JSON.stringify({ db_ok: true, test: result, usage, context }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ db_ok: false, error: e?.message || String(e) }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (url.pathname === '/debug/env') {
      // 诊断接口：只暴露密钥的"状态"，不暴露内容本身
      const secret = env.QQ_BOT_SECRET || '';
      const appId = env.QQ_BOT_APP_ID || '';
      return new Response(JSON.stringify({
        appId_configured: !!appId,
        appId_length: appId.length,
        secret_configured: !!secret,
        secret_length: secret.length,
        secret_has_surrounding_whitespace: secret !== secret.trim(),
        verify_signature: env.QQ_BOT_VERIFY_SIGNATURE,
        hint: secret.length === 0
          ? 'QQ_BOT_SECRET 未在生产环境配置！请执行: wrangler secret put QQ_BOT_SECRET（QQ_BOT_APP_ID 同理）'
          : (secret !== secret.trim() ? 'secret 首尾有空格/换行，大概率是复制时带入的，请重新配置' : 'secret 已配置且无首尾空白'),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/webhook/qqbot') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }
      const adapter = getOrCreateAdapter(env);
      return adapter.handleWebhook(request, ctx);
    }

    // ===== YouTube 搜索 =====
    if (url.pathname === '/youtube/search') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      if (!env.YOUTUBE_API_KEY) return new Response(JSON.stringify({ error: 'YOUTUBE_API_KEY not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      const q = url.searchParams.get('q') || '';
      const max = Math.min(parseInt(url.searchParams.get('maxResults') || '10'), 50);
      const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=${max}&key=${env.YOUTUBE_API_KEY}`);
      const data = await resp.json();
      if (data.error) return new Response(JSON.stringify({ error: data.error.message }), { status: resp.status, headers: { 'Content-Type': 'application/json' } });
      const results = (data.items || []).map((item: any) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      }));
      return new Response(JSON.stringify({ type: 'search', query: q, totalResults: data.pageInfo?.totalResults || results.length, results }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' }
      });
    }

    // ===== YouTube 详情 =====
    if (url.pathname === '/youtube/details') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      if (!env.YOUTUBE_API_KEY) return new Response(JSON.stringify({ error: 'YOUTUBE_API_KEY not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      const id = url.searchParams.get('id') || '';
      const resp = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(id)}&key=${env.YOUTUBE_API_KEY}`);
      const data = await resp.json();
      if (data.error) return new Response(JSON.stringify({ error: data.error.message }), { status: resp.status, headers: { 'Content-Type': 'application/json' } });
      if (!data.items?.length) return new Response(JSON.stringify({ error: 'Video not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      const item = data.items[0];
      return new Response(JSON.stringify({
        type: 'details',
        video: {
          videoId: item.id,
          title: item.snippet.title,
          description: item.snippet.description,
          channelTitle: item.snippet.channelTitle,
          channelId: item.snippet.channelId,
          publishedAt: item.snippet.publishedAt,
          tags: item.snippet.tags || [],
          thumbnails: item.snippet.thumbnails,
          duration: item.contentDetails?.duration || '',
          viewCount: item.statistics?.viewCount || '0',
          likeCount: item.statistics?.likeCount || '0',
          commentCount: item.statistics?.commentCount || '0',
          url: `https://www.youtube.com/watch?v=${item.id}`,
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' } });
    }

    return new Response('Not found', { status: 404 });
  },
};
