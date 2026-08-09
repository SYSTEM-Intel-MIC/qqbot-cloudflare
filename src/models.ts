// 模型列表（id 即数据库里存的 model_id，从 1 开始）
export interface ModelInfo {
  id: string;
  name: string;
  provider: 'openai' | 'gemini';
  model: string;   // API 请求时的模型名
}

export const MODEL_LIST: ModelInfo[] = [
  { id: '1', name: 'nemotron-3-super-120b-a12b',             provider: 'openai', model: 'nvidia/nemotron-3-super-120b-a12b' },
  { id: '2', name: 'nemotron-3-ultra-550b-a55b',            provider: 'openai', model: 'nvidia/nemotron-3-ultra-550b-a55b' },
  { id: '3', name: 'Google Gemini 2.0 Flash', provider: 'gemini', model: 'gemini-2.0-flash' },
  { id: '4', name: 'Google Gemma 4 26B',      provider: 'gemini', model: 'gemma-4-26b-a4b-it' },
];
