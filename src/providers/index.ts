/**
 * NVIDIA NIM (primary, retried) → Workers AI (free-tier fallback).
 *
 * 兜底模型 @cf/openai/gpt-oss-120b 是推理模型，返回体里：
 *   - 最终回复  → choices[0].message.content
 *   - 思考过程  → choices[0].message.reasoning / reasoning_content
 *   - 工具调用  → choices[0].message.tool_calls
 * 绝不能把 reasoning 当作用户可见回复；也不能把工具结果压成 assistant 的
 * content JSON，否则模型会复述那段 JSON 而不是根据它作答。
 */
export type ToolCall = { id: string; type?: string; function: { name: string; arguments: string } };
export interface ChatRequest {
  messages: any[];
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: any[];
  tool_choice?: "auto" | "none";
  /** 只要求模型给出用户可见的最终回复，不要再输出推理/计划或发起工具调用。 */
  forceFinalAnswer?: boolean;
  /** 整条消息链路的总闸信号：超时后掐断还在跑的主模型请求，不再重试、不再兜底。 */
  signal?: AbortSignal;
}
export interface ChatResult {
  content: string;
  totalTokens: number;
  provider: "nvidia-nim" | "workers-ai";
  toolCalls: ToolCall[];
}
export interface WorkersAI {
  run(model: string, input: {
    messages: any[];
    max_tokens?: number;
    temperature?: number;
    tools?: any[];
    tool_choice?: "auto" | "none";
    reasoning?: { effort: "low" | "medium" | "high" };
  }): Promise<any>;
}

const FINAL_ANSWER_HINT =
  "\n\n请直接输出给用户看的中文最终回复，控制在 200 字以内，说完整的话，不要使用 markdown 列表或字段清单。不要输出任何推理过程、行动计划、analysis/commentary/final 等通道标记、好感度或摘要标签、工具调用计划、工具结果原文或英文元信息；不要重复同一个字；没有资料可用时如实说明。";

function normalizeToolCalls(raw: any[]): ToolCall[] {
  const prefix = "tool_call_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2) + "_";
  return raw.map((call: any, index: number) => {
    const fn = call?.function || {};
    const name = String(fn.name || call?.name || "");
    const args = fn.arguments ?? call?.arguments ?? {};
    return {
      id: String(call?.id || call?.call_id || prefix + index),
      type: "function",
      function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) },
    };
  }).filter(call => !!call.function.name);
}

/** 只提取「用户可见的最终文本」，绝不读取 reasoning / reasoning_content。 */
function extractFinalText(data: any): string {
  const message = data?.choices?.[0]?.message;
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) {
    const joined = message.content.map((c: any) => typeof c === "string" ? c : (typeof c?.text === "string" ? c.text : "")).join("\n").trim();
    if (joined) return joined;
  }
  // Responses API: output[] 里只有 type=message 的条目是最终回复。
  if (Array.isArray(data?.output)) {
    const joined = data.output
      .filter((o: any) => o?.type === "message")
      .flatMap((o: any) => Array.isArray(o.content) ? o.content : [o.content])
      .map((c: any) => typeof c === "string" ? c : (typeof c?.text === "string" ? c.text : ""))
      .join("\n").trim();
    if (joined) return joined;
  }
  // 老式 Workers AI 扁平结构（部分非推理模型仍返回 { response }）。
  if (typeof data?.response === "string") return data.response;
  return "";
}

function extractRawToolCalls(data: any): any[] {
  const message = data?.choices?.[0]?.message;
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length) return message.tool_calls;
  if (Array.isArray(data?.tool_calls) && data.tool_calls.length) return data.tool_calls;
  if (message?.function_call) return [message.function_call];
  if (Array.isArray(data?.output)) {
    const calls = data.output.filter((o: any) => o?.type === "function_call" || o?.type === "tool_call");
    if (calls.length) return calls.map((o: any) => ({
      id: o.call_id || o.id, name: o.name, arguments: o.arguments,
    }));
  }
  return [];
}

function estimate(content: string, messages: any[]): number {
  return Math.ceil((content.length + messages.reduce((n, m) => n + String(m.content || "").length, 0)) / 3);
}

