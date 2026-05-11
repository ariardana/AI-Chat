interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

const buckets = new Map<string, { count: number; resetAt: number }>();
const concurrentBuckets = new Map<string, number>();

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwarded || realIp || "local";
}

export function rateLimit(request: Request, route: string, options: RateLimitOptions) {
  const now = Date.now();
  const key = `${route}:${clientKey(request)}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { limited: false, retryAfter: 0 };
  }

  current.count += 1;
  if (current.count <= options.limit) {
    return { limited: false, retryAfter: 0 };
  }

  return {
    limited: true,
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export function acquireConcurrent(request: Request, route: string, limit: number) {
  const key = `${route}:${clientKey(request)}`;
  const current = concurrentBuckets.get(key) ?? 0;
  if (current >= limit) {
    return {
      allowed: false,
      release: () => undefined,
    };
  }

  concurrentBuckets.set(key, current + 1);
  let released = false;
  return {
    allowed: true,
    release: () => {
      if (released) return;
      released = true;
      const next = Math.max(0, (concurrentBuckets.get(key) ?? 1) - 1);
      if (next === 0) concurrentBuckets.delete(key);
      else concurrentBuckets.set(key, next);
    },
  };
}
