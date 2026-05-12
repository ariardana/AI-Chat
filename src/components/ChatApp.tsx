"use client";

import { Atom, Bot, Bug, Code2, FileText, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatInput, type ComposerAttachment } from "@/components/ChatInput";
import { ChatMessage } from "@/components/ChatMessage";
import { ScrollToBottomButton } from "@/components/ScrollToBottomButton";
import { ChatSidebar, MobileMenuButton } from "@/components/ChatSidebar";
import { SplashScreen } from "@/components/SplashScreen";
import { SettingsModal } from "@/components/SettingsModal";
import { CHAT_FALLBACK_MODELS, DEFAULT_MODEL, DEFAULT_STORAGE, FALLBACK_MODEL } from "@/lib/defaults";
import { getModelDisplayName } from "@/lib/model-info";
import { parseThinkTags } from "@/lib/reasoning";
import { createExportBundle, loadStorage, parseImportBundle, saveStorage } from "@/lib/storage";
import { readOpenAIStream } from "@/lib/stream";
import type { Chat, ChatApiMessage, Message, MessageAttachment, ModelAvailability, ModelCapabilities, ProviderSettings, StorageState } from "@/lib/types";
import { cn, extractHtmlTitle, formatBytes, makeChatTitle, makeId, nowIso, stripHtml } from "@/lib/utils";

const VIRTUALIZE_AFTER = 90;
const ESTIMATED_MESSAGE_HEIGHT = 132;
const VIRTUAL_OVERSCAN = 10;
const CHAT_REQUEST_TIMEOUT_MS = 90_000;
const MODEL_FETCH_TIMEOUT_MS = 15_000;
const SLOW_RESPONSE_MS = 8_000;
const NO_TOKEN_RESPONSE_MS = 10_000;
const WARNING_RESPONSE_MS = 15_000;
const MODEL_SUGGESTIONS = [
  "qwen/qwen3-coder-480b-a35",
  "moonshotai/kimi-k2.6",
  "nvidia/nemotron-3-super-120b-a12b",
];
const EMPTY_STATE_SUGGESTIONS = [
  { label: "Explain quantum computing", icon: Atom },
  { label: "Write a Python function", icon: Code2 },
  { label: "Help me debug this code", icon: Bug },
  { label: "Summarize this article", icon: FileText },
];

function withDefaultModel(models: string[]) {
  return Array.from(new Set([DEFAULT_MODEL, ...models]));
}

class AiRequestError extends Error {
  statusCode?: number;
  providerError?: string;
  timeoutReason?: string;
  abortReason?: string;
  network?: boolean;

  constructor(
    message: string,
    details: {
      statusCode?: number;
      providerError?: string;
      timeoutReason?: string;
      abortReason?: string;
      network?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "AiRequestError";
    Object.assign(this, details);
  }
}

function toApiMessages(messages: Message[]): ChatApiMessage[] {
  return messages
    .filter((message) => message.content.trim())
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function toMessageAttachments(attachments: ComposerAttachment[]): MessageAttachment[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    size: attachment.size,
    type: attachment.type,
    kind: attachment.kind,
    truncated: attachment.truncated,
  }));
}

function buildAttachmentPrompt(displayContent: string, attachments: ComposerAttachment[], language: "en" | "id") {
  const lines = displayContent ? [displayContent] : [];
  if (!attachments.length) return displayContent;

  lines.push("");
  lines.push(language === "id" ? "File yang dilampirkan:" : "Attached files:");
  for (const attachment of attachments) {
    const type = attachment.type || attachment.kind;
    lines.push(`- ${attachment.name} (${attachment.kind}, ${type}, ${formatBytes(attachment.size)})`);
  }

  const textAttachments = attachments.filter((attachment) => attachment.textPreview?.trim());
  if (textAttachments.length) {
    lines.push("");
    lines.push(language === "id" ? "Cuplikan isi file:" : "File content excerpts:");
    for (const attachment of textAttachments) {
      lines.push("");
      lines.push(`--- ${attachment.name}${attachment.truncated ? " (truncated)" : ""} ---`);
      lines.push(attachment.textPreview?.trim() ?? "");
    }
  }

  const nonTextAttachments = attachments.filter((attachment) => !attachment.textPreview?.trim());
  if (nonTextAttachments.length) {
    lines.push("");
    lines.push(
      language === "id"
        ? "Catatan: lampiran image/PDF dikirim sebagai metadata file di antarmuka ini."
        : "Note: image/PDF attachments are sent as file metadata in this interface.",
    );
  }

  return lines.join("\n");
}

function createAssistantPlaceholder(): Message {
  return {
    id: makeId(),
    role: "assistant",
    content: "",
    createdAt: nowIso(),
  };
}

function parseApiError(payload: unknown, fallback: string) {
  const result = {
    message: fallback,
    providerError: "",
    timeoutReason: "",
    abortReason: "",
  };

  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const record = payload as {
      error?: unknown;
      providerError?: unknown;
      timeoutReason?: unknown;
      abortReason?: unknown;
    };
    if (typeof record.error === "string") result.message = record.error;
    if (typeof record.providerError === "string") result.providerError = record.providerError;
    if (typeof record.timeoutReason === "string") result.timeoutReason = record.timeoutReason;
    if (typeof record.abortReason === "string") result.abortReason = record.abortReason;
  }

  return result;
}

function cleanErrorText(value: string) {
  const cleaned = value.includes("<") && value.includes(">") ? extractHtmlTitle(value) : stripHtml(value);
  return cleaned || "Request failed.";
}

function localizeModelError(message: string, language: "en" | "id") {
  if (language !== "id") return message;
  if (message === "Failed to fetch models.") return "Gagal mengambil daftar model.";
  if (message === "Import failed. Use a valid exported JSON file.") {
    return "Impor gagal. Gunakan file JSON ekspor yang valid.";
  }
  return message;
}

function getSignalReason(signal: AbortSignal) {
  const reason = signal.reason;
  if (reason instanceof DOMException) return `${reason.name}: ${reason.message}`;
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  if (typeof reason === "string") return reason;
  return signal.aborted ? "Request aborted." : "";
}

function isTimeoutSignal(signal: AbortSignal) {
  const reason = signal.reason;
  return reason instanceof DOMException && reason.name === "TimeoutError";
}

function isNetworkError(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && error.name === "NetworkError");
}

