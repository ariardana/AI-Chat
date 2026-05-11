import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { extractHtmlTitle, stripHtml } from "@/lib/utils";

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const MODEL_FETCH_TIMEOUT_MS = 20_000;
export const CHAT_STREAM_TIMEOUT_MS = 45_000;
export const MINIMAX_CHAT_STREAM_TIMEOUT_MS = 30_000;
export const CUSTOM_API_KEY_COOKIE = "nvidia_api_key";

const fallbackCookieSecret = randomBytes(32).toString("base64url");

function cookieSecretKey() {
  return createHash("sha256")
    .update(process.env.NVIDIA_COOKIE_SECRET || fallbackCookieSecret)
    .digest();
}

export function getServerApiKey() {
  const value = process.env.NVIDIA_API_KEY?.trim() ?? "";
  return value === "ISI_API_KEY_DISINI" || value === "your_nvidia_api_key_here" ? "" : value;
}

function parseCookie(header: string | null, name: string) {
  if (!header) return "";
  const prefix = `${name}=`;
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!match) return "";

  try {
    return decodeURIComponent(match.slice(prefix.length)).trim();
  } catch {
    return "";
  }
}

export function getCustomApiKey(request: Request) {
  const sealed = parseCookie(request.headers.get("cookie"), CUSTOM_API_KEY_COOKIE);
  return sealed ? unsealApiKey(sealed) : "";
}

export function sealApiKey(apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cookieSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function unsealApiKey(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) return "";

  try {
    const decipher = createDecipheriv("aes-256-gcm", cookieSecretKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8").trim();
  } catch {
    return "";
  }
}

export function resolveApiKey(request: Request, customApiKey?: unknown) {
  const custom = getCustomApiKey(request) || (typeof customApiKey === "string" ? customApiKey.trim() : "");
  if (custom) {
    return {
      apiKey: custom,
      source: "custom" as const,
      hasServerKey: Boolean(getServerApiKey()),
    };
  }

  const server = getServerApiKey();
  return {
    apiKey: server,
    source: "server" as const,
    hasServerKey: Boolean(server),
  };
}

export function jsonError(
  message: string,
  status = 400,
  extra?: Record<string, string | boolean | number>,
) {
  return Response.json(
    { error: message, ...extra },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export function withTimeout(parentSignal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("Request timed out.", "TimeoutError")), timeoutMs);

  const abortFromParent = () => {
    controller.abort(parentSignal.reason ?? new DOMException("Request aborted.", "AbortError"));
  };

  if (parentSignal.aborted) {
    abortFromParent();
  } else {
    parentSignal.addEventListener("abort", abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      parentSignal.removeEventListener("abort", abortFromParent);
    },
  };
}

function extractJsonError(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const error = record.error;

  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }

  if (typeof record.message === "string") return record.message;
  return null;
}

export async function readProviderError(upstream: Response) {
  const contentType = upstream.headers.get("content-type") ?? "";
  const raw = await upstream.text();
  let detail = "";

  if (contentType.includes("application/json")) {
    try {
      detail = extractJsonError(JSON.parse(raw)) ?? "";
    } catch {
      detail = "";
    }
  }

  if (!detail) {
    detail = raw.includes("<") && raw.includes(">")
      ? extractHtmlTitle(raw)
      : stripHtml(raw);
  }

  const status = `${upstream.status} ${upstream.statusText || "Provider error"}`.trim();
  const redactedDetail = detail
    .replace(/nvapi-[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
  const cleanDetail = redactedDetail && redactedDetail !== status ? ` Detail: ${redactedDetail.slice(0, 500)}` : "";

  return { status, cleanDetail };
}

export function isAbortLike(error: unknown) {
  return error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
}

export function getAbortReason(error: unknown, signal?: AbortSignal) {
  const reason = signal?.reason;
  if (reason instanceof DOMException) return `${reason.name}: ${reason.message}`;
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  if (typeof reason === "string") return reason;
  if (error instanceof DOMException) return `${error.name}: ${error.message}`;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return "unknown";
}
