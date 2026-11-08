export interface ToolEnv { TAVILY_API_KEY?:string; }

/**
 * 工具目录：AI 工具清单、后台开关页、/工具状态 三处共用的单一数据源。
 * free=true 的工具完全不需要任何 API Key，默认开启；旧版后台保存过的开关里
 * 缺这些键时也会按默认开启，不会出现「升级后新工具永远不生效」。
 */
export type ToolKey = 'tavily'|'wget'|'wikipedia'|'time'|'weather';
export interface ToolCatalogItem {
  key: ToolKey; name: string; desc: string; free: boolean;
  needsKey?: string; tools: string[];
}
export const TOOL_CATALOG: ToolCatalogItem[] = [
  { key:'wikipedia', name:'维基百科', desc:'查词条释义、人物、地点与历史背景。Wikipedia 官方 API，完全免费无需密钥。', free:true, tools:['wikipedia_search'] },
  { key:'time', name:'时间与时区', desc:'当前日期、星期、任意城市本地时间。Worker 本地计算，不联网、不消耗额度。', free:true, tools:['current_time'] },
  { key:'weather', name:'天气查询', desc:'当前天气与未来 1–3 天预报。Open-Meteo 免费开放接口，无需密钥。', free:true, tools:['get_weather'] },
  { key:'wget', name:'网页抓取', desc:'抓取公开 HTTPS 网页正文（受限 fetch），无需额外密钥。', free:true, tools:['fetch_webpage'] },
  { key:'tavily', name:'Tavily 网页搜索', desc:'唯一的联网搜索工具：实时检索网页、新闻、视频与资料并给出摘要，需要 TAVILY_API_KEY。', free:false, needsKey:'TAVILY_API_KEY', tools:['tavily_search'] },
];
export const FREE_TOOL_DEFAULTS: Record<string, boolean> =
  Object.fromEntries(TOOL_CATALOG.filter(t => t.free).map(t => [t.key, true]));
export function toolKeyFor(name: string): ToolKey | null {
  const item = TOOL_CATALOG.find(t => t.tools.includes(name));
  return item ? item.key : null;
}

