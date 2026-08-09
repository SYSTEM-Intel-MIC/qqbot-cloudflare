// ===== 基础类型 =====

export interface WebhookEventData {
  id: string;
  platform: string;
  type: string;
  timestamp: number;
  headers: Record<string, string>;
  payload: any;
  data: Record<string, any>;
}

// ===== QQ Bot 类型 =====

export interface QQBotPayload {
  id?: string;
  op: number;
  d: any;
  s?: number;
  t?: string;
}

export interface QQBotConfig {
  appId: string;
  secret: string;
  verifySignature: boolean;
}

// ===== AI Provider 类型 =====

export interface AIProviderConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

// ===== 全局配置 =====

export interface AppConfig {
  qqbot: QQBotConfig;
  ai: AIProviderConfig;
  port: number;
  env: 'development' | 'production';
}