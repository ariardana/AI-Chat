import {
  NVIDIA_BASE_URL,
  getAbortReason,
  isAbortLike,
  jsonError,
  readProviderError,
  resolveApiKey,
  withTimeout,
} from "@/lib/server/nvidia";
import { recordModelCheckResult } from "@/lib/server/model-cache";
import { rateLimit } from "@/lib/server/rate-limit";
import { guardApiRequest, safeProviderErrorLabel, sanitizeErrorMessage } from "@/lib/server/security";

export const runtime = "nodejs";

const MODEL_CHECK_TIMEOUT_MS = 10_000;

function statusFromProvider(statusCode: number) {
  return statusCode === 401 || statusCode === 403 || statusCode === 404 ? "unavailable" : "unstable";
}

export async function POST(request: Request) {
  const guarded = guardApiRequest(request, { maxBytes: 16_384, requireJson: true });
  if (guarded) return guarded;

  const limited = rateLimit(request, "model-check", { limit: 60, windowMs: 60_000 });
  if (limited.limited) {
    return jsonError("Too many model checks. Try again shortly.", 429, {
      retryAfter: limited.retryAfter,
    });
  }

  let body: { model?: unknown; apiKey?: unknown };

  try {
    body = (await request.json()) as { model?: unknown; apiKey?: unknown };
  } catch {
    return jsonError("Invalid JSON body.");
  }

  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model) return jsonError("Model is required.");

  const credentials = resolveApiKey(request, body.apiKey);
  if (!credentials.apiKey) {
    return jsonError("NVIDIA_API_KEY is not configured. Add a server env key or set a custom key in Settings.", 401, {
      hasServerKey: credentials.hasServerKey,
    });
  }

  const timeout = withTimeout(request.signal, MODEL_CHECK_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        temperature: 0,
        max_tokens: 1,
        stream: false,
      }),
      signal: timeout.signal,
    });

    if (!upstream.ok) {
      const { status, cleanDetail } = await readProviderError(upstream);
      const providerError = cleanDetail.replace(/^ Detail: /, "") || status;
      console.warn("AI model check provider error", {
        statusCode: upstream.status,
        providerError,
        model,
      });
      await recordModelCheckResult(model, statusFromProvider(upstream.status), {
        providerError,
        statusCode: upstream.status,
      });

      return jsonError(`Model check failed for "${model}".`, upstream.status, {
        hasServerKey: credentials.hasServerKey,
        providerError: safeProviderErrorLabel(upstream.status),
      });
    }
    await recordModelCheckResult(model, "available");

    return Response.json({
      ok: true,
      status: "available",
      checkedAt: new Date().toISOString(),
      credentialSource: credentials.source,
      hasServerKey: credentials.hasServerKey,
    });
  } catch (error) {
    if (isAbortLike(error)) {
      console.warn("AI model check aborted", {
        statusCode: 504,
        timeoutReason: getAbortReason(error, timeout.signal),
        abortReason: request.signal.aborted ? getAbortReason(error, request.signal) : undefined,
        model,
      });
      await recordModelCheckResult(model, "unstable", {
        providerError: getAbortReason(error, timeout.signal),
        statusCode: 504,
      });
      return jsonError(`Model check timed out for "${model}".`, 504, {
        hasServerKey: credentials.hasServerKey,
        timeoutReason: getAbortReason(error, timeout.signal),
        abortReason: request.signal.aborted ? getAbortReason(error, request.signal) : "",
      });
    }

    console.warn("AI model check failed", {
      statusCode: 502,
      providerError: error instanceof Error ? error.message : "Unexpected provider error.",
      model,
    });
    await recordModelCheckResult(model, "unstable", {
      providerError: error instanceof Error ? error.message : "Unexpected provider error.",
      statusCode: 502,
    });
    return jsonError("Provider request failed.", 502, {
      hasServerKey: credentials.hasServerKey,
      providerError: sanitizeErrorMessage(error, "provider_error"),
    });
  } finally {
    timeout.cleanup();
  }
}
