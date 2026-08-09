/**
 * AI Provider 抽象层
 * 支持 OpenAI 兼容接口 / Gemini 官方接口
 */

export interface ChatRequest {
  messages: { role: string; content: string }[];
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResult {
  content: string;
  totalTokens: number;
}

export interface AIProvider {
  chat(req: ChatRequest): Promise<ChatResult>;
}

// ===== OpenAI 兼容 Provider =====

export class OpenAICompatibleProvider implements AIProvider {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private defaultModel: string,
  ) {}

  async chat(req: ChatRequest): Promise<ChatResult> {
    const messages = [];
    if (req.systemPrompt) {
      messages.push({ role: 'system', content: req.systemPrompt });
    }
    messages.push(...req.messages);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model || this.defaultModel,
        messages,
        max_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature ?? 0.7,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage as any;
    const totalTokens = usage?.total_tokens
      ?? Math.round((content.length + messages.reduce((s: number, m: any) => s + m.content.length, 0)) * 1.3);

    return { content, totalTokens };
  }
}

// ===== Gemini 官方 Provider =====

export class GeminiProvider implements AIProvider {
  constructor(
    private apiKey: string,
    private defaultModel: string,
  ) {}

  async chat(req: ChatRequest): Promise<ChatResult> {
    // 构建 messages 部分
    const contents: any[] = [];
    for (const msg of req.messages) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      });
    }

    const model = req.model || this.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const body: any = {
      contents,
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 8192,
        temperature: req.temperature ?? 0.7,
      },
    };
    if (req.systemPrompt) {
      body.systemInstruction = { parts: [{ text: req.systemPrompt }] };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as any;
    const parts = data.candidates?.[0]?.content?.parts || [];
    // 取最后一个 parts 作为实际回复（think 在前，真正回复在最后）
    const content = parts.length > 0 ? (parts[parts.length - 1]?.text || '') : '';
    const usage = data.usageMetadata;
    const totalTokens = usage?.totalTokenCount ?? Math.round(content.length * 1.3);

    return { content, totalTokens };
  }
}

/** 从 Env 创建默认 OpenAI Provider */
export function createProviderFromEnv(env: {
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
}): AIProvider {
  const baseUrl = env.AI_BASE_URL || 'https://api.chatanywhere.org/v1';
  const apiKey = env.AI_API_KEY || '';
  const model = env.AI_MODEL || 'gpt-5.4-mini';
  return new OpenAICompatibleProvider(baseUrl, apiKey, model);
}
