import type { ChatApiMessage, ChatRequestBody } from "@/lib/types";
import {
  CHAT_STREAM_TIMEOUT_MS,
  NVIDIA_BASE_URL,
  getAbortReason,
  isAbortLike,
  jsonError,
  readProviderError,
  resolveApiKey,
  withTimeout,
} from "@/lib/server/nvidia";
import { acquireConcurrent, rateLimit } from "@/lib/server/rate-limit";
import { guardApiRequest, safeProviderErrorLabel, sanitizeErrorMessage } from "@/lib/server/security";
import { clamp } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 100;

async function providerError(upstream: Response, model: string) {
  const { status, cleanDetail } = await readProviderError(upstream);

  return {
    userMessage: `Provider returned ${status} for model "${model}". This usually means the model is unavailable for this endpoint/account, overloaded, or temporarily failing. Try Fetch Models in Settings, select a model returned by the provider, then retry.`,
    providerError: cleanDetail.replace(/^ Detail: /, ""),
    status,
  };
}

function isMessage(value: unknown): value is ChatApiMessage {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.role === "system" || record.role === "user" || record.role === "assistant") &&
    typeof record.content === "string"
  );
}

export async function POST(request: Request) {
  const guarded = guardApiRequest(request, { maxBytes: 1_000_000, requireJson: true });
  if (guarded) return guarded;

  const limited = rateLimit(request, "chat", { limit: 20, windowMs: 60_000 });
  if (limited.limited) {
    return jsonError("Too many chat requests. Try again shortly.", 429, {
      retryAfter: limited.retryAfter,
    });
  }

  let body: Partial<ChatRequestBody>;

  try {
    body = (await request.json()) as Partial<ChatRequestBody>;
  } catch {
    return jsonError("Invalid JSON body.");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return jsonError("Request body must be an object.");
  }

  const credentials = resolveApiKey(request, body.apiKey);
  const model = body.model?.trim();

  if (!credentials.apiKey) {
    return jsonError("NVIDIA_API_KEY is not configured. Add a server env key or set a custom key in Settings.", 401, {
      hasServerKey: credentials.hasServerKey,
    });
  }
  if (!model) return jsonError("Model is required.");
  if (!Array.isArray(body.messages) || !body.messages.every(isMessage)) {
    return jsonError("Messages must be an array of OpenAI-compatible messages.");
  }
  if (body.messages.length > 100) {
    return jsonError("Messages must contain 100 items or fewer.");
  }
  if (body.messages.reduce((total, message) => total + message.content.length, 0) > 200_000) {
    return jsonError("Total message content is too large.", 413);
  }
  if (body.messages.some((message) => message.content.length > 50_000)) {
    return jsonError("Each message must be 50,000 characters or fewer.");
  }
  if (typeof body.systemPrompt === "string" && body.systemPrompt.length > 20_000) {
    return jsonError("System prompt must be 20,000 characters or fewer.");
  }

  const messages: ChatApiMessage[] = body.systemPrompt?.trim()
    ? [{ role: "system", content: body.systemPrompt.trim() }, ...body.messages]
    : body.messages;
  const timeout = withTimeout(request.signal, CHAT_STREAM_TIMEOUT_MS);
  const concurrent = acquireConcurrent(request, "chat-stream", 3);
  if (!concurrent.allowed) {
    timeout.cleanup();
    return jsonError("Too many active chat streams. Stop one request and retry.", 429);
  }

  try {
    const upstream = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: clamp(Number(body.temperature), 0, 2),
        max_tokens: clamp(Math.max(1, Math.round(Number(body.maxTokens) || 1)), 1, 8192),
        stream: true,
      }),
      signal: timeout.signal,
    });

    if (!upstream.ok) {
      timeout.cleanup();
      concurrent.release();
      const errorDetail = await providerError(upstream, model);
      console.warn("AI chat provider error", {
        statusCode: upstream.status,
        providerError: errorDetail.providerError || errorDetail.status,
        model,
      });
      return jsonError(errorDetail.userMessage, upstream.status, {
        hasServerKey: credentials.hasServerKey,
        providerError: safeProviderErrorLabel(upstream.status),
      });
    }

    if (!upstream.body) {
      timeout.cleanup();
      concurrent.release();
      return jsonError("Provider returned an empty stream.", 502);
    }

    const reader = upstream.body.getReader();
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    let streamDone = false;
    const cleanupStream = () => {
      if (streamDone) return;
      streamDone = true;
      timeout.signal.removeEventListener("abort", abortUpstream);
      timeout.cleanup();
      concurrent.release();
    };
    const abortUpstream = () => {
      const reason = timeout.signal.reason ?? new DOMException("Request aborted.", "AbortError");
      void reader.cancel(reason).catch(() => undefined);
      if (streamController) {
        try {
          streamController.error(reason);
        } catch {
          // The client may already have disconnected.
        }
      }
      cleanupStream();
    };
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        if (timeout.signal.aborted) {
          abortUpstream();
          return;
        }
        timeout.signal.addEventListener("abort", abortUpstream, { once: true });
      },
      async pull(controller) {
        if (timeout.signal.aborted) {
          abortUpstream();
          return;
        }

        try {
          const { done, value } = await reader.read();
          if (done) {
            cleanupStream();
            controller.close();
            return;
          }
          if (timeout.signal.aborted) {
            abortUpstream();
            return;
          }
          controller.enqueue(value);
        } catch (error) {
          cleanupStream();
          if (timeout.signal.aborted || isAbortLike(error)) {
            controller.error(timeout.signal.reason ?? error);
            return;
          }
          controller.error(error);
        }
      },
      async cancel(reason) {
        cleanupStream();
        await reader.cancel(reason);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    timeout.cleanup();
    concurrent.release();
    if (isAbortLike(error)) {
      console.warn("AI chat request aborted", {
        statusCode: 504,
        timeoutReason: getAbortReason(error, timeout.signal),
        abortReason: request.signal.aborted ? getAbortReason(error, request.signal) : undefined,
        model,
      });
      return jsonError("NVIDIA chat request timed out or was aborted.", 504, {
        hasServerKey: credentials.hasServerKey,
        timeoutReason: getAbortReason(error, timeout.signal),
        abortReason: request.signal.aborted ? getAbortReason(error, request.signal) : "",
      });
    }

    console.warn("AI chat request failed", {
      statusCode: 502,
      providerError: sanitizeErrorMessage(error, "Unexpected provider error."),
      model,
    });
    concurrent.release();
    return jsonError("Provider request failed.", 502, {
      hasServerKey: credentials.hasServerKey,
      providerError: "provider_error",
    });
  }
}