export class NvidiaNimProvider {
  constructor(private apiKey: string, private baseUrl = "https://integrate.api.nvidia.com/v1", private model = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning") {}
  async chat(req: ChatRequest): Promise<ChatResult> {
    if (!this.apiKey) throw new Error("NVIDIA_API_KEY is not configured");
    if (req.signal?.aborted) throw new Error("AI request aborted by deadline");
    const system = req.systemPrompt ? req.systemPrompt + (req.forceFinalAnswer ? FINAL_ANSWER_HINT : "") : (req.forceFinalAnswer ? FINAL_ANSWER_HINT.trim() : "");
    const messages = system ? [{ role: "system", content: system }, ...req.messages] : req.messages;
    let lastError: unknown;
    // 单次 8 秒、最多 2 次（约 16.5 秒），给 25 秒总闸留约 8 秒给 Workers AI 兜底。
    // 旧值 6 秒在跨区链路 + 长上下文下容易误判为失败，表现为主模型无谓地全部回退。
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (req.signal?.aborted) throw new Error("AI request aborted by deadline");
      const controller = new AbortController();
      const startedAt = Date.now();
      const timer = setTimeout(() => controller.abort(), 8000);
      const onAbort = () => controller.abort();
      req.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const response = await fetch(this.baseUrl.replace(/\/$/, "") + "/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + this.apiKey },
          body: JSON.stringify({
            model: req.model || this.model, messages,
            max_tokens: Math.max(req.maxTokens ?? 2048, 3072), temperature: req.temperature ?? 0.7, stream: false,
            ...(req.tools?.length ? { tools: req.tools, tool_choice: req.tool_choice || "auto" } : {}),
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("NVIDIA NIM HTTP " + response.status + ": " + (await response.text()).slice(0, 300));
        const data: any = await response.json(), message = data.choices?.[0]?.message || {};
        const content = extractFinalText(data);
        const toolCalls = normalizeToolCalls(Array.isArray(message.tool_calls) ? message.tool_calls : []);
        if (data?.choices?.[0]?.finish_reason === 'length') {
          console.warn('[AI] NVIDIA NIM hit max_tokens (output may be truncated)');
        }
        if (!content.trim() && !toolCalls.length) {
          // NIM 目录里的 reasoning 模型可能把预算全花在思考上，只回 reasoning_content
          // 而没有正文。extractFinalText 只读 content，绝不会把思考发给用户；这里给出
          // 可操作的错误文本，/工具状态 的「最近一次主模型失败」会直接显示它。
          const hasReasoning = !!(message.reasoning_content || message.reasoning);
          throw new Error(hasReasoning
            ? "NVIDIA NIM returned reasoning only (raise max_tokens or switch to a newer non-reasoning model)"
            : "NVIDIA NIM returned an empty response");
        }
        return { content, totalTokens: Number(data.usage?.total_tokens) || estimate(content, messages), provider: "nvidia-nim", toolCalls };
      } catch (e) {
        lastError = e;
        const message = e instanceof Error ? e.message : String(e);
        console.warn("[AI] NVIDIA NIM attempt " + attempt + "/2 failed (" + (Date.now() - startedAt) + "ms):", message);
        // 4xx 是鉴权 / URL / 模型名这类配置错误，重试两次只是白等，立刻切兜底。
        if (/NVIDIA NIM HTTP 4\d\d/.test(message)) break;
        if (attempt < 2 && !req.signal?.aborted) await new Promise(resolve => setTimeout(resolve, 500));
      } finally {
        clearTimeout(timer);
        req.signal?.removeEventListener("abort", onAbort);
      }
    }
    throw new Error("NVIDIA NIM failed: " + (lastError instanceof Error ? lastError.message : String(lastError)));
  }
}

/**
 * Workers AI binding 接受标准 OpenAI 消息：
 *   assistant + tool_calls 必须保留结构化字段，且 content 用 ""（null 会被 schema 拒绝）；
 *   tool 结果必须带 tool_call_id。实测把 tool_calls 压成 content JSON 会让模型复述 JSON。
 */
function toWorkersAIMessages(messages: any[]): any[] {
  return messages.map((m: any) => {
    if (m?.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      return {
        role: "assistant",
        content: "",
        tool_calls: m.tool_calls.map((c: any) => {
          const fn = c?.function || {};
          const args = fn.arguments ?? c?.arguments ?? {};
          return {
            id: String(c?.id || "call_0"),
            type: "function",
            function: { name: String(fn.name || c?.name || ""), arguments: typeof args === "string" ? args : JSON.stringify(args) },
          };
        }),
      };
    }
    if (m?.role === "tool") {
      return { role: "tool", tool_call_id: String(m.tool_call_id || ""), name: String(m.name || ""), content: String(m.content || "") };
    }
    return { role: String(m?.role || "user"), content: typeof m?.content === "string" ? m.content : "" };
  });
}

export class WorkersAIProvider {
  constructor(private binding: WorkersAI, private model = "@cf/openai/gpt-oss-120b") {}
  async chat(req: ChatRequest): Promise<ChatResult> {
    // binding.run 没有 signal 参数，只能在入口拦住已经超时的请求，避免白跑一次推理。
    if (req.signal?.aborted) throw new Error("AI request aborted by deadline");
    const system = req.systemPrompt
      ? req.systemPrompt + (req.forceFinalAnswer ? FINAL_ANSWER_HINT : "")
      : (req.forceFinalAnswer ? FINAL_ANSWER_HINT.trim() : "");
    const rawMessages = system ? [{ role: "system", content: system }, ...req.messages] : req.messages;
    const messages = toWorkersAIMessages(rawMessages);
    const toolsPart = req.tools?.length ? { tools: req.tools, tool_choice: req.tool_choice || "auto" as const } : {};
    const common = { max_tokens: Math.max(req.maxTokens ?? 2048, 4096), temperature: req.temperature ?? 0.7, reasoning: { effort: "low" as const } };

    const data = await this.binding.run(this.model, { messages, ...common, ...toolsPart });
    let content = extractFinalText(data);
    let toolCalls = normalizeToolCalls(extractRawToolCalls(data));

    if (!content.trim() && !toolCalls.length) {
      // 推理耗尽 token / 只回了 analysis：追加明确指令再要一次最终答案（不截断地重试一次）。
      console.warn("[AI] Workers AI returned reasoning only; retrying for a final answer");
      const forcedSystem = system + FINAL_ANSWER_HINT;
      const forcedMessages = toWorkersAIMessages([
        { role: "system", content: forcedSystem },
        ...req.messages,
        { role: "user", content: "请现在直接给出给用户的中文回复。" },
      ]);
      const retry = await this.binding.run(this.model, { messages: forcedMessages, ...common, max_tokens: 4096 });
      content = extractFinalText(retry);
      toolCalls = normalizeToolCalls(extractRawToolCalls(retry));
    }
    if (!content.trim() && !toolCalls.length) throw new Error("Workers AI returned reasoning only (no final answer)");
    const finish = data?.choices?.[0]?.finish_reason;
    console.info("[AI] Workers AI response:", { finish, contentChars: content.length, toolCalls: toolCalls.length });
    return { content, totalTokens: Number(data?.usage?.total_tokens) || estimate(content, messages), provider: "workers-ai", toolCalls };
  }
}

export async function chatWithFallback(req: ChatRequest, config: {
  nvidiaApiKey: string; nvidiaBaseUrl?: string; nvidiaModel?: string; workersAI: WorkersAI; workersModel?: string;
  /** 主模型真实失败原因落库，供 /工具状态 与后台查看（线上日志 tail 常被代理挡住）。 */
  onPrimaryError?: (message: string) => void | Promise<void>;
}): Promise<ChatResult> {
  if (req.signal?.aborted) throw new Error("AI request aborted by deadline");
  try {
    if (!config.nvidiaApiKey) throw new Error("NVIDIA_API_KEY is not configured");
    return await new NvidiaNimProvider(config.nvidiaApiKey, config.nvidiaBaseUrl, config.nvidiaModel).chat(req);
  } catch (primaryError) {
    const reason = primaryError instanceof Error ? primaryError.message : String(primaryError);
    console.error("[AI] NVIDIA NIM unavailable; switching to Workers AI:", reason);
    if (config.onPrimaryError) {
      try { await config.onPrimaryError(reason); } catch { /* 诊断写库失败不影响回复 */ }
    }
    try {
      const result = await new WorkersAIProvider(config.workersAI, config.workersModel).chat(req);
      console.info("[AI] Response generated by Workers AI fallback");
      return result;
    } catch (fallbackError) {
      throw new Error("AI providers unavailable. NVIDIA NIM failed; Workers AI fallback failed: " + (fallbackError instanceof Error ? fallbackError.message : String(fallbackError)));
    }
  }
}
