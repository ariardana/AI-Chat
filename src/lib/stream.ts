export type DeltaHandler = (delta: string) => void;

export interface StreamReadResult {
  finishReason: "done" | "closed" | "aborted";
  bytesRead: number;
  eventCount: number;
  deltaCount: number;
  providerFinishReason?: string;
}

const STREAM_IDLE_TIMEOUT_MS = 15_000;

function streamIdleTimeout() {
  return new DOMException(`Stream produced no data for ${Math.round(STREAM_IDLE_TIMEOUT_MS / 1000)} seconds.`, "TimeoutError");
}

function parseStreamEvent(event: string) {
  const data = event
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();

  if (!data) return null;
  if (data === "[DONE]") return { done: true as const };

  const parsed = JSON.parse(data) as {
    choices?: Array<{
      delta?: { content?: string };
      message?: { content?: string };
      text?: string;
      finish_reason?: string | null;
    }>;
    error?: { message?: string };
  };

  if (parsed.error?.message) {
    throw new Error(parsed.error.message);
  }

  const choice = parsed.choices?.[0];
  return {
    done: false as const,
    delta: choice?.delta?.content ?? choice?.message?.content ?? choice?.text ?? "",
    providerFinishReason: choice?.finish_reason ?? undefined,
  };
}

export async function readOpenAIStream(
  response: Response,
  onDelta: DeltaHandler,
  signal?: AbortSignal,
): Promise<StreamReadResult> {
  if (!response.body) {
    throw new Error("Response body is empty.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bytesRead = 0;
  let eventCount = 0;
  let deltaCount = 0;
  let providerFinishReason = "";
  const cancelReader = () => {
    void reader.cancel(signal?.reason).catch(() => undefined);
  };

  if (signal?.aborted) {
    await reader.cancel(signal.reason);
    return { finishReason: "aborted", bytesRead, eventCount, deltaCount };
  }

  signal?.addEventListener("abort", cancelReader, { once: true });

  const processEvent = (event: string) => {
    const parsed = parseStreamEvent(event);
    if (!parsed) return false;
    eventCount += 1;
    if (parsed.done) return true;
    if (parsed.providerFinishReason) providerFinishReason = parsed.providerFinishReason;
    if (parsed.delta && !signal?.aborted) {
      deltaCount += 1;
      onDelta(parsed.delta);
    }
    return false;
  };

  const processBufferedEvents = (flush = false) => {
    while (true) {
      const match = /\r?\n\r?\n/.exec(buffer);
      if (!match) break;
      const event = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      if (processEvent(event)) {
        return true;
      }
    }

    if (flush && buffer.trim()) {
      const event = buffer;
      buffer = "";
      if (processEvent(event)) {
        return true;
      }
    }

    return false;
  };

  try {
    while (true) {
      if (signal?.aborted) return { finishReason: "aborted", bytesRead, eventCount, deltaCount, providerFinishReason };

      let chunk: ReadableStreamReadResult<Uint8Array>;
      let idleTimeout: ReturnType<typeof setTimeout> | null = null;
      try {
        chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            idleTimeout = setTimeout(() => reject(streamIdleTimeout()), STREAM_IDLE_TIMEOUT_MS);
          }),
        ]);
      } catch (error) {
        if (signal?.aborted) return { finishReason: "aborted", bytesRead, eventCount, deltaCount, providerFinishReason };
        throw error;
      } finally {
        if (idleTimeout) clearTimeout(idleTimeout);
      }

      const { value, done } = chunk;
      if (done) {
        buffer += decoder.decode();
        const sawDone = processBufferedEvents(true);
        return {
          finishReason: sawDone ? "done" : "closed",
          bytesRead,
          eventCount,
          deltaCount,
          providerFinishReason,
        };
      }
      if (signal?.aborted) return { finishReason: "aborted", bytesRead, eventCount, deltaCount, providerFinishReason };

      bytesRead += value.byteLength;
      buffer += decoder.decode(value, { stream: true });
      if (processBufferedEvents(false)) {
        return { finishReason: "done", bytesRead, eventCount, deltaCount, providerFinishReason };
      }
    }
  } finally {
    signal?.removeEventListener("abort", cancelReader);
  }
}
