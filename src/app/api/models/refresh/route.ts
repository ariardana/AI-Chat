import type { ModelsRequestBody } from "@/lib/types";
import {
  MODEL_FETCH_TIMEOUT_MS,
  NVIDIA_BASE_URL,
  getAbortReason,
  isAbortLike,
  jsonError,
  readProviderError,
  resolveApiKey,
  withTimeout,
} from "@/lib/server/nvidia";
import { modelCachePayload, readModelCache, upsertCachedModels } from "@/lib/server/model-cache";
import { rateLimit } from "@/lib/server/rate-limit";
import { guardApiRequest, safeProviderErrorLabel, sanitizeErrorMessage } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

async function providerError(upstream: Response) {
  const { status, cleanDetail } = await readProviderError(upstream);
  return {
    userMessage: `Provider returned ${status} while refreshing models.${cleanDetail}`,
    providerError: cleanDetail.replace(/^ Detail: /, "") || status,
  };
}

export async function POST(request: Request) {
  const guarded = guardApiRequest(request, { maxBytes: 16_384, requireJson: true });
  if (guarded) return guarded;

  const limited = rateLimit(request, "models-refresh", { limit: 10, windowMs: 60_000 });
  if (limited.limited) {
    return jsonError("Too many model refresh requests. Try again shortly.", 429, {
      retryAfter: limited.retryAfter,
    });
  }

  let body: Partial<ModelsRequestBody>;
  try {
    body = (await request.json()) as Partial<ModelsRequestBody>;
  } catch {
    return jsonError("Invalid JSON body.");
  }

  const credentials = resolveApiKey(request, body.apiKey);
  const fallbackCache = await readModelCache();
  if (!credentials.apiKey) {
    return Response.json({
      ...modelCachePayload(fallbackCache),
      providerName: "NVIDIA",
      baseUrl: NVIDIA_BASE_URL,
      credentialSource: "cache",
      hasServerKey: credentials.hasServerKey,
      error: "NVIDIA_API_KEY is not configured. Returning cached models.",
    }, { status: Object.keys(fallbackCache.models).length ? 200 : 401 });
  }

  const timeout = withTimeout(request.signal, MODEL_FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${NVIDIA_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: timeout.signal,
    });

    if (!upstream.ok) {
      const errorDetail = await providerError(upstream);
      console.warn("AI model refresh provider error", {
        statusCode: upstream.status,
        providerError: errorDetail.providerError,
      });
      return Response.json({
        ...modelCachePayload(fallbackCache),
        providerName: "NVIDIA",
        baseUrl: NVIDIA_BASE_URL,
        credentialSource: "cache",
        hasServerKey: credentials.hasServerKey,
        warning: "Gagal mengambil model terbaru, memakai cache.",
        error: errorDetail.userMessage,
        providerError: safeProviderErrorLabel(upstream.status),
      }, { status: Object.keys(fallbackCache.models).length ? 200 : upstream.status });
    }

    const payload = (await upstream.json()) as {
      data?: Array<{ id?: unknown; name?: unknown }>;
      models?: Array<{ id?: unknown; name?: unknown } | string>;
    };
    const source = Array.isArray(payload.data) ? payload.data : (payload.models ?? []);
    const models = source
      .map((item) => {
        if (typeof item === "string") return item;
        return typeof item.id === "string" ? item.id : typeof item.name === "string" ? item.name : "";
      })
      .filter((model, index, all) => model && all.indexOf(model) === index)
      .sort((a, b) => a.localeCompare(b));
    const cache = await upsertCachedModels(models, "api");

    return Response.json({
      ...modelCachePayload(cache),
      providerName: "NVIDIA",
      baseUrl: NVIDIA_BASE_URL,
      credentialSource: credentials.source,
      hasServerKey: credentials.hasServerKey,
    });
  } catch (error) {
    if (isAbortLike(error)) {
      console.warn("AI model refresh aborted", {
        statusCode: 504,
        timeoutReason: getAbortReason(error, timeout.signal),
        abortReason: request.signal.aborted ? getAbortReason(error, request.signal) : undefined,
      });
      return Response.json({
        ...modelCachePayload(fallbackCache),
        providerName: "NVIDIA",
        baseUrl: NVIDIA_BASE_URL,
        credentialSource: "cache",
        hasServerKey: credentials.hasServerKey,
        warning: "Gagal mengambil model terbaru, memakai cache.",
        error: "NVIDIA model refresh timed out or was aborted.",
        timeoutReason: getAbortReason(error, timeout.signal),
        abortReason: request.signal.aborted ? getAbortReason(error, request.signal) : "",
      }, { status: Object.keys(fallbackCache.models).length ? 200 : 504 });
    }

    return Response.json({
      ...modelCachePayload(fallbackCache),
      providerName: "NVIDIA",
      baseUrl: NVIDIA_BASE_URL,
      credentialSource: "cache",
      hasServerKey: credentials.hasServerKey,
      warning: "Gagal mengambil model terbaru, memakai cache.",
      error: "Provider request failed.",
      providerError: sanitizeErrorMessage(error, "provider_error"),
    }, { status: Object.keys(fallbackCache.models).length ? 200 : 502 });
  } finally {
    timeout.cleanup();
  }
}
