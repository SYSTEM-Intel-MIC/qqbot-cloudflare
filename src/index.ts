/** QQ Bot webhook worker. The signature and ACK path intentionally remain unchanged. */
import type { ExecutionContext } from "@cloudflare/workers-types";
import { QQBotAdapterCF } from "./adapters/qqbot-cf.js";
import { QQBotDB } from "./db/index.js";
import type { WorkersAI } from "./providers/index.js";
import { handleAdmin } from "./admin.js";

interface Env {
  QQ_BOT_APP_ID:string;
  QQ_BOT_SECRET:string;
  QQ_BOT_VERIFY_SIGNATURE?:string;
  AGNESAI_API_KEY:string;
  AGNESAI_BASE_URL?:string;
  AGNESAI_MODEL?:string;
  AI:WorkersAI;
  AI_MAX_INPUT_TOKENS?:string;
  YOUTUBE_API_KEY?:string;
  TAVILY_API_KEY?:string;
  ADMIN_PASSWORD_HASH?:string;
  DB:D1Database;
}
function getOrCreateAdapter(env:Env):QQBotAdapterCF{
  return new QQBotAdapterCF({
    appId:env.QQ_BOT_APP_ID,secret:env.QQ_BOT_SECRET,
    verifySignature:env.QQ_BOT_VERIFY_SIGNATURE!=="false",clientSecret:env.QQ_BOT_SECRET,
    db:new QQBotDB(env.DB as any),
    maxInputTokens:Math.max(2048,Number.parseInt(env.AI_MAX_INPUT_TOKENS||"8192",10)||8192),
    agnesApiKey:env.AGNESAI_API_KEY||"",
    agnesBaseUrl:env.AGNESAI_BASE_URL||"https://apihub.agnes-ai.com/v1",
    agnesModel:env.AGNESAI_MODEL||"agnes-2.0-flash",
    workersAI:env.AI,youtubeApiKey:env.YOUTUBE_API_KEY||"",tavilyApiKey:env.TAVILY_API_KEY||"",
  });
}
export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==="/"||url.pathname==="/health")
      return Response.json({status:"ok",service:"qq-bot-cloudflare-worker"});
    if(url.pathname==="/admin")return handleAdmin(request,env);
    if(url.pathname==="/webhook/qqbot"){
      if(request.method!=="POST")return new Response("Method not allowed",{status:405});
      return getOrCreateAdapter(env).handleWebhook(request,ctx);
    }
    return new Response("Not found",{status:404});
  }
};
