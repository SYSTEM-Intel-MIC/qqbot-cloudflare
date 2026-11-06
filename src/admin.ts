import { QQBotDB } from "./db/index.js";

export interface AdminEnv { ADMIN_PASSWORD_HASH?: string; DB: any; }
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>昔涟机器人管理后台</title><style>
body{font:15px system-ui;background:#10131c;color:#e8edf7;margin:0;padding:24px}main{max-width:980px;margin:auto}section{background:#1b2230;padding:18px;border-radius:12px;margin:14px 0}input,textarea,button{font:inherit;padding:10px;border-radius:7px;border:1px solid #45516a;background:#111827;color:#eef}input,textarea{width:95%;margin:6px 0}button{cursor:pointer;background:#3659a7}pre{white-space:pre-wrap;overflow-wrap:anywhere}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.muted{color:#a9b4c8}</style></head><body><main><h1>昔涟机器人 · 管理后台</h1><p class="muted">每次请求均由 Worker 校验管理员密码；密码不会保存在浏览器。</p><section><label>管理员密码</label><input id="pw" type="password" autocomplete="current-password"><button onclick="load()">验证并载入</button><span id="status"></span></section><div id="app" hidden>
<div class="grid"><section><h3>群聊回复概率</h3><input id="gid" placeholder="QQ开放平台群ID"><input id="prob" type="number" min="0" max="100" value="30"><button onclick="act('group-probability',{groupId:gid.value,probability:+prob.value})">保存概率</button></section>
<section><h3>用户好感度</h3><input id="uid" placeholder="QQ开放平台用户ID"><input id="aff" type="number" min="0" max="100"><button onclick="act('affection',{userId:uid.value,affection:+aff.value})">保存好感度</button></section>
<section><h3>黑名单</h3><input id="blockid" placeholder="QQ开放平台用户ID"><button onclick="act('blacklist',{userId:blockid.value,blocked:true})">加入黑名单</button><button onclick="act('blacklist',{userId:blockid.value,blocked:false})">移出黑名单</button></section></div>
<section><h3>昔涟完整系统提示词</h3><textarea id="prompt" rows="14"></textarea><button onclick="act('prompt',{prompt:prompt.value})">保存提示词</button><button onclick="act('prompt-reset',{})">恢复内置提示词</button></section>
<section><h3>工具开关</h3><label><input id="tavily" type="checkbox"> Tavily 网页搜索</label><label><input id="youtube" type="checkbox"> YouTube 查询</label><label><input id="wget" type="checkbox"> 网页抓取（受限 fetch）</label><button onclick="act('tools',{tavily:tavily.checked,youtube:youtube.checked,wget:wget.checked})">保存工具开关</button></section>
<div class="grid"><section><h3>用户好感度列表</h3><pre id="users"></pre></section><section><h3>群设置</h3><pre id="groups"></pre></section><section><h3>黑名单</h3><pre id="blacklist"></pre></section></div><section><h3>会话上下文</h3><pre id="conversations"></pre></section></div></main>
<script>
async function api(action,data={}){const r=await fetch('/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.querySelector('#pw').value,action,...data})});const j=await r.json();if(!r.ok)throw Error(j.error||r.status);return j}
async function load(){try{const d=await api('overview');app.hidden=false;status.textContent=' 已验证';users.textContent=JSON.stringify(d.users,null,2);groups.textContent=JSON.stringify(d.groups,null,2);blacklist.textContent=JSON.stringify(d.blacklist,null,2);conversations.textContent=JSON.stringify(d.conversations,null,2);prompt.value=d.prompt||'';tavily.checked=!!d.tools.tavily;youtube.checked=!!d.tools.youtube;wget.checked=!!d.tools.wget}catch(e){status.textContent=' 验证失败：'+e.message}}
async function act(action,data){try{await api(action,data);status.textContent=' 保存成功';await load()}catch(e){status.textContent=' 操作失败：'+e.message}}
</script></body></html>`;
function b64(bytes: Uint8Array): string { let s=""; for(const b of bytes)s+=String.fromCharCode(b); return btoa(s); }
function unb64(s:string):Uint8Array { const x=atob(s); return Uint8Array.from(x,c=>c.charCodeAt(0)); }
async function verifyPassword(password:string,stored:string):Promise<boolean>{
  const parts=stored.split("$");
  if(parts.length!==4||parts[0]!=="pbkdf2")return false;
  const iterations=Number(parts[1]); if(!Number.isInteger(iterations)||iterations<100000||iterations>1000000)return false;
  try{
    const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
    const bits=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:unb64(parts[2]),iterations},key,256));
    const expected=unb64(parts[3]); if(bits.length!==expected.length)return false;
    let diff=0;for(let i=0;i<bits.length;i++)diff|=bits[i]^expected[i];return diff===0;
  }catch{return false}
}
export async function handleAdmin(request:Request,env:AdminEnv):Promise<Response>{
  const headers={"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"};
  if(request.method==="GET")return new Response(html,{headers});
  if(request.method!=="POST")return new Response("Method not allowed",{status:405});
  const jsonHeaders={"Content-Type":"application/json","Cache-Control":"no-store"};
  try{
    const body=await request.json() as any;
    if(typeof body.password!=="string"||!env.ADMIN_PASSWORD_HASH||!(await verifyPassword(body.password,env.ADMIN_PASSWORD_HASH)))
      return Response.json({error:"管理员密码错误"},{status:401,headers:jsonHeaders});
    const db=new QQBotDB(env.DB);
    const action=String(body.action||"");
    if(action==="overview"){
      const prompt=await db.getGlobalSetting("system_prompt");
      const toolsRaw=await db.getGlobalSetting("tools_enabled");
      let tools={tavily:false,youtube:false,wget:false};try{tools={...tools,...JSON.parse(toolsRaw||"{}")}}catch{}
      return Response.json({users:await db.listUsers(),groups:await db.listGroups(),blacklist:await db.listBlacklist(),conversations:(await db.getConversationList()).map(c=>({...c,messages:JSON.parse(c.messages||"[]")})),prompt,tools},{headers:jsonHeaders});
    }
    if(action==="affection"){if(typeof body.userId!=="string"||!body.userId.trim())throw Error("userId required");await db.setAffection(body.userId,Number(body.affection));}
    else if(action==="group-probability"){if(typeof body.groupId!=="string"||!body.groupId.trim())throw Error("groupId required");await db.setReplyProbability(body.groupId,Number(body.probability));}
    else if(action==="blacklist"){if(typeof body.userId!=="string"||!body.userId.trim())throw Error("userId required");await db.setBlacklisted(body.userId,!!body.blocked);}
    else if(action==="prompt"){if(typeof body.prompt!=="string"||body.prompt.length>30000)throw Error("prompt invalid or too long");await db.setGlobalSetting("system_prompt",body.prompt);}
    else if(action==="prompt-reset"){await db.setGlobalSetting("system_prompt","");}
    else if(action==="tools"){await db.setGlobalSetting("tools_enabled",JSON.stringify({tavily:!!body.tavily,youtube:!!body.youtube,wget:!!body.wget}));}
    else return Response.json({error:"Unknown action"},{status:400,headers:jsonHeaders});
    return Response.json({ok:true},{headers:jsonHeaders});
  }catch(e){return Response.json({error:e instanceof Error?e.message:"Invalid request"},{status:400,headers:jsonHeaders});}
}