function toAiRequestError(error: unknown) {
  if (error instanceof AiRequestError) return error;
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new AiRequestError("Stream idle timed out.", {
      statusCode: 504,
      timeoutReason: `${error.name}: ${error.message}`,
      abortReason: `${error.name}: ${error.message}`,
    });
  }
  if (isNetworkError(error)) {
    return new AiRequestError("Network request failed.", {
      providerError: error instanceof Error ? error.message : "Network request failed.",
      network: true,
    });
  }
  return new AiRequestError(error instanceof Error ? error.message : "Unexpected streaming error.");
}

function shouldSuggestModel(error: AiRequestError) {
  const text = `${error.message} ${error.providerError ?? ""}`.toLowerCase();
  return (
    error.statusCode === 404 ||
    error.statusCode === 408 ||
    error.statusCode === 409 ||
    error.statusCode === 429 ||
    error.statusCode === 504 ||
    Boolean(error.timeoutReason) ||
    text.includes("model not found") ||
    text.includes("not found") ||
    text.includes("overload") ||
    text.includes("overloaded") ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("rate limit")
  );
}

function shouldFallbackModel(error: AiRequestError, receivedToken: boolean) {
  if (receivedToken || error.statusCode === 401) return false;
  const text = `${error.message} ${error.providerError ?? ""}`.toLowerCase();
  return (
    error.statusCode === 403 ||
    error.statusCode === 404 ||
    error.statusCode === 429 ||
    error.statusCode === 500 ||
    error.statusCode === 502 ||
    error.statusCode === 503 ||
    error.statusCode === 504 ||
    Boolean(error.timeoutReason) ||
    text.includes("model") ||
    text.includes("overload") ||
    text.includes("unavailable") ||
    text.includes("timed out")
  );
}

function classifyModelCheck(statusCode?: number) {
  if (statusCode === 401 || statusCode === 403 || statusCode === 404) return "unavailable" as const;
  return "unstable" as const;
}

function pemToBuffer(pem: string) {
  const base64 = pem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function bufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

async function encryptApiKeyForServer(apiKey: string) {
  const keyResponse = await fetch("/api/credentials/key", { method: "GET" });
  const keyPayload = (await keyResponse.json()) as { publicKey?: string; error?: string };
  if (!keyResponse.ok || !keyPayload.publicKey) {
    throw new Error(keyPayload.error || "Failed to prepare API key encryption.");
  }

  const publicKey = await window.crypto.subtle.importKey(
    "spki",
    pemToBuffer(keyPayload.publicKey),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );

  const encrypted = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    new TextEncoder().encode(apiKey),
  );
  return bufferToBase64(encrypted);
}

