export interface ModelInfo {
  id: string;
  name: string;
  provider: "agnesai";
  model: string;
}

// AgnesAI is the primary model. Workers AI is an automatic provider fallback,
// not a user-selectable model.
export const MODEL_LIST: ModelInfo[] = [
  { id: "1", name: "AgnesAI 免费模型（自动故障转移）", provider: "agnesai", model: "agnes-2.0-flash" },
];
