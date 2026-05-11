import type { ModelsRequestBody } from "@/lib/types";
import {
  MODEL_FETCH_TIMEOUT_MS,
  NVIDIA_BASE_URL,
  getAbortReason,
  getServerApiKey,
  isAbortLike,
  jsonError,
  readProviderError,
  resolveApiKey,
  withTimeout,
} from "@/lib/server/nvidia";
import {
  isModelCacheFresh,
  modelCachePayload,
  readModelCache,
  upsertCachedModels,
} from "@/lib/server/model-cache";
import { rateLimit } from "@/lib/server/rate-limit";
import { guardApiRequest, safeProviderErrorLabel, sanitizeErrorMessage } from "@/lib/server/security";

export const runtime = "nodejs";

async function providerError(upstream: Response) {
  const { status, cleanDetail } = await readProviderError(upstream);

  return {
    userMessage: `Provider returned ${status} while fetching models. Check the base URL/API key, or manage the model list manually.${cleanDetail}`,
    providerError: cleanDetail.replace(/^ Detail: /, ""),
    status,
  };
}

async function fetchProviderModels(request: Request, apiKey: string) {
  const timeout = withTimeout(request.signal, MODEL_FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${NVIDIA_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: timeout.signal,
    });

    if (!upstream.ok) {
      const errorDetail = await providerError(upstream);
      console.warn("AI model fetch provider error", {
        statusCode: upstream.status,
        providerError: errorDetail.providerError || errorDetail.status,
      });
      return {
        ok: false as const,
        response: jsonError(errorDetail.userMessage, upstream.status, {
          providerError: safeProviderErrorLabel(upstream.status),
        }),
      };
    }

    const payload = (await upstream.json()) as {
      data?: Array<{ id?: unknown; name?: unknown }>;
      models?: Array<{ id?: unknown; name?: unknown } | string>;
    };

    const source = Array.isArray(payload.data) ? payload.data : (payload.models ?? []);
    const models = source
      .map((item) => {
        if (typeof item === "string") return item;
        return typeof item.id === "string"
          ? item.id
          : typeof item.name === "string"
            ? item.name
            : "";
      })
      .filter((model, index, all) => model && all.indexOf(model) === index)
      .sort((a, b) => a.localeCompare(b));

    return { ok: true as const, models };
  } catch (error) {
    if (isAbortLike(error)) {
      console.warn("AI model fetch aborted", {
        statusCode: 504,
        timeoutReason: getAbortReason(error, timeout.signal),
        abortReason: request.signal.aborted ? getAbortReason(error, request.signal) : undefined,
      });
      return {
        ok: false as const,
        response: jsonError("NVIDIA model request timed out or was aborted.", 504, {
          timeoutReason: getAbortReason(error, timeout.signal),
          abortReason: request.signal.aborted ? getAbortReason(error, request.signal) : "",
        }),
      };
    }

    console.warn("AI model fetch failed", {
      statusCode: 502,
      providerError: error instanceof Error ? error.message : "Unexpected provider error.",
    });
    return {
      ok: false as const,
      response: jsonError("Provider request failed.", 502, {
        providerError: sanitizeErrorMessage(error, "provider_error"),
      }),
    };
  } finally {
    timeout.cleanup();
  }
}

export async function GET() {
  const cache = await readModelCache();
  return Response.json({
    ...modelCachePayload(cache),
    providerName: "NVIDIA",
    baseUrl: NVIDIA_BASE_URL,
    credentialSource: "cache",
    hasServerKey: Boolean(getServerApiKey()),
  });
}

export async function POST(request: Request) {
  const guarded = guardApiRequest(request, { maxBytes: 16_384, requireJson: true });
  if (guarded) return guarded;

  const limited = rateLimit(request, "models", { limit: 30, windowMs: 60_000 });
  if (limited.limited) {
    return jsonError("Too many model requests. Try again shortly.", 429, {
      retryAfter: limited.retryAfter,
    });
  }

  let body: Partial<ModelsRequestBody>;

  try {
    body = (await request.json()) as Partial<ModelsRequestBody>;
  } catch {
    return jsonError("Invalid JSON body.");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return jsonError("Request body must be an object.");
  }

  const cache = await readModelCache();
  if (isModelCacheFresh(cache)) {
    const credentials = resolveApiKey(request, body.apiKey);
    return Response.json({
      ...modelCachePayload(cache),
      providerName: "NVIDIA",
      baseUrl: NVIDIA_BASE_URL,
      credentialSource: "cache",
      hasServerKey: credentials.hasServerKey,
    });
  }

  const credentials = resolveApiKey(request, body.apiKey);
  if (!credentials.apiKey) {
    return Response.json({
      ...modelCachePayload(cache),
      providerName: "NVIDIA",
      baseUrl: NVIDIA_BASE_URL,
      credentialSource: "cache",
      hasServerKey: credentials.hasServerKey,
      error: "NVIDIA_API_KEY is not configured. Returning cached models.",
    }, { status: Object.keys(cache.models).length ? 200 : 401 });
  }

  const result = await fetchProviderModels(request, credentials.apiKey);
  if (!result.ok) return result.response;

  const nextCache = await upsertCachedModels(result.models, "api");
  return Response.json({
    ...modelCachePayload(nextCache),
    providerName: "NVIDIA",
    baseUrl: NVIDIA_BASE_URL,
    credentialSource: credentials.source,
    hasServerKey: credentials.hasServerKey,
  });
}
