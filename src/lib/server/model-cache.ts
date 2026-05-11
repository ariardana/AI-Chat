import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_MODELS } from "@/lib/defaults";
import { getModelCapabilities, getModelCategory, getModelProvider } from "@/lib/model-info";
import type { ModelAvailability, ModelAvailabilityStatus, ModelCapabilities } from "@/lib/types";

export type ModelCacheSource = "manual" | "detected" | "api";

export interface CachedModelRecord {
  provider: string;
  modelId: string;
  status: ModelAvailabilityStatus;
  capabilities: ModelCapabilities;
  lastCheckedAt: number;
  lastSuccessAt: number;
  errorCount: number;
  source: ModelCacheSource;
  providerError?: string;
  statusCode?: number;
}

interface ModelCacheFile {
  version: 1;
  updatedAt: number;
  models: Record<string, CachedModelRecord>;
}

export const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MODEL_CACHE_PATH = join(process.cwd(), "data", "model-cache.json");
const MODEL_CACHE_KEY = "webui:nvidia:model-cache:v1";
const REDIS_CACHE_TIMEOUT_MS = 4_000;
let memoryCache: ModelCacheFile | null = null;

function now() {
  return Date.now();
}

function emptyCache(): ModelCacheFile {
  return {
    version: 1,
    updatedAt: 0,
    models: Object.fromEntries(DEFAULT_MODELS.map((modelId) => [modelId, createRecord(modelId, "manual")])),
  };
}

function createRecord(modelId: string, source: ModelCacheSource): CachedModelRecord {
  return {
    provider: "nvidia",
    modelId,
    status: "unknown",
    capabilities: getModelCapabilities(modelId),
    lastCheckedAt: 0,
    lastSuccessAt: 0,
    errorCount: 0,
    source,
  };
}

function normalizeCache(value: unknown): ModelCacheFile {
  const record = typeof value === "object" && value !== null ? value as Partial<ModelCacheFile> : {};
  const models = typeof record.models === "object" && record.models !== null ? record.models : {};
  const normalized = emptyCache();

  for (const item of Object.values(models)) {
    if (typeof item !== "object" || item === null) continue;
    const source = item as Partial<CachedModelRecord>;
    const modelId = typeof source.modelId === "string" ? source.modelId : "";
    if (!modelId) continue;
    normalized.models[modelId] = {
      ...createRecord(modelId, source.source === "detected" || source.source === "api" ? source.source : "manual"),
      status:
        source.status === "available" ||
        source.status === "unstable" ||
        source.status === "unavailable" ||
        source.status === "unknown"
          ? source.status
          : "unknown",
      capabilities: {
        ...getModelCapabilities(modelId),
        ...(typeof source.capabilities === "object" && source.capabilities !== null ? source.capabilities : {}),
      },
      lastCheckedAt: typeof source.lastCheckedAt === "number" ? source.lastCheckedAt : 0,
      lastSuccessAt: typeof source.lastSuccessAt === "number" ? source.lastSuccessAt : 0,
      errorCount: typeof source.errorCount === "number" ? source.errorCount : 0,
      providerError: typeof source.providerError === "string" ? source.providerError : undefined,
      statusCode: typeof source.statusCode === "number" ? source.statusCode : undefined,
    };
  }

  normalized.updatedAt = typeof record.updatedAt === "number" ? record.updatedAt : 0;
  return normalized;
}

function hasUpstashRedis() {
  return Boolean(redisEnv().url && redisEnv().token);
}

function canUseLocalFileCache() {
  return process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1";
}

function readMemoryCache() {
  memoryCache ??= emptyCache();
  return normalizeCache(memoryCache);
}

function writeMemoryCache(cache: ModelCacheFile) {
  memoryCache = normalizeCache(cache);
}

function redisEnv() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
  };
}