export const AI_TOOLS = [
 {type:"function",function:{name:"wikipedia_search",description:"查询维基百科词条，返回标题、摘要与链接。用于查概念、人物、地点、历史事件等背景知识。免费，无需 API Key。",parameters:{type:"object",properties:{query:{type:"string",description:"要查询的词条或关键词"},lang:{type:"string",description:"语言：zh（默认，中文维基）或 en（英文维基）"}},required:["query"]}}},
 {type:"function",function:{name:"current_time",description:"获取当前日期、时间、星期和指定城市的本地时间。完全免费、无需联网。涉及「现在几点 / 今天几号 / 某地时间 / 时差」时调用。",parameters:{type:"object",properties:{timezone:{type:"string",description:"IANA 时区或城市名，例如 Asia/Shanghai、北京、东京、New York；默认北京时间"}},required:[]}}},
 {type:"function",function:{name:"get_weather",description:"查询城市当前天气（温度、体感、湿度、风速、降水、天气现象）与未来 1-3 天预报。Open-Meteo 免费接口，无需 API Key。",parameters:{type:"object",properties:{city:{type:"string",description:"城市名，中文或英文均可，例如 北京、上海、Tokyo"},days:{type:"number",description:"预报天数 1-3，默认 1"}},required:["city"]}}},
 {type:"function",function:{name:"fetch_webpage",description:"抓取公开 HTTPS 网页并提取文本。只用于公开网页。",parameters:{type:"object",properties:{url:{type:"string"}},required:["url"]}}},
 {type:"function",function:{name:"tavily_search",description:"唯一的联网搜索工具：搜索网页、新闻、视频、人物与最新资料并返回摘要。涉及实时信息、最新动态或视频内容时都调用它。",parameters:{type:"object",properties:{query:{type:"string",description:"搜索关键词或自然语言问题"}},required:["query"]}}}
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

/** 维基百科：generator=search + extracts，一次请求拿标题与摘要，免费无需密钥。 */
async function wikipedia(query:string,lang:string):Promise<string>{
 const host=lang==="en"?"en.wikipedia.org":"zh.wikipedia.org";
 const u=new URL("https://"+host+"/w/api.php");
 u.search=new URLSearchParams({
  action:"query",generator:"search",gsrsearch:query.slice(0,200),gsrlimit:"4",gsrnamespace:"0",
  prop:"extracts",exintro:"1",explaintext:"1",exchars:"700",
  format:"json",formatversion:"2",redirects:"1",utf8:"1",
 }).toString();
 const r=await fetch(u.toString(),{headers:{"User-Agent":"QQBot-Worker/1.0 (QQ bot knowledge lookup)","Accept":"application/json"}});
 if(!r.ok)throw new Error("维基百科请求失败：HTTP "+r.status);
 const d:any=await r.json();
 if(d?.error)throw new Error("维基百科返回错误："+String(d.error.info||d.error.code||"unknown"));
 const pages:any[]=Array.isArray(d?.query?.pages)?d.query.pages:Object.values(d?.query?.pages||{});
 if(!pages.length)return JSON.stringify({query,results:[],note:"维基百科里没有找到相关词条"});
 return JSON.stringify({
  query,lang,
  results:pages.slice(0,4).map(p=>({
   title:String(p.title||""),
   summary:String(p.extract||"").replace(/\s+/g," ").slice(0,700),
   url:"https://"+host+"/wiki/"+encodeURIComponent(String(p.title||"").replace(/ /g,"_")),
  })),
 });
}

/** 常见城市 / 中文写法 → IANA 时区；未知输入直接当作 IANA 时区交给 Intl 校验。 */
const TZ_ALIASES:Record<string,string>={
 "北京":"Asia/Shanghai","上海":"Asia/Shanghai","中国":"Asia/Shanghai","北京时间":"Asia/Shanghai",
 "广州":"Asia/Shanghai","深圳":"Asia/Shanghai","杭州":"Asia/Shanghai","成都":"Asia/Shanghai",
 "香港":"Asia/Hong_Kong","中国香港":"Asia/Hong_Kong","hong kong":"Asia/Hong_Kong",
 "台北":"Asia/Taipei","中国台湾":"Asia/Taipei","taiwan":"Asia/Taipei",
 "澳门":"Asia/Macau","中国澳门":"Asia/Macau","macao":"Asia/Macau",
 "东京":"Asia/Tokyo","日本":"Asia/Tokyo","tokyo":"Asia/Tokyo","japan":"Asia/Tokyo",
 "首尔":"Asia/Seoul","韩国":"Asia/Seoul","seoul":"Asia/Seoul",
 "新加坡":"Asia/Singapore","singapore":"Asia/Singapore",
 "曼谷":"Asia/Bangkok","bangkok":"Asia/Bangkok",
 "新德里":"Asia/Kolkata","india":"Asia/Kolkata","迪拜":"Asia/Dubai","dubai":"Asia/Dubai",
 "伦敦":"Europe/London","英国":"Europe/London","london":"Europe/London","uk":"Europe/London",
 "巴黎":"Europe/Paris","paris":"Europe/Paris","柏林":"Europe/Berlin","berlin":"Europe/Berlin",
 "莫斯科":"Europe/Moscow","moscow":"Europe/Moscow",
 "纽约":"America/New_York","new york":"America/New_York","洛杉矶":"America/Los_Angeles",
 "旧金山":"America/Los_Angeles","los angeles":"America/Los_Angeles","芝加哥":"America/Chicago",
 "悉尼":"Australia/Sydney","sydney":"Australia/Sydney",
 "utc":"UTC","世界时":"UTC","格林尼治":"UTC",
};
function resolveTimezone(input:string):string{
 const raw=String(input||"").trim();
 if(!raw)return "Asia/Shanghai";
 const hit=TZ_ALIASES[raw.toLowerCase()]||TZ_ALIASES[raw];
 if(hit)return hit;
 // 只接受形如 Area/City 或 UTC 的合法 IANA 名，避免把任意字符串塞进 Intl 抛错。
 if(/^[A-Za-z_]+(?:\/[A-Za-z_+-]+){0,2}$/.test(raw)||/^UTC$/i.test(raw))return raw;
 return "Asia/Shanghai";
}
/** 时间：Worker 本地用 Intl 计算，不发任何网络请求，也不消耗任何额度。 */
function currentTime(timezone:string):string{
 const tz=resolveTimezone(timezone),now=new Date();
 let parts:Intl.DateTimeFormatPart[]=[];
 try{
  parts=new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",
   weekday:"long",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).formatToParts(now);
 }catch{return JSON.stringify({error:"无法识别这个时区，请改用 Asia/Shanghai、北京、Tokyo 之类的写法"})}
 const get=(t:string)=>parts.find(p=>p.type===t)?.value||"";
 const weekdayMap:Record<string,string>={Monday:"星期一",Tuesday:"星期二",Wednesday:"星期三",Thursday:"星期四",Friday:"星期五",Saturday:"星期六",Sunday:"星期日"};
 let offset="";
 try{
  const op=new Intl.DateTimeFormat("en-US",{timeZone:tz,timeZoneName:"longOffset"}).formatToParts(now);
  const name=op.find(p=>p.type==="timeZoneName")?.value||"";
  offset=name.replace(/^GMT/,"UTC");
 }catch{offset=""}
 const local=get("year")+"-"+get("month")+"-"+get("day")+" "+get("hour")+":"+get("minute")+":"+get("second");
 const beijing=new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
 return JSON.stringify({timezone:tz,local,weekday:weekdayMap[get("weekday")]||get("weekday"),utcOffset:offset,
  iso:now.toISOString(),unixMs:now.getTime(),beijing,
  note:"时间由 Worker 系统时钟计算；回答时请直接使用 local 字段，不要自己推算日期"});
}

