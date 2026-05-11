import type { ModelCapabilities } from "@/lib/types";

export type ModelCategory = "chat" | "code" | "embedding" | "vision";

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  "minimaxai/minimax-m2.5": {
    thinking: true,
    fast: true,
    recommended: true,
  },
  "moonshotai/kimi-k2.6": {
    fast: true,
    longContext: true,
  },
  "qwen/qwen3-coder-480b-a35": {
    coding: true,
    thinking: true,
  },
  "qwen/qwen3-coder-480b-a35b-instruct": {
    coding: true,
    thinking: true,
  },
};

export function getModelProvider(model: string) {
  const [provider] = model.split("/");
  return provider || "custom";
}

export function getModelDisplayName(model: string) {
  const id = model.split("/").pop() || model;
  return id
    .replace(/(?:^|[-_])(a\d+b|instruct|chat|preview|latest|free)(?=$|[-_])/gi, "")
    .replace(/[-_]+/g, " ")
    .replace(/\bqwen3\b/gi, "Qwen3")
    .replace(/\bkimi\b/gi, "Kimi")
    .replace(/\bminimax\b/gi, "MiniMax")
    .replace(/\bnemotron\b/gi, "Nemotron")
    .replace(/\bgpt\b/gi, "GPT")
    .replace(/\boss\b/gi, "OSS")
    .replace(/\bvl\b/gi, "VL")
    .replace(/\b([0-9]+)b\b/gi, "$1B")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || model;
}

export function getModelCategory(model: string): ModelCategory {
  const value = model.toLowerCase();
  if (value.includes("embed")) return "embedding";
  if (value.includes("vision") || value.includes("vl") || value.includes("ocr")) return "vision";
  if (value.includes("coder") || value.includes("code") || value.includes("devstral")) return "code";
  return "chat";
}

export function getModelContextLength(model: string) {
  const value = model.toLowerCase();
  const contextMatch = value.match(/(?:^|[-_])(\d{2,4})k(?:[-_]|$)/);
  if (contextMatch?.[1]) return `${contextMatch[1]}K`;
  if (value.includes("128000") || value.includes("128k")) return "128K";
  if (value.includes("32000") || value.includes("32k")) return "32K";
  if (value.includes("16000") || value.includes("16k")) return "16K";
  return "";
}

export function getModelCapabilities(model: string, cached?: ModelCapabilities): ModelCapabilities {
  const category = getModelCategory(model);
  const context = getModelContextLength(model);
  const lower = model.toLowerCase();

  return {
    ...MODEL_CAPABILITIES[model],
    ...cached,
    coding: MODEL_CAPABILITIES[model]?.coding || cached?.coding || category === "code",
    vision: MODEL_CAPABILITIES[model]?.vision || cached?.vision || category === "vision",
    longContext:
      MODEL_CAPABILITIES[model]?.longContext ||
      cached?.longContext ||
      Boolean(context && Number.parseInt(context, 10) >= 32) ||
      lower.includes("long"),
  };
}
