// Fixed-window rate limiting backed by D1. Used to slow down auth abuse.

export function clientKey(request) {
  // CF-Connecting-IP is set by Cloudflare; local dev may not provide it.
  return request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "unknown";
}

export async function rateLimit(env, key, limit, windowMs) {
  const now = Date.now();
  // Single atomic statement so concurrent requests cannot slip past the limit.
  const row = await env.DB.prepare(
    `INSERT INTO auth_attempts (key, count, window_start) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN ? - auth_attempts.window_start > ? THEN 1 ELSE auth_attempts.count + 1 END,
       window_start = CASE WHEN ? - auth_attempts.window_start > ? THEN ? ELSE auth_attempts.window_start END
     RETURNING count, window_start`,
  )
    .bind(key, now, now, windowMs, now, windowMs, now)
    .first();

  const allowed = row.count <= limit;
  return {
    allowed,
    retryAfterMs: allowed ? 0 : Math.max(0, row.window_start + windowMs - now),
  };
}

export function tooMany(retryAfterMs) {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return new Response(
    JSON.stringify({ error: "試行回数が多すぎます。しばらく待ってから再度お試しください。" }),
    {
      status: 429,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "retry-after": String(seconds),
      },
    },
  );
}
