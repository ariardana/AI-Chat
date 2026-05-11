export type DeltaHandler = (delta: string) => void;

export async function readOpenAIStream(
  response: Response,
  onDelta: DeltaHandler,
  signal?: AbortSignal,
) {
  if (!response.body) {
    throw new Error("Response body is empty.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const cancelReader = () => {
    void reader.cancel(signal?.reason).catch(() => undefined);
  };

  if (signal?.aborted) {
    await reader.cancel(signal.reason);
    return;
  }

  signal?.addEventListener("abort", cancelReader, { once: true });

  try {
    while (true) {
      if (signal?.aborted) return;

      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (signal?.aborted) return;
        throw error;
      }

      const { value, done } = chunk;
      if (done) break;
      if (signal?.aborted) return;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (signal?.aborted) return;

        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          if (payload === "[DONE]") return;
          continue;
        }

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string }; text?: string }>;
            error?: { message?: string };
          };

          if (parsed.error?.message) {
            throw new Error(parsed.error.message);
          }

          const delta = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.text ?? "";
          if (delta && !signal?.aborted) onDelta(delta);
        } catch (error) {
          if (error instanceof SyntaxError) continue;
          throw error;
        }
      }
    }
  } finally {
    signal?.removeEventListener("abort", cancelReader);
  }
}
