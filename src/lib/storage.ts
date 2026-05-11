"use client";

import {
  DEFAULT_MODEL,
  DEFAULT_SETTINGS,
  DEFAULT_STORAGE,
  STORAGE_KEY,
  STORAGE_VERSION,
} from "@/lib/defaults";
import type { Chat, ExportBundle, ModelAvailability, ModelCapabilities, ProviderSettings, StorageState } from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : fallback;
}

function withDefaultModel(models: string[]) {
  return Array.from(new Set([DEFAULT_MODEL, ...models]));
}

function sanitizeErrorMeta(value: unknown) {
  if (!isRecord(value)) return undefined;
  return {
    statusCode: asNumber(value.statusCode, 0) || undefined,
    providerError: typeof value.providerError === "string" ? value.providerError : undefined,
    timeoutReason: typeof value.timeoutReason === "string" ? value.timeoutReason : undefined,
    abortReason: typeof value.abortReason === "string" ? value.abortReason : undefined,
    shouldSuggestModel: typeof value.shouldSuggestModel === "boolean" ? value.shouldSuggestModel : undefined,
  };
}

function sanitizeModelAvailability(value: unknown, models: string[]): Record<string, ModelAvailability> {
  const source = isRecord(value) ? value : {};
  const result: Record<string, ModelAvailability> = {};

  for (const model of models) {
    const item = source[model];
    if (!isRecord(item)) {
      result[model] = { status: "unknown" };
      continue;
    }

    const status = item.status === "available" || item.status === "unavailable" || item.status === "unstable"
      ? item.status
      : "unknown";
    result[model] = {
      status,
      checkedAt: typeof item.checkedAt === "string" ? item.checkedAt : undefined,
      statusCode: asNumber(item.statusCode, 0) || undefined,
      providerError: typeof item.providerError === "string" ? item.providerError : undefined,
    };
  }

  return result;
}

function sanitizeModelCapabilities(value: unknown, models: string[]): Record<string, ModelCapabilities> {
  const source = isRecord(value) ? value : {};
  const result: Record<string, ModelCapabilities> = {};

  for (const model of models) {
    const item = source[model];
    if (!isRecord(item)) continue;
    result[model] = {
      thinking: typeof item.thinking === "boolean" ? item.thinking : undefined,
      fast: typeof item.fast === "boolean" ? item.fast : undefined,
      coding: typeof item.coding === "boolean" ? item.coding : undefined,
      vision: typeof item.vision === "boolean" ? item.vision : undefined,
      longContext: typeof item.longContext === "boolean" ? item.longContext : undefined,
      recommended: typeof item.recommended === "boolean" ? item.recommended : undefined,
      detectedAt: typeof item.detectedAt === "string" ? item.detectedAt : undefined,
    };
  }

  return result;
}

export function sanitizeSettings(value: unknown): ProviderSettings {
  const source = isRecord(value) ? value : {};
  const modelList = asStringArray(source.models, DEFAULT_SETTINGS.models);
  const models = withDefaultModel(modelList.length ? modelList : DEFAULT_SETTINGS.models);
  const activeModel = asString(source.activeModel, "");

  return {
    providerName: asString(source.providerName, DEFAULT_SETTINGS.providerName),
    baseUrl: asString(source.baseUrl, DEFAULT_SETTINGS.baseUrl),
    apiKey: "",
    models,
    activeModel: models.includes(activeModel)
      ? activeModel
      : DEFAULT_MODEL,
    temperature: asNumber(source.temperature, DEFAULT_SETTINGS.temperature),
    maxTokens: Math.round(asNumber(source.maxTokens, DEFAULT_SETTINGS.maxTokens)),
    systemPrompt: asString(source.systemPrompt, DEFAULT_SETTINGS.systemPrompt),
    theme: source.theme === "light" ? "light" : "dark",
    language: source.language === "id" ? "id" : "en",
  };
}

function sanitizeChats(value: unknown): Chat[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((chat) => ({
      id: asString(chat.id, ""),
      title: asString(chat.title, "New chat"),
      createdAt: asString(chat.createdAt, new Date().toISOString()),
      updatedAt: asString(chat.updatedAt, new Date().toISOString()),
      messages: Array.isArray(chat.messages)
        ? chat.messages
            .filter(isRecord)
            .filter((message) => message.role === "user" || message.role === "assistant")
            .map((message) => ({
              id: asString(message.id, ""),
              role: message.role as "user" | "assistant",
              content: asString(message.content, ""),
              createdAt: asString(message.createdAt, new Date().toISOString()),
              error: typeof message.error === "string" ? message.error : undefined,
              thinkingStartedAt: typeof message.thinkingStartedAt === "string" ? message.thinkingStartedAt : undefined,
              thinkingEndedAt: typeof message.thinkingEndedAt === "string" ? message.thinkingEndedAt : undefined,
              errorMeta: sanitizeErrorMeta(message.errorMeta),
            }))
            .filter((message) => message.id)
        : [],
    }))
    .filter((chat) => chat.id);
}

export function sanitizeStorage(value: unknown): StorageState {
  if (!isRecord(value)) return DEFAULT_STORAGE;

  const settings = sanitizeSettings(value.settings);
  const chats = sanitizeChats(value.chats);
  const activeChatId = asString(value.activeChatId, "");

  return {
    schemaVersion: STORAGE_VERSION,
    settings,
    chats,
    activeChatId: chats.some((chat) => chat.id === activeChatId) ? activeChatId : null,
    modelAvailability: sanitizeModelAvailability(value.modelAvailability, settings.models),
    modelCapabilities: sanitizeModelCapabilities(value.modelCapabilities, settings.models),
  };
}

export function loadStorage(): StorageState {
  if (typeof window === "undefined") return DEFAULT_STORAGE;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STORAGE;
    return sanitizeStorage(JSON.parse(raw));
  } catch {
    return DEFAULT_STORAGE;
  }
}

export function saveStorage(state: StorageState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeStorage(state)));
}

export function createExportBundle(state: StorageState): ExportBundle {
  return {
    ...sanitizeStorage(state),
    app: "lightweight-ai-chat-webui",
    exportedAt: new Date().toISOString(),
  };
}

export function parseImportBundle(raw: string): StorageState {
  const parsed = JSON.parse(raw) as unknown;
  return sanitizeStorage(parsed);
}