export function ChatApp() {
  const [state, setState] = useState<StorageState>(DEFAULT_STORAGE);
  const [appReady, setAppReady] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [modelLoadWarning, setModelLoadWarning] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<"general" | "model" | "provider">("general");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [checkingModels, setCheckingModels] = useState<Record<string, boolean>>({});
  const [serverKeyAvailable, setServerKeyAvailable] = useState(false);
  const [customKeyAvailable, setCustomKeyAvailable] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [messageWindow, setMessageWindow] = useState({ start: 0, end: Number.POSITIVE_INFINITY });
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [hasNewMessagesAbove, setHasNewMessagesAbove] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeCompletionRef = useRef<{ chatId: string; assistantId: string } | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const streamFrameRef = useRef<number | null>(null);
  const streamBufferRef = useRef("");
  const streamTargetRef = useRef<{ chatId: string; messageId: string; model: string } | null>(null);
  const streamFullContentRef = useRef("");
  const detectedThinkingModelsRef = useRef(new Set<string>());
  const nearBottomRef = useRef(true);
  const lastSeenBottomMessageRef = useRef("");
  const initializedRef = useRef(false);
  const backgroundModelsStartedRef = useRef(false);
  const modelCheckQueueRef = useRef<string[]>([]);
  const modelCheckActiveRef = useRef(new Set<string>());

  const settings = state.settings;
  const isIndonesian = settings.language === "id";
  const t = {
    newChat: isIndonesian ? "Chat baru" : "New chat",
    toggleTheme: isIndonesian ? "Ganti tema" : "Toggle theme",
    openSettings: isIndonesian ? "Buka pengaturan" : "Open settings",
    intro: isIndonesian
      ? "UI ChatGPT ringan untuk API OpenAI-compatible. Pengaturan dan chat hanya disimpan di browser."
      : "Lightweight ChatGPT-like UI for any OpenAI-compatible API. Settings and chats are stored in your browser only.",
    addApiKey: isIndonesian ? "Tambahkan API key di Pengaturan" : "Add API key in Settings",
    openSettingsButton: isIndonesian ? "Buka Pengaturan" : "Open Settings",
  };
  const activeChat = useMemo(
    () => state.chats.find((chat) => chat.id === state.activeChatId) ?? null,
    [state.activeChatId, state.chats],
  );
  const activeMessages = useMemo(() => activeChat?.messages ?? [], [activeChat?.messages]);
  const lastMessageContent = activeMessages.at(-1)?.content;
  const lastAssistantId = useMemo(
    () => activeMessages.findLast((item) => item.role === "assistant")?.id ?? null,
    [activeMessages],
  );
  const shouldVirtualize = activeMessages.length > VIRTUALIZE_AFTER;
  const visibleMessages = useMemo(() => {
    if (!shouldVirtualize) return activeMessages;
    return activeMessages.slice(messageWindow.start, Math.min(messageWindow.end, activeMessages.length));
  }, [activeMessages, messageWindow.end, messageWindow.start, shouldVirtualize]);
  const virtualTopPadding = shouldVirtualize ? messageWindow.start * ESTIMATED_MESSAGE_HEIGHT : 0;
  const virtualBottomPadding = shouldVirtualize
    ? Math.max(0, activeMessages.length - Math.min(messageWindow.end, activeMessages.length)) *
      ESTIMATED_MESSAGE_HEIGHT
    : 0;

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const forceReady = window.setTimeout(() => {
      setSettingsLoaded(true);
      setAppReady(true);
    }, 2_000);

    try {
      const loaded = loadStorage();
      const loadedModels = withDefaultModel(loaded.settings.models.length ? loaded.settings.models : [FALLBACK_MODEL]);
      const loadedState: StorageState = {
        ...loaded,
        settings: {
          ...loaded.settings,
          models: loadedModels,
          activeModel: loaded.settings.activeModel || DEFAULT_MODEL,
        },
      };

      // eslint-disable-next-line react-hooks/set-state-in-effect -- Local storage must hydrate after client mount to avoid SSR mismatch.
      setState(loadedState);
      document.documentElement.dataset.theme = loadedState.settings.theme;
      document.body.dataset.theme = loadedState.settings.theme;
    } catch (error) {
      console.warn("Failed to load local settings", {
        error: error instanceof Error ? error.message : "Unknown local storage error.",
      });
      setModelLoadWarning(
        "Pengaturan lokal gagal dimuat. Menggunakan konfigurasi default sementara.",
      );
    } finally {
      window.clearTimeout(forceReady);
      setSettingsLoaded(true);
      setAppReady(true);
    }
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    document.documentElement.dataset.theme = settings.theme;
    document.body.dataset.theme = settings.theme;
  }, [settings.theme, settingsLoaded]);

  useEffect(() => {
    if (!settingsLoaded) return;
    if (generating) return;
    const timeout = window.setTimeout(() => saveStorage(state), 250);
    return () => window.clearTimeout(timeout);
  }, [generating, settingsLoaded, state]);

  const updateVirtualWindow = useCallback((scrollTop: number, viewportHeight: number, messageCount: number) => {
    if (messageCount <= VIRTUALIZE_AFTER) {
      setMessageWindow((current) =>
        current.start === 0 && current.end === Number.POSITIVE_INFINITY
          ? current
          : { start: 0, end: Number.POSITIVE_INFINITY },
      );
      return;
    }

    const visibleCount = Math.ceil(viewportHeight / ESTIMATED_MESSAGE_HEIGHT) + VIRTUAL_OVERSCAN * 2;
    const start = Math.max(0, Math.floor(scrollTop / ESTIMATED_MESSAGE_HEIGHT) - VIRTUAL_OVERSCAN);
    const end = Math.min(messageCount, start + visibleCount);
    setMessageWindow((current) => (current.start === start && current.end === end ? current : { start, end }));
  }, []);

  const scheduleAutoScroll = useCallback((behavior: ScrollBehavior = "auto") => {
    if (!nearBottomRef.current) return;
    setShowScrollToBottom(false);
    setHasNewMessagesAbove(false);
    if (autoScrollFrameRef.current !== null) cancelAnimationFrame(autoScrollFrameRef.current);

    autoScrollFrameRef.current = requestAnimationFrame(() => {
      autoScrollFrameRef.current = null;
      const container = scrollContainerRef.current;
      if (!container) return;
      container.scrollTo({ top: container.scrollHeight, behavior });
    });
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom <= 200;
    nearBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
    if (nearBottom) setHasNewMessagesAbove(false);
    updateVirtualWindow(container.scrollTop, container.clientHeight, activeMessages.length);
  }, [activeMessages.length, updateVirtualWindow]);

  const scrollToBottom = useCallback(() => {
    nearBottomRef.current = true;
    setShowScrollToBottom(false);
    setHasNewMessagesAbove(false);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (nearBottomRef.current && activeMessages.length > VIRTUALIZE_AFTER) {
      const visibleCount =
        Math.ceil(container.clientHeight / ESTIMATED_MESSAGE_HEIGHT) + VIRTUAL_OVERSCAN * 2;
      const end = activeMessages.length;
      const start = Math.max(0, end - visibleCount);
      setMessageWindow((current) => (current.start === start && current.end === end ? current : { start, end }));
      return;
    }
    updateVirtualWindow(container.scrollTop, container.clientHeight, activeMessages.length);
  }, [activeChat?.id, activeMessages.length, updateVirtualWindow]);

  useEffect(() => {
    scheduleAutoScroll("smooth");
  }, [activeChat?.id, activeMessages.length, scheduleAutoScroll]);

  useEffect(() => {
    const latest = activeMessages.at(-1);
    const latestKey = latest ? `${latest.id}:${latest.content.length}:${latest.error ?? ""}` : "";
    if (!latestKey || latestKey === lastSeenBottomMessageRef.current) return;

    if (nearBottomRef.current) {
      lastSeenBottomMessageRef.current = latestKey;
      setHasNewMessagesAbove(false);
      return;
    }

    lastSeenBottomMessageRef.current = latestKey;
    setHasNewMessagesAbove(true);
    setShowScrollToBottom(true);
  }, [activeMessages]);

  useEffect(() => {
    if (!generating) return;
    scheduleAutoScroll("auto");
  }, [generating, lastMessageContent, scheduleAutoScroll]);

  useEffect(() => {
    return () => {
      if (autoScrollFrameRef.current !== null) cancelAnimationFrame(autoScrollFrameRef.current);
      if (streamFrameRef.current !== null) cancelAnimationFrame(streamFrameRef.current);
    };
  }, []);

  const updateSettings = useCallback((next: ProviderSettings) => {
    setState((current) => ({
      ...current,
      settings: {
        ...next,
        models: withDefaultModel(next.models.length ? next.models : (current.settings.models.length ? current.settings.models : [FALLBACK_MODEL])),
        activeModel: next.activeModel || DEFAULT_MODEL,
      },
      modelAvailability: withDefaultModel(next.models.length
        ? next.models
        : (current.settings.models.length ? current.settings.models : [FALLBACK_MODEL])
      ).reduce<Record<string, ModelAvailability>>(
        (result, model) => {
          result[model] = current.modelAvailability[model] ?? { status: "unknown" };
          return result;
        },
        {},
      ),
      modelCapabilities: withDefaultModel(next.models.length
        ? next.models
        : (current.settings.models.length ? current.settings.models : [FALLBACK_MODEL])
      ).reduce<Record<string, ModelCapabilities>>(
        (result, model) => {
          result[model] = current.modelCapabilities[model] ?? {};
          return result;
        },
        {},
      ),
    }));
  }, []);

  const setActiveModel = useCallback((model: string) => {
    updateSettings({ ...settings, activeModel: model });
  }, [settings, updateSettings]);

  const openSettings = useCallback((section: "general" | "model" | "provider" = "general") => {
    setSettingsInitialSection(section);
    setSettingsOpen(true);
  }, []);

  const changeToSuggestedModel = useCallback(() => {
    const nextModel =
      MODEL_SUGGESTIONS.find((model) => model !== settings.activeModel) ?? MODEL_SUGGESTIONS[0];
    const models = Array.from(new Set([nextModel, ...settings.models]));
    updateSettings({
      ...settings,
      models,
      activeModel: nextModel,
    });
  }, [settings, updateSettings]);

  const updateModelAvailability = useCallback((model: string, next: ModelAvailability) => {
    setState((current) => ({
      ...current,
      modelAvailability: {
        ...current.modelAvailability,
        [model]: next,
      },
    }));
  }, []);

  const updateModelCapabilities = useCallback((model: string, next: ModelCapabilities) => {
    setState((current) => ({
      ...current,
      modelCapabilities: {
        ...current.modelCapabilities,
        [model]: {
          ...current.modelCapabilities[model],
          ...next,
        },
      },
    }));
  }, []);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- The checker drains its own bounded queue after each async request finishes.
  const runModelCheck = useCallback(async (model: string) => {
    setCheckingModels((current) => ({ ...current, [model]: true }));
    try {
      const response = await fetch("/api/models/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const payload = (await response.json()) as {
        error?: string;
        providerError?: string;
        timeoutReason?: string;
        abortReason?: string;
      };

      if (response.ok) {
        updateModelAvailability(model, {
          status: "available",
          checkedAt: new Date().toISOString(),
        });
        return;
      }

      console.warn("AI model availability check response", {
        statusCode: response.status,
        providerError: payload.providerError || payload.error || response.statusText,
        timeoutReason: payload.timeoutReason,
        abortReason: payload.abortReason,
        model,
      });
      updateModelAvailability(model, {
        status: classifyModelCheck(response.status),
        checkedAt: new Date().toISOString(),
        statusCode: response.status,
        providerError: payload.providerError || payload.error || response.statusText,
      });
    } catch (error) {
      console.warn("AI model availability check failed", {
        providerError: error instanceof Error ? error.message : "Model check failed.",
        model,
      });
      updateModelAvailability(model, {
        status: "unstable",
        checkedAt: new Date().toISOString(),
        providerError: error instanceof Error ? error.message : "Model check failed.",
      });
    } finally {
      setCheckingModels((current) => {
        const next = { ...current };
        delete next[model];
        return next;
      });
      modelCheckActiveRef.current.delete(model);
      const nextModel = modelCheckQueueRef.current.shift();
      if (nextModel) {
        modelCheckActiveRef.current.add(nextModel);
        void runModelCheck(nextModel);
      }
    }
  }, [updateModelAvailability]);

  const checkModelAvailability = useCallback((model: string) => {
    if (!model) return;
    if (modelCheckActiveRef.current.has(model)) return;
    if (modelCheckQueueRef.current.includes(model)) return;

    if (modelCheckActiveRef.current.size < 2) {
      modelCheckActiveRef.current.add(model);
      void runModelCheck(model);
      return;
    }

    modelCheckQueueRef.current.push(model);
  }, [runModelCheck]);

  const upsertChat = useCallback((chat: Chat) => {
    setState((current) => ({
      ...current,
      chats: [chat, ...current.chats.filter((item) => item.id !== chat.id)],
      activeChatId: chat.id,
    }));
  }, []);

  const updateMessage = useCallback((chatId: string, messageId: string, updater: (message: Message) => Message) => {
    setState((current) => ({
      ...current,
      chats: current.chats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              updatedAt: nowIso(),
              messages: chat.messages.map((message) =>
                message.id === messageId ? updater(message) : message,
              ),
            }
          : chat,
      ),
    }));
  }, []);

  const flushStreamBuffer = useCallback(() => {
    streamFrameRef.current = null;
    const chunk = streamBufferRef.current;
    const target = streamTargetRef.current;
    if (!chunk || !target) return;

    streamBufferRef.current = "";
    streamFullContentRef.current += chunk;
    const streamedThinking = parseThinkTags(streamFullContentRef.current);
    if (streamedThinking.hasThinking && !detectedThinkingModelsRef.current.has(target.model)) {
      detectedThinkingModelsRef.current.add(target.model);
      updateModelCapabilities(target.model, {
        thinking: true,
        detectedAt: nowIso(),
      });
      void fetch("/api/models/capabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: target.model,
          source: "detected",
          capabilities: { thinking: true },
        }),
      }).catch((error) => {
        console.warn("Failed to persist detected model capability", {
          providerError: error instanceof Error ? error.message : "Capability cache update failed.",
          model: target.model,
        });
      });
    }
    updateMessage(target.chatId, target.messageId, (message) => {
      const content = `${message.content}${chunk}`;
      const parsed = parseThinkTags(content);
      return {
        ...message,
        content,
        thinkingStartedAt: parsed.hasThinking ? (message.thinkingStartedAt ?? nowIso()) : message.thinkingStartedAt,
        thinkingEndedAt: parsed.isThinkingClosed ? (message.thinkingEndedAt ?? nowIso()) : message.thinkingEndedAt,
      };
    });
  }, [updateMessage, updateModelCapabilities]);

  const clearStreamBuffer = useCallback(() => {
    streamBufferRef.current = "";
    streamFullContentRef.current = "";
    streamTargetRef.current = null;
    if (streamFrameRef.current !== null) {
      cancelAnimationFrame(streamFrameRef.current);
      streamFrameRef.current = null;
    }
  }, []);

  const queueAssistantDelta = useCallback(
    (chatId: string, messageId: string, model: string, delta: string, signal?: AbortSignal) => {
      if (signal?.aborted) return;
      streamTargetRef.current = { chatId, messageId, model };
      streamBufferRef.current += delta;

      if (streamFrameRef.current === null) {
        streamFrameRef.current = requestAnimationFrame(flushStreamBuffer);
      }
    },
    [flushStreamBuffer],
  );

  const finalizeThinking = useCallback((chatId: string, assistantId: string) => {
    updateMessage(chatId, assistantId, (message) => {
      const parsed = parseThinkTags(message.content);
      if (!parsed.hasThinking || !message.thinkingStartedAt || message.thinkingEndedAt) return message;
      return {
        ...message,
        thinkingEndedAt: nowIso(),
      };
    });
  }, [updateMessage]);

  const markAssistantStopped = useCallback((chatId: string, assistantId: string) => {
    updateMessage(chatId, assistantId, (message) =>
      message.error
        ? message
        : {
            ...message,
            requestStatus: "stopped",
            error: undefined,
            errorMeta: undefined,
            thinkingEndedAt: message.thinkingStartedAt && !message.thinkingEndedAt ? nowIso() : message.thinkingEndedAt,
          },
    );
  }, [updateMessage]);

  const runCompletion = useCallback(async (chatId: string, requestMessages: Message[], assistantId: string) => {
    const controller = new AbortController();
    let requestTimeout: number | null = null;
    let slowTimer: number | null = null;
    let warningTimer: number | null = null;
    let noTokenTimer: number | null = null;
    let receivedToken = false;
    let currentRequestStatus: Message["requestStatus"] | undefined;

    const clearTimer = (timer: number | null) => {
      if (timer !== null) window.clearTimeout(timer);
    };
    const clearAllTimers = () => {
      clearTimer(requestTimeout);
      clearTimer(slowTimer);
      clearTimer(warningTimer);
      clearTimer(noTokenTimer);
      requestTimeout = null;
      slowTimer = null;
      warningTimer = null;
      noTokenTimer = null;
    };
    const setRequestStatus = (requestStatus: Message["requestStatus"]) => {
      if (controller.signal.aborted) return;
      if (currentRequestStatus === requestStatus) return;
      currentRequestStatus = requestStatus;
      updateMessage(chatId, assistantId, (message) =>
        message.error ? message : { ...message, requestStatus },
      );
    };
    const clearRequestStatus = () => {
      if (!currentRequestStatus) return;
      currentRequestStatus = undefined;
      updateMessage(chatId, assistantId, (message) =>
        message.requestStatus ? { ...message, requestStatus: undefined } : message,
      );
    };
    const scheduleNoTokenTimer = () => {
      clearTimer(noTokenTimer);
      noTokenTimer = window.setTimeout(() => setRequestStatus("waiting"), NO_TOKEN_RESPONSE_MS);
    };
    const scheduleRequestTimeout = (model: string, targetController: AbortController) => {
      clearTimer(requestTimeout);
      requestTimeout = window.setTimeout(() => {
        targetController.abort(new DOMException(`Chat request exceeded ${Math.round(CHAT_REQUEST_TIMEOUT_MS / 1000)} seconds.`, "TimeoutError"));
      }, CHAT_REQUEST_TIMEOUT_MS);
    };

    abortControllerRef.current = controller;
    activeCompletionRef.current = { chatId, assistantId };
    clearStreamBuffer();
    setGenerating(true);
    slowTimer = window.setTimeout(() => setRequestStatus("slow"), SLOW_RESPONSE_MS);
    warningTimer = window.setTimeout(() => setRequestStatus("warning"), WARNING_RESPONSE_MS);
    scheduleNoTokenTimer();

    try {
      const candidateModels = Array.from(new Set([settings.activeModel, ...CHAT_FALLBACK_MODELS])).filter(Boolean);
      for (const candidateModel of candidateModels) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const attemptController = new AbortController();
          const abortAttempt = () => {
            attemptController.abort(controller.signal.reason ?? new DOMException("Request aborted.", "AbortError"));
          };

          if (controller.signal.aborted) abortAttempt();
          else controller.signal.addEventListener("abort", abortAttempt, { once: true });

          try {
            scheduleRequestTimeout(candidateModel, attemptController);
            const response = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: candidateModel,
                temperature: settings.temperature,
                maxTokens: settings.maxTokens,
                systemPrompt: settings.systemPrompt,
                messages: toApiMessages(requestMessages),
              }),
              signal: attemptController.signal,
            });

            if (!response.ok) {
              let parsed = {
                message: response.statusText || "Request failed.",
                providerError: "",
                timeoutReason: "",
                abortReason: "",
              };
              try {
                parsed = parseApiError(await response.json(), parsed.message);
              } catch {
                parsed.message = cleanErrorText(await response.text());
              }
              throw new AiRequestError(parsed.message || "Request failed.", {
                statusCode: response.status,
                providerError: parsed.providerError,
                timeoutReason: parsed.timeoutReason,
                abortReason: parsed.abortReason,
              });
            }

            const streamResult = await readOpenAIStream(
              response,
              (delta) => {
                if (controller.signal.aborted || attemptController.signal.aborted) return;
                receivedToken = true;
                clearRequestStatus();
                scheduleNoTokenTimer();
                queueAssistantDelta(chatId, assistantId, candidateModel, delta, attemptController.signal);
              },
              attemptController.signal,
            );
            console.info("AI chat stream finished", {
              finishReason: streamResult.finishReason,
              providerFinishReason: streamResult.providerFinishReason,
              bytesRead: streamResult.bytesRead,
              eventCount: streamResult.eventCount,
              deltaCount: streamResult.deltaCount,
              model: candidateModel,
            });
            if (candidateModel !== settings.activeModel) setActiveModel(candidateModel);
            return;
          } catch (error) {
            if (controller.signal.aborted) {
              flushStreamBuffer();
              clearStreamBuffer();
              markAssistantStopped(chatId, assistantId);
              return;
            }

            const failure = attemptController.signal.aborted && isTimeoutSignal(attemptController.signal)
              ? new AiRequestError("Chat request timed out.", {
                  statusCode: 504,
                  timeoutReason: getSignalReason(attemptController.signal),
                  abortReason: getSignalReason(attemptController.signal),
                })
              : toAiRequestError(error);
            const shouldRetry =
              attempt === 0 &&
              !receivedToken &&
              failure.network &&
              failure.statusCode !== 401 &&
              failure.statusCode !== 403;
            const canFallback =
              attempt === 1 || !shouldRetry
                ? candidateModel !== candidateModels.at(-1) && shouldFallbackModel(failure, receivedToken)
                : false;

            console.warn("AI chat request error", {
              statusCode: failure.statusCode,
              providerError: failure.providerError || failure.message,
              timeoutReason: failure.timeoutReason,
              abortReason: failure.abortReason,
              retrying: shouldRetry,
              fallbackModel: canFallback ? candidateModels[candidateModels.indexOf(candidateModel) + 1] : undefined,
              model: candidateModel,
            });

            if (shouldRetry) continue;
            if (canFallback) break;
            throw failure;
          } finally {
            controller.signal.removeEventListener("abort", abortAttempt);
            clearTimer(requestTimeout);
            requestTimeout = null;
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted && !isTimeoutSignal(controller.signal)) {
        flushStreamBuffer();
        clearStreamBuffer();
        markAssistantStopped(chatId, assistantId);
        return;
      }

      const failure = toAiRequestError(error);
      flushStreamBuffer();
      clearStreamBuffer();
      updateMessage(chatId, assistantId, (message) => ({
        ...message,
        requestStatus: undefined,
        error: failure.message,
        errorMeta: {
          statusCode: failure.statusCode,
          providerError: failure.providerError,
          timeoutReason: failure.timeoutReason,
          abortReason: failure.abortReason,
          shouldSuggestModel: shouldSuggestModel(failure),
        },
      }));
    } finally {
      clearAllTimers();
      if (!controller.signal.aborted) flushStreamBuffer();
      finalizeThinking(chatId, assistantId);
      const isCurrentCompletion =
        abortControllerRef.current === controller || activeCompletionRef.current?.assistantId === assistantId;
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      if (activeCompletionRef.current?.assistantId === assistantId) activeCompletionRef.current = null;
      if (isCurrentCompletion) setGenerating(false);
    }
  }, [
    clearStreamBuffer,
    finalizeThinking,
    flushStreamBuffer,
    markAssistantStopped,
    queueAssistantDelta,
    setActiveModel,
    settings.activeModel,
    settings.maxTokens,
    settings.systemPrompt,
    settings.temperature,
    updateMessage,
  ]);

  const credentialReady = Boolean(customKeyAvailable || serverKeyAvailable);

  const disabledReason = useMemo(() => {
    if (!credentialReady) {
      return settings.language === "id"
        ? "Tambahkan API key di Settings atau konfigurasi NVIDIA_API_KEY di server."
        : "Add an API key in Settings or configure NVIDIA_API_KEY on the server.";
    }
    if (!settings.activeModel.trim()) {
      return settings.language === "id"
        ? "Pilih model aktif sebelum mengirim pesan."
        : "Select an active model before sending messages.";
    }
    return null;
  }, [credentialReady, settings.activeModel, settings.language]);

  const sendMessage = useCallback((attachments: ComposerAttachment[] = []) => {
    const displayContent = input.trim();
    if ((!displayContent && !attachments.length) || disabledReason || generating) return;

    const timestamp = nowIso();
    const chatId = activeChat?.id ?? makeId();
    const existingMessages = activeChat?.messages ?? [];
    const content = buildAttachmentPrompt(displayContent, attachments, settings.language);
    const attachmentMetadata = toMessageAttachments(attachments);
    const userMessage: Message = {
      id: makeId(),
      role: "user",
      content,
      displayContent,
      attachments: attachmentMetadata.length ? attachmentMetadata : undefined,
      createdAt: timestamp,
    };
    const assistant = createAssistantPlaceholder();
    const messages = [...existingMessages, userMessage, assistant];
    const nextChat: Chat = {
      id: chatId,
      title: existingMessages.length
        ? (activeChat?.title ?? "New chat")
        : makeChatTitle(displayContent || attachmentMetadata.map((attachment) => attachment.name).join(", ")),
      messages,
      createdAt: activeChat?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    setInput("");
    upsertChat(nextChat);
    void runCompletion(chatId, messages.filter((message) => message.id !== assistant.id), assistant.id);
  }, [activeChat, disabledReason, generating, input, runCompletion, settings.language, upsertChat]);

  const editUserMessage = useCallback((messageId: string, content: string) => {
    if (!activeChat || generating) return;
    const index = activeChat.messages.findIndex((message) => message.id === messageId);
    if (index < 0 || activeChat.messages[index]?.role !== "user") return;

    const timestamp = nowIso();
    const edited: Message = {
      ...activeChat.messages[index],
      content,
      displayContent: content,
      attachments: undefined,
    };
    const assistant = createAssistantPlaceholder();
    const messages = [...activeChat.messages.slice(0, index), edited, assistant];
    const firstUser = messages.find((message) => message.role === "user");
    const chat: Chat = {
      ...activeChat,
      title: firstUser ? makeChatTitle(firstUser.content) : activeChat.title,
      messages,
      updatedAt: timestamp,
    };

    upsertChat(chat);
    void runCompletion(activeChat.id, messages.filter((message) => message.id !== assistant.id), assistant.id);
  }, [activeChat, generating, runCompletion, upsertChat]);

  const regenerateLast = useCallback(() => {
    if (!activeChat || generating) return;
    const messages = [...activeChat.messages];
    if (!messages.length) return;

    if (messages[messages.length - 1]?.role === "assistant") {
      messages.pop();
    }

    if (!messages.some((message) => message.role === "user")) return;

    const assistant = createAssistantPlaceholder();
    const nextMessages = [...messages, assistant];
    upsertChat({
      ...activeChat,
      messages: nextMessages,
      updatedAt: nowIso(),
    });
    void runCompletion(activeChat.id, messages, assistant.id);
  }, [activeChat, generating, runCompletion, upsertChat]);

  const stopGenerating = useCallback(() => {
    const controller = abortControllerRef.current;
    const activeCompletion = activeCompletionRef.current;

    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }

    if (controller && !controller.signal.aborted) {
      controller.abort(new DOMException("User cancelled request.", "AbortError"));
    }

    flushStreamBuffer();
    clearStreamBuffer();
    if (activeCompletion) {
      markAssistantStopped(activeCompletion.chatId, activeCompletion.assistantId);
    }
    abortControllerRef.current = null;
    activeCompletionRef.current = null;
    setGenerating(false);
  }, [clearStreamBuffer, flushStreamBuffer, markAssistantStopped]);

  const newChat = useCallback(() => {
    setState((current) => ({ ...current, activeChatId: null }));
    setInput("");
  }, []);

  const deleteChat = useCallback((id: string) => {
    setState((current) => {
      const chats = current.chats.filter((chat) => chat.id !== id);
      return {
        ...current,
        chats,
        activeChatId: current.activeChatId === id ? (chats[0]?.id ?? null) : current.activeChatId,
      };
    });
  }, []);

  const clearChats = useCallback(() => {
    setState((current) => ({ ...current, chats: [], activeChatId: null }));
  }, []);

  const fetchModels = useCallback(async (options?: { silent?: boolean; refresh?: boolean }): Promise<{ ok: boolean; error?: string }> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort(new DOMException("Model fetch exceeded 15 seconds.", "TimeoutError"));
    }, MODEL_FETCH_TIMEOUT_MS);

    setModelsLoading(true);
    if (!options?.silent) setImportError(null);

    try {
      const response = await fetch(options?.refresh ? "/api/models/refresh" : "/api/models?provider=nvidia", {
        method: options?.refresh ? "POST" : "GET",
        headers: options?.refresh ? { "Content-Type": "application/json" } : undefined,
        body: options?.refresh ? JSON.stringify({}) : undefined,
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        warning?: string;
        models?: string[];
        error?: string;
        providerError?: string;
        timeoutReason?: string;
        abortReason?: string;
        providerName?: string;
        baseUrl?: string;
        hasServerKey?: boolean;
        credentialSource?: string;
        modelAvailability?: Record<string, ModelAvailability>;
        modelCapabilities?: Record<string, ModelCapabilities>;
      };
      setServerKeyAvailable(Boolean(payload.hasServerKey));
      setCustomKeyAvailable(payload.credentialSource === "custom" || customKeyAvailable);
      if (!response.ok) {
        console.warn("AI model fetch response error", {
          statusCode: response.status,
          providerError: payload.providerError || payload.error || response.statusText,
          timeoutReason: payload.timeoutReason,
          abortReason: payload.abortReason,
        });
        throw new Error(payload.error || response.statusText);
      }

      const merged = withDefaultModel([...(settings.models ?? []), ...(payload.models ?? [])]);
      const models = merged.length ? merged : [FALLBACK_MODEL];
      updateSettings({
        ...settings,
        providerName: payload.providerName || "NVIDIA",
        baseUrl: payload.baseUrl || settings.baseUrl,
        models,
        activeModel: settings.activeModel || DEFAULT_MODEL,
      });
      setState((current) => ({
        ...current,
        modelAvailability: {
          ...current.modelAvailability,
          ...(payload.modelAvailability ?? {}),
        },
        modelCapabilities: {
          ...current.modelCapabilities,
          ...(payload.modelCapabilities ?? {}),
        },
      }));
      setModelLoadWarning(payload.warning ?? null);
      return { ok: true };
    } catch (error) {
      const timeoutReason = controller.signal.aborted ? getSignalReason(controller.signal) : undefined;
      console.warn("AI model fetch error", {
        providerError: error instanceof Error ? error.message : "Failed to fetch models.",
        timeoutReason,
        abortReason: timeoutReason,
      });
      const message = controller.signal.aborted && isTimeoutSignal(controller.signal)
        ? "Failed to fetch models."
        : error instanceof Error
          ? error.message
          : "Failed to fetch models.";
      const localizedMessage = localizeModelError(message, settings.language);
      if (!options?.silent) {
        setImportError(localizedMessage);
      }
      return { ok: false, error: localizedMessage };
    } finally {
      window.clearTimeout(timeout);
      setModelsLoading(false);
    }
  }, [customKeyAvailable, settings, updateSettings]);

  const refreshCredentialStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/credentials", { method: "GET" });
      const payload = (await response.json()) as { hasServerKey?: boolean; hasCustomKey?: boolean };
      setServerKeyAvailable(Boolean(payload.hasServerKey));
      setCustomKeyAvailable(Boolean(payload.hasCustomKey));
    } catch {
      setServerKeyAvailable(false);
      setCustomKeyAvailable(false);
    }
  }, []);

  const saveCustomApiKey = useCallback(async (apiKey: string) => {
    const encryptedApiKey = await encryptApiKeyForServer(apiKey);
    const response = await fetch("/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encryptedApiKey }),
    });
    const payload = (await response.json()) as { error?: string; hasServerKey?: boolean; hasCustomKey?: boolean };
    if (!response.ok) throw new Error(payload.error || response.statusText);
    setServerKeyAvailable(Boolean(payload.hasServerKey));
    setCustomKeyAvailable(Boolean(payload.hasCustomKey));
    await fetchModels({ silent: true });
  }, [fetchModels]);

  const clearCustomApiKey = useCallback(async () => {
    const response = await fetch("/api/credentials", { method: "DELETE" });
    const payload = (await response.json()) as { hasServerKey?: boolean; hasCustomKey?: boolean };
    if (!response.ok) throw new Error(response.statusText);
    setServerKeyAvailable(Boolean(payload.hasServerKey));
    setCustomKeyAvailable(Boolean(payload.hasCustomKey));
    await fetchModels({ silent: true });
  }, [fetchModels]);

  useEffect(() => {
    if (!appReady || !settingsLoaded || backgroundModelsStartedRef.current) return;
    backgroundModelsStartedRef.current = true;

    void refreshCredentialStatus();
    void fetchModels({ silent: true }).then((result) => {
      if (result.ok) return;
      setModelLoadWarning(
        result.error
          ? `Gagal mengambil daftar model: ${result.error}. Menggunakan model tersimpan/default.`
          : "Gagal mengambil daftar model. Menggunakan model tersimpan/default.",
      );
    });
  }, [appReady, fetchModels, refreshCredentialStatus, settingsLoaded]);

  function exportJson() {
    const bundle = createExportBundle(state);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ai-chat-webui-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function importJson(text: string) {
    try {
      setState(parseImportBundle(text));
      setImportError(null);
    } catch {
      setImportError(localizeModelError("Import failed. Use a valid exported JSON file.", settings.language));
    }
  }

  if (!appReady) {
    return (
      <SplashScreen
        providerName={settings.providerName}
      />
    );
  }

  return (
    <main
      data-theme={settings.theme}
      className="app-shell flex h-dvh w-full overflow-hidden text-[var(--foreground)]"
    >
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close mobile menu overlay"
          onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-30 bg-[var(--backdrop)] md:backdrop-blur-sm md:hidden"
        />
      ) : null}

      <ChatSidebar
        chats={state.chats}
        activeChatId={state.activeChatId}
        settings={settings}
        searchQuery={searchQuery}
        mobileOpen={mobileOpen}
        onSearchChange={setSearchQuery}
        onSelectChat={(id) => setState((current) => ({ ...current, activeChatId: id }))}
        onNewChat={() => {
          newChat();
          setMobileOpen(false);
        }}
        onDeleteChat={deleteChat}
        onClearChats={clearChats}
        onSettings={() => setSettingsOpen(true)}
        onCloseMobile={() => setMobileOpen(false)}
        onActiveModelChange={setActiveModel}
        modelAvailability={state.modelAvailability}
        modelCapabilities={state.modelCapabilities}
        checkingModels={checkingModels}
        onCheckModel={checkModelAvailability}
        language={settings.language}
      />

      <section className="relative flex h-full min-w-0 flex-1 flex-col bg-[var(--background)]">
        <header className="z-20 flex h-12 shrink-0 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--surface)] px-2 sm:h-14 sm:gap-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
            <MobileMenuButton
              onClick={() => setMobileOpen(true)}
              language={settings.language}
            />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-semibold sm:text-sm">
                {activeChat?.title ?? (isIndonesian ? "Obrolan baru" : "New chat")}
              </div>
              <div className="max-w-[52vw] truncate text-[10px] leading-4 text-[var(--muted)] sm:max-w-none">
                {settings.activeModel ? getModelDisplayName(settings.activeModel) : (isIndonesian ? "Tidak ada model" : "No model")}
              </div>
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              title={t.toggleTheme}
              onClick={() =>
                updateSettings({ ...settings, theme: settings.theme === "dark" ? "light" : "dark" })
              }
              className={cn(
                "soft-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-transparent text-[var(--muted)] leading-none transition hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] active:scale-95 sm:h-11 sm:w-11",
              )}
            >
              {settings.theme === "dark" ? <Moon size={18} className="sm:h-5 sm:w-5" /> : <Sun size={18} className="sm:h-5 sm:w-5" />}
            </button>
            <button
              type="button"
              title={t.openSettings}
              onClick={() => setSettingsOpen(true)}
              className={cn(
                "soft-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-transparent text-[var(--muted)] leading-none transition hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] active:scale-95 sm:h-11 sm:w-11",
              )}
            >
              <SlidersHorizontal size={18} className="sm:h-5 sm:w-5" />
            </button>
          </div>
        </header>

        {modelLoadWarning ? (
          <div className="border-b border-[var(--warning)]/50 bg-[var(--warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--warning-text)] sm:px-4">
            <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{modelLoadWarning}</span>
              <button
                type="button"
                onClick={() => {
                  setModelLoadWarning(null);
                  openSettings("model");
                }}
                className="soft-focus-ring w-fit rounded-md border border-[var(--warning)]/45 px-2.5 py-1 font-medium transition hover:bg-[var(--surface-hover)]"
              >
                {isIndonesian ? "Cek model" : "Check models"}
              </button>
            </div>
          </div>
        ) : null}

        <div
          ref={scrollContainerRef}
          onScroll={handleMessagesScroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth px-2.5 [-webkit-overflow-scrolling:touch] sm:px-5"
        >
          <div className="mx-auto flex min-h-full max-w-5xl flex-col">
            {activeMessages.length ? (
              <div className="space-y-3 py-3 sm:space-y-5 sm:py-7">
                {virtualTopPadding ? <div aria-hidden style={{ height: virtualTopPadding }} /> : null}
                {visibleMessages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    generating={generating}
                    isLastAssistant={message.id === lastAssistantId}
                    onEdit={editUserMessage}
                    onRegenerate={regenerateLast}
                    onChangeModel={changeToSuggestedModel}
                    onOpenSettings={() => openSettings("model")}
                    language={settings.language}
                  />
                ))}
                {virtualBottomPadding ? <div aria-hidden style={{ height: virtualBottomPadding }} /> : null}
              </div>
            ) : (
              <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-8 text-center sm:px-6 sm:py-14">
                <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_50%_24%,rgb(52_211_153_/_0.07),transparent_34%),radial-gradient(circle_at_18%_30%,rgb(34_211_238_/_0.045),transparent_26%)]" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/20 to-transparent" />

                <div className="relative w-full max-w-[520px]">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.32, ease: "easeOut" }}
                    className="mx-auto mb-5 grid h-11 w-11 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] text-cyan-200 shadow-[0_12px_32px_rgb(0_0_0_/_0.18)] sm:mb-6"
                  >
                    <Bot size={21} />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.34, delay: 0.04, ease: "easeOut" }}
                  >
                    <h1 className="text-balance text-3xl font-semibold tracking-tight text-[var(--text)]">
                      How can I help you today?
                    </h1>
                    <p className="mx-auto mt-3 max-w-[360px] text-sm leading-6 text-[var(--muted)]">
                      Start a new conversation and explore the power of AI.
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.34, delay: 0.1, ease: "easeOut" }}
                    className="mt-7 grid gap-2 sm:grid-cols-2"
                  >
                    {EMPTY_STATE_SUGGESTIONS.map(({ label, icon: Icon }, index) => (
                      <motion.button
                        key={label}
                        type="button"
                        onClick={() => setInput(label)}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.985 }}
                        transition={{ duration: 0.18, delay: 0.12 + index * 0.035 }}
                        className="soft-focus-ring group flex h-11 items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[rgb(255_255_255_/_0.025)] px-3 text-left text-sm font-medium text-[var(--muted-strong)] shadow-[0_8px_28px_rgb(0_0_0_/_0.12)] transition hover:border-cyan-300/25 hover:bg-[var(--surface-hover)] hover:text-[var(--text)] sm:h-12"
                      >
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-cyan-200/80 transition group-hover:border-cyan-300/25 group-hover:text-cyan-200">
                          <Icon size={14} />
                        </span>
                        <span className="min-w-0 truncate">{label}</span>
                      </motion.button>
                    ))}
                  </motion.div>
                </div>
              </div>
            )}
          </div>
          <div ref={messagesEndRef} />
        </div>

        <ChatInput
          value={input}
          disabledReason={disabledReason}
          generating={generating}
          language={settings.language}
          onChange={setInput}
          onSend={sendMessage}
          onStop={stopGenerating}
        />
        <ScrollToBottomButton
          visible={showScrollToBottom}
          hasNewMessages={hasNewMessagesAbove}
          language={settings.language}
          onClick={scrollToBottom}
        />
      </section>

      <SettingsModal
        open={settingsOpen}
        initialSection={settingsInitialSection}
        settings={settings}
        fetchingModels={modelsLoading}
        serverKeyAvailable={serverKeyAvailable}
        customKeyAvailable={customKeyAvailable}
        modelAvailability={state.modelAvailability}
        modelCapabilities={state.modelCapabilities}
        checkingModels={checkingModels}
        importError={importError}
        onClose={() => setSettingsOpen(false)}
        onSettingsChange={updateSettings}
        onFetchModels={() => fetchModels({ refresh: true }).then(() => undefined)}
        onActiveModelChange={setActiveModel}
        onCheckModel={checkModelAvailability}
        onCustomApiKeySave={saveCustomApiKey}
        onCustomApiKeyClear={clearCustomApiKey}
        onExport={exportJson}
        onImportText={importJson}
      />
    </main>
  );
}