/** WMO weather code → 中文天气现象。 */
const WMO:Record<number,string>={0:"晴",1:"大致晴朗",2:"局部多云",3:"阴",45:"雾",48:"雾凇",
 51:"小毛毛雨",53:"毛毛雨",55:"较强毛毛雨",56:"冻毛毛雨",57:"强冻毛毛雨",
 61:"小雨",63:"中雨",65:"大雨",66:"冻雨",67:"强冻雨",71:"小雪",73:"中雪",75:"大雪",77:"米雪",
 80:"小阵雨",81:"中阵雨",82:"强阵雨",85:"小阵雪",86:"强阵雪",95:"雷阵雨",96:"雷阵雨伴冰雹",99:"强雷阵雨伴冰雹"};
const weatherText=(code:unknown):string=>WMO[Number(code)]??("未知天气码 "+String(code));
/** 天气：Open-Meteo 地理编码 + 预报，两个接口都免费、无需密钥。 */
async function weather(city:string,days:number):Promise<string>{
 const name=String(city||"").trim().slice(0,80);
 if(!name)throw new Error("city required");
 const daysSafe=Math.min(3,Math.max(1,Number(days)||1));
 const geoUrl="https://geocoding-api.open-meteo.com/v1/search?"+new URLSearchParams({name,count:"5",language:"zh",format:"json"});
 const gr=await fetch(geoUrl,{headers:{"User-Agent":"QQBot-Worker/1.0","Accept":"application/json"}});
 if(!gr.ok)throw new Error("城市地理编码请求失败：HTTP "+gr.status);
 const gd:any=await gr.json();
 const place=(gd?.results||[])[0];
 if(!place)return JSON.stringify({city:name,note:"没有找到这个城市，试试更完整的名称或英文名"});
 const fUrl="https://api.open-meteo.com/v1/forecast?"+new URLSearchParams({
  latitude:String(place.latitude),longitude:String(place.longitude),
  current:"temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
  daily:"weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  forecast_days:String(daysSafe),timezone:"auto",
 });
 const fr=await fetch(fUrl,{headers:{"User-Agent":"QQBot-Worker/1.0","Accept":"application/json"}});
 if(!fr.ok)throw new Error("天气请求失败：HTTP "+fr.status);
 const fd:any=await fr.json();
 const c=fd?.current||{},daily=fd?.daily||{};
 const forecast=(daily.time||[]).map((t:string,i:number)=>({
  date:t,text:weatherText(daily.weather_code?.[i]),
  maxC:daily.temperature_2m_max?.[i],minC:daily.temperature_2m_min?.[i],
  rainChance:daily.precipitation_probability_max?.[i],
 }));
 return JSON.stringify({
  city:place.name,country:place.country||place.country_code||"",region:place.admin1||"",
  timezone:fd?.timezone||"",latitude:place.latitude,longitude:place.longitude,
  current:{text:weatherText(c.weather_code),tempC:c.temperature_2m,feelsLikeC:c.apparent_temperature,
   humidityPct:c.relative_humidity_2m,windKmh:c.wind_speed_10m,precipitationMm:c.precipitation,
   isDay:c.is_day===1,observedAt:c.time},
  forecast,
  source:"Open-Meteo（免费开放接口，无需 API Key）",
 });
}

export async function executeTool(name:string,args:any,env:ToolEnv):Promise<string>{
 if(name==="wikipedia_search")return await wikipedia(String(args.query||""),String(args.lang||"zh").toLowerCase()==="en"?"en":"zh");
 if(name==="current_time")return currentTime(String(args.timezone||""));
 if(name==="get_weather")return await weather(String(args.city||""),Number(args.days||1));
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
