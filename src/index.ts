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
  NVIDIA_API_KEY:string;
  NVIDIA_BASE_URL?:string;
  NVIDIA_MODEL?:string;
  AI:WorkersAI;
  AI_MAX_INPUT_TOKENS?:string;
  TAVILY_API_KEY?:string;
  ADMIN_PASSWORD?:string;
  DB:D1Database;
}
function getOrCreateAdapter(env:Env):QQBotAdapterCF{
  return new QQBotAdapterCF({
    appId:env.QQ_BOT_APP_ID,secret:env.QQ_BOT_SECRET,
    verifySignature:env.QQ_BOT_VERIFY_SIGNATURE!=="false",clientSecret:env.QQ_BOT_SECRET,
    db:new QQBotDB(env.DB as any),
    maxInputTokens:Math.max(2048,Number.parseInt(env.AI_MAX_INPUT_TOKENS||"8192",10)||8192),
    // secret put / --secrets-file 可能把首尾空白或 CRLF 一起带进 Secret，
    // 会让 Bearer 头或 URL 非法、模型名对不上，表现为主模型 100% 回退。
    // 与后台密码一样，这里统一 trim 后再用（原始值不回显、不写日志）。
    nvidiaApiKey:(env.NVIDIA_API_KEY||"").trim(),
    nvidiaBaseUrl:(env.NVIDIA_BASE_URL||"https://integrate.api.nvidia.com/v1").trim(),
    nvidiaModel:(env.NVIDIA_MODEL||"nvidia/nemotron-3-nano-omni-30b-a3b-reasoning").trim(),
    workersAI:env.AI,tavilyApiKey:env.TAVILY_API_KEY||"",
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