async function redisCommand(command: unknown[]) {
  const { url, token } = redisEnv();
  if (!url || !token) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("Redis cache request timed out.", "TimeoutError")), REDIS_CACHE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Redis cache command failed with ${response.status}.`);
    }

    return (await response.json()) as { result?: unknown; error?: string };
  } finally {
    clearTimeout(timeout);
  }
}

async function readRedisCache() {
  const payload = await redisCommand(["GET", MODEL_CACHE_KEY]);
  const raw = payload?.result;
  if (typeof raw !== "string") return emptyCache();
  return normalizeCache(JSON.parse(raw) as unknown);
}

async function writeRedisCache(cache: ModelCacheFile) {
  await redisCommand(["SET", MODEL_CACHE_KEY, JSON.stringify(cache)]);
}

export async function readModelCache() {
  if (hasUpstashRedis()) {
    try {
      return await readRedisCache();
    } catch (error) {
      console.warn("AI model cache read failed", {
        providerError: error instanceof Error ? error.message : "Redis cache read failed.",
      });
      return emptyCache();
    }
  }

  if (!canUseLocalFileCache()) return readMemoryCache();

  try {
    return normalizeCache(JSON.parse(await readFile(MODEL_CACHE_PATH, "utf8")) as unknown);
  } catch {
    return emptyCache();
  }
}

export async function writeModelCache(cache: ModelCacheFile) {
  if (hasUpstashRedis()) {
    try {
      await writeRedisCache(cache);
    } catch (error) {
      console.warn("AI model cache write failed", {
        providerError: error instanceof Error ? error.message : "Redis cache write failed.",
      });
    }
    return;
  }

  if (!canUseLocalFileCache()) {
    writeMemoryCache(cache);
    console.warn("AI model cache is memory-only because no Redis/KV env is configured for this production runtime.");
    return;
  }

  await mkdir(dirname(MODEL_CACHE_PATH), { recursive: true });
  const temporaryPath = `${MODEL_CACHE_PATH}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  await rename(temporaryPath, MODEL_CACHE_PATH);
}

export function isModelCacheFresh(cache: ModelCacheFile) {
  return cache.updatedAt > 0 && now() - cache.updatedAt < MODEL_CACHE_TTL_MS;
}

export function modelCachePayload(cache: ModelCacheFile) {
  const models = Object.keys(cache.models).sort((a, b) => a.localeCompare(b));
  const items = models.map((modelId) => {
    const item = cache.models[modelId];
    return {
      id: modelId,
      provider: item.provider || getModelProvider(modelId),
      type: getModelCategory(modelId),
      capabilities: item.capabilities,
      status: item.status,
      lastCheckedAt: item.lastCheckedAt ? new Date(item.lastCheckedAt).toISOString() : null,
    };
  });
  const modelAvailability = models.reduce<Record<string, ModelAvailability>>((result, modelId) => {
    const item = cache.models[modelId];
    result[modelId] = {
      status: item.status,
      checkedAt: item.lastCheckedAt ? new Date(item.lastCheckedAt).toISOString() : undefined,
      statusCode: item.statusCode,
      providerError: item.providerError,
    };
    return result;
  }, {});
  const modelCapabilities = models.reduce<Record<string, ModelCapabilities>>((result, modelId) => {
    result[modelId] = cache.models[modelId].capabilities;
    return result;
  }, {});

  return {
    items,
    models,
    modelAvailability,
    modelCapabilities,
    cacheUpdatedAt: cache.updatedAt,
    cacheFresh: isModelCacheFresh(cache),
  };
}

export async function upsertCachedModels(modelIds: string[], source: ModelCacheSource = "api") {
  const cache = await readModelCache();
  for (const modelId of modelIds) {
    const current = cache.models[modelId] ?? createRecord(modelId, source);
    cache.models[modelId] = {
      ...current,
      capabilities: getModelCapabilities(modelId, current.capabilities),
      source: current.source === "manual" ? source : current.source,
    };
  }
  cache.updatedAt = now();
  await writeModelCache(cache);
  return cache;
}

export async function updateCachedModel(modelId: string, patch: Partial<CachedModelRecord>) {
  const cache = await readModelCache();
  const current = cache.models[modelId] ?? createRecord(modelId, patch.source ?? "api");
  cache.models[modelId] = {
    ...current,
    ...patch,
    modelId,
    provider: patch.provider ?? current.provider,
    capabilities: getModelCapabilities(modelId, {
      ...current.capabilities,
      ...patch.capabilities,
    }),
  };
  await writeModelCache(cache);
  return cache.models[modelId];
}

export async function recordModelCheckResult(
  modelId: string,
  status: ModelAvailabilityStatus,
  options: { providerError?: string; statusCode?: number } = {},
) {
  const cache = await readModelCache();
  const current = cache.models[modelId] ?? createRecord(modelId, "api");
  const timestamp = now();
  cache.models[modelId] = {
    ...current,
    status,
    lastCheckedAt: timestamp,
    lastSuccessAt: status === "available" ? timestamp : current.lastSuccessAt,
    errorCount: status === "available" ? 0 : current.errorCount + 1,
    providerError: options.providerError,
    statusCode: options.statusCode,
    capabilities: getModelCapabilities(modelId, current.capabilities),
  };
  await writeModelCache(cache);
  return cache.models[modelId];
}
