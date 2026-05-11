export type ChatRole = "system" | "user" | "assistant";

export type ThemeMode = "dark" | "light";

export type LanguageMode = "en" | "id";

export type ModelAvailabilityStatus = "unknown" | "available" | "unavailable" | "unstable";

export interface ModelAvailability {
  status: ModelAvailabilityStatus;
  checkedAt?: string;
  statusCode?: number;
  providerError?: string;
}

export interface ModelCapabilities {
  thinking?: boolean;
  fast?: boolean;
  coding?: boolean;
  vision?: boolean;
  longContext?: boolean;
  recommended?: boolean;
  detectedAt?: string;
}

export interface Message {
  id: string;
  role: Exclude<ChatRole, "system">;
  content: string;
  createdAt: string;
  error?: string;
  thinkingStartedAt?: string;
  thinkingEndedAt?: string;
  requestStatus?: "slow" | "warning" | "waiting" | "stopped";
  errorMeta?: {
    statusCode?: number;
    providerError?: string;
    timeoutReason?: string;
    abortReason?: string;
    shouldSuggestModel?: boolean;
  };
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface ProviderSettings {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  activeModel: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  theme: ThemeMode;
  language: LanguageMode;
}

export interface StorageState {
  schemaVersion: number;
  settings: ProviderSettings;
  chats: Chat[];
  activeChatId: string | null;
  modelAvailability: Record<string, ModelAvailability>;
  modelCapabilities: Record<string, ModelCapabilities>;
}

export interface ChatApiMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequestBody {
  apiKey?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  messages: ChatApiMessage[];
}

export interface ModelsRequestBody {
  apiKey?: string;
}

export interface ExportBundle extends StorageState {
  exportedAt: string;
  app: "lightweight-ai-chat-webui";
}
