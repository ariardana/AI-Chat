import { jsonError } from "@/lib/server/nvidia";

interface RequestGuardOptions {
  maxBytes?: number;
  requireJson?: boolean;
}

function requestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const referer = request.headers.get("referer");
  if (!referer) return "";
  try {
    return new URL(referer).origin;
  } catch {
    return "";
  }
}

function expectedOrigin(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : "";
}

export function guardApiRequest(request: Request, options: RequestGuardOptions = {}) {
  const expected = expectedOrigin(request);
  const actual = requestOrigin(request);
  if (actual && expected && actual !== expected) {
    return jsonError("Cross-origin requests are not allowed.", 403);
  }

  if (options.requireJson) {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonError("Content-Type must be application/json.", 415);
    }
  }

  if (options.maxBytes) {
    const rawLength = request.headers.get("content-length");
    const length = rawLength ? Number(rawLength) : 0;
    if (Number.isFinite(length) && length > options.maxBytes) {
      return jsonError("Request body is too large.", 413);
    }
  }

  return null;
}

export function safeProviderErrorLabel(statusCode: number) {
  if (statusCode === 401 || statusCode === 403) return "provider_auth_error";
  if (statusCode === 404) return "provider_model_not_found";
  if (statusCode === 429) return "provider_rate_limited";
  if (statusCode >= 500) return "provider_unavailable";
  return "provider_error";
}

export function sanitizeErrorMessage(error: unknown, fallback = "Request failed.") {
  const message = error instanceof Error ? error.message : fallback;
  return message
    .replace(/nvapi-[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 300);
}
