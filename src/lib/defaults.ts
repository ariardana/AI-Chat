import type { ProviderSettings, StorageState } from "@/lib/types";

export const STORAGE_KEY = "lightweight-ai-chat-webui:v1";
export const STORAGE_VERSION = 1;
export const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";
export const CHAT_FALLBACK_MODELS = [
  "minimaxai/minimax-m2.5",
  "moonshotai/kimi-k2.6",
];

export const DEFAULT_MODELS = [
  DEFAULT_MODEL,
  "deepseek-ai/deepseek-v4-pro",
  "qwen/qwen3-coder-480b-a35b-instruct",
  "minimaxai/minimax-m2.7",
  ...CHAT_FALLBACK_MODELS,
  "openai/gpt-oss-120b",
];
export const FALLBACK_MODEL = DEFAULT_MODEL;

export const DEFAULT_SETTINGS: ProviderSettings = {
  providerName: "NVIDIA",
  baseUrl: "https://integrate.api.nvidia.com/v1",
  apiKey: "",
  models: DEFAULT_MODELS,
  activeModel: DEFAULT_MODEL,
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: "You are a helpful AI assistant.",
  theme: "dark",
  language: "en",
};

export const DEFAULT_STORAGE: StorageState = {
  schemaVersion: STORAGE_VERSION,
  settings: DEFAULT_SETTINGS,
  chats: [],
  activeChatId: null,
  modelAvailability: {},
  modelCapabilities: {},
};
