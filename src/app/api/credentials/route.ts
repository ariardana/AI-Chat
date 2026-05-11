import {
  CUSTOM_API_KEY_COOKIE,
  getCustomApiKey,
  getServerApiKey,
  jsonError,
  sealApiKey,
} from "@/lib/server/nvidia";
import { decryptCredential } from "@/lib/server/credential-crypto";
import { rateLimit } from "@/lib/server/rate-limit";
import { guardApiRequest } from "@/lib/server/security";

export const runtime = "nodejs";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function cookieValue(value: string, maxAge: number) {
  const parts = [
    `${CUSTOM_API_KEY_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function status(request: Request) {
  return {
    hasServerKey: Boolean(getServerApiKey()),
    hasCustomKey: Boolean(getCustomApiKey(request)),
  };
}

export async function GET(request: Request) {
  return Response.json(status(request));
}

export async function POST(request: Request) {
  const guarded = guardApiRequest(request, { maxBytes: 16_384, requireJson: true });
  if (guarded) return guarded;

  const limited = rateLimit(request, "credentials", { limit: 10, windowMs: 60_000 });
  if (limited.limited) {
    return jsonError("Too many credential updates. Try again shortly.", 429, {
      retryAfter: limited.retryAfter,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return jsonError("Request body must be an object.");
  }

  const encryptedApiKey = (body as { encryptedApiKey?: unknown }).encryptedApiKey;
  if (typeof encryptedApiKey !== "string" || !encryptedApiKey.trim()) {
    return jsonError("API key is required.");
  }
  if (encryptedApiKey.length > 2048) {
    return jsonError("Encrypted API key is too long.");
  }

  const apiKey = decryptCredential(encryptedApiKey);
  if (!apiKey) {
    return jsonError("API key could not be decrypted.");
  }
  if (apiKey.length > 4096) {
    return jsonError("API key is too long.");
  }

  return Response.json(
    { hasServerKey: Boolean(getServerApiKey()), hasCustomKey: true },
    {
      headers: {
        "Set-Cookie": cookieValue(sealApiKey(apiKey.trim()), COOKIE_MAX_AGE),
      },
    },
  );
}

export async function DELETE(request: Request) {
  const guarded = guardApiRequest(request);
  if (guarded) return guarded;

  return Response.json(
    { hasServerKey: Boolean(getServerApiKey()), hasCustomKey: false },
    {
      headers: {
        "Set-Cookie": cookieValue("", 0),
      },
    },
  );
}
