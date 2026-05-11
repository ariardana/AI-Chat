import type { ModelCapabilities } from "@/lib/types";
import { jsonError } from "@/lib/server/nvidia";
import { updateCachedModel } from "@/lib/server/model-cache";
import { rateLimit } from "@/lib/server/rate-limit";
import { guardApiRequest } from "@/lib/server/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const guarded = guardApiRequest(request, { maxBytes: 16_384, requireJson: true });
  if (guarded) return guarded;

  const limited = rateLimit(request, "models-capabilities", { limit: 120, windowMs: 60_000 });
  if (limited.limited) {
    return jsonError("Too many capability updates. Try again shortly.", 429, {
      retryAfter: limited.retryAfter,
    });
  }

  let body: { model?: unknown; capabilities?: unknown; source?: unknown };
  try {
    body = (await request.json()) as { model?: unknown; capabilities?: unknown; source?: unknown };
  } catch {
    return jsonError("Invalid JSON body.");
  }

  const modelId = typeof body.model === "string" ? body.model.trim() : "";
  if (!modelId) return jsonError("Model is required.");

  const source = typeof body.source === "string" && body.source === "detected" ? "detected" : "manual";
  const raw = typeof body.capabilities === "object" && body.capabilities !== null
    ? body.capabilities as Record<string, unknown>
    : {};
  const capabilities: ModelCapabilities = {
    thinking: typeof raw.thinking === "boolean" ? raw.thinking : undefined,
    fast: typeof raw.fast === "boolean" ? raw.fast : undefined,
    coding: typeof raw.coding === "boolean" ? raw.coding : undefined,
    vision: typeof raw.vision === "boolean" ? raw.vision : undefined,
    longContext: typeof raw.longContext === "boolean" ? raw.longContext : undefined,
    recommended: typeof raw.recommended === "boolean" ? raw.recommended : undefined,
    detectedAt: new Date().toISOString(),
  };

  const record = await updateCachedModel(modelId, {
    capabilities,
    source,
  });

  return Response.json({
    ok: true,
    model: record.modelId,
    capabilities: record.capabilities,
  });
}
