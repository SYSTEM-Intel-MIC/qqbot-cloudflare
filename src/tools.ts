export interface ToolEnv { YOUTUBE_API_KEY?:string; TAVILY_API_KEY?:string; }
export const AI_TOOLS = [
 {type:"function",function:{name:"youtube_search",description:"搜索 YouTube 视频。",parameters:{type:"object",properties:{query:{type:"string",description:"搜索关键词"}},required:["query"]}}},
 {type:"function",function:{name:"youtube_details",description:"查询 YouTube 视频详情。",parameters:{type:"object",properties:{video_id:{type:"string"}},required:["video_id"]}}},
 {type:"function",function:{name:"tavily_search",description:"搜索互联网并获取相关网页摘要。",parameters:{type:"object",properties:{query:{type:"string"}},required:["query"]}}},
 {type:"function",function:{name:"fetch_webpage",description:"抓取公开 HTTPS 网页并提取文本。只用于公开网页。",parameters:{type:"object",properties:{url:{type:"string"}},required:["url"]}}}
];
function safeUrl(input:string):URL {
 const u=new URL(input);
 if(u.protocol!=="https:"||u.username||u.password)throw new Error("仅允许公开 HTTPS 网页");
 const h=u.hostname.toLowerCase();
 if(h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".intranet")||h==="metadata.google.internal")throw new Error("禁止访问本机或内部域名");
 if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)||h.includes(":"))throw new Error("网页抓取只接受域名，不接受 IP 地址");
 return u;
}
async function webpage(url:string):Promise<string>{
 let target=safeUrl(url),response:Response|undefined;
 for(let i=0;i<4;i++){
  response=await fetch(target.toString(),{redirect:"manual",headers:{"User-Agent":"QQBot-Worker/1.0","Accept":"text/html,text/plain,application/json"}});
  if(response.status>=300&&response.status<400){
   const loc=response.headers.get("Location");if(!loc)break;target=safeUrl(new URL(loc,target).toString());continue;
  }break;
 }
 if(!response||!response.ok)throw new Error("网页请求失败："+(response?.status??"unknown"));
 const type=response.headers.get("content-type")||"";
 if(!/(text\/html|text\/plain|application\/json|application\/xml)/i.test(type))throw new Error("目标不是可读取的文本网页");
 const reader=response.body?.getReader();
 if(!reader)throw new Error("无法读取网页响应");
 const chunks:Uint8Array[]=[];let total=0;
 while(total<120000){
  const part=await reader.read();if(part.done)break;
  const chunk=part.value;const remaining=120000-total;
  if(chunk.length>remaining){chunks.push(chunk.slice(0,remaining));total=120000;await reader.cancel();break;}
  chunks.push(chunk);total+=chunk.length;
 }
 const bytes=new Uint8Array(total);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const raw=new TextDecoder().decode(bytes);
 return raw.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").slice(0,12000);
}
export async function executeTool(name:string,args:any,env:ToolEnv):Promise<string>{
 if(name==="youtube_search"){
  if(!env.YOUTUBE_API_KEY)throw new Error("YouTube 工具未配置 API Key");
  const q=String(args.query||"").slice(0,200);if(!q)throw new Error("query required");
  const u=new URL("https://www.googleapis.com/youtube/v3/search");u.search=new URLSearchParams({part:"snippet",type:"video",maxResults:"5",q,key:env.YOUTUBE_API_KEY}).toString();
  const r=await fetch(u);const d:any=await r.json();if(!r.ok||d.error)throw new Error(d.error?.message||"YouTube 搜索失败");
  return JSON.stringify((d.items||[]).map((x:any)=>({videoId:x.id?.videoId,title:x.snippet?.title,channel:x.snippet?.channelTitle,url:"https://youtu.be/"+x.id?.videoId})));
 }
 if(name==="youtube_details"){
  if(!env.YOUTUBE_API_KEY)throw new Error("YouTube 工具未配置 API Key");
  const id=String(args.video_id||"");if(!/^[\w-]{11}$/.test(id))throw new Error("视频 ID 无效");
  const u=new URL("https://www.googleapis.com/youtube/v3/videos");u.search=new URLSearchParams({part:"snippet,statistics,contentDetails",id,key:env.YOUTUBE_API_KEY}).toString();
  const r=await fetch(u);const d:any=await r.json();if(!r.ok||d.error)throw new Error(d.error?.message||"YouTube 详情失败");
  const x=d.items?.[0];if(!x)return "没有找到该视频";
  return JSON.stringify({title:x.snippet?.title,description:String(x.snippet?.description||"").slice(0,3000),channel:x.snippet?.channelTitle,publishedAt:x.snippet?.publishedAt,views:x.statistics?.viewCount,likes:x.statistics?.likeCount,duration:x.contentDetails?.duration,url:"https://youtu.be/"+id});
 }
 if(name==="tavily_search"){
  if(!env.TAVILY_API_KEY)throw new Error("Tavily 工具未配置 API Key");
  const query=String(args.query||"").slice(0,300);if(!query)throw new Error("query required");
  const r=await fetch("https://api.tavily.com/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({api_key:env.TAVILY_API_KEY,query,max_results:5,search_depth:"basic",include_answer:true})});
  const d:any=await r.json();if(!r.ok)throw new Error(d.message||"Tavily 搜索失败");
  return JSON.stringify({answer:d.answer,results:(d.results||[]).map((x:any)=>({title:x.title,url:x.url,content:String(x.content||"").slice(0,1800)}))});
 }
 if(name==="fetch_webpage")return await webpage(String(args.url||""));
 throw new Error("不支持的工具："+name);
}
