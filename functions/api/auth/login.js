import {
  json,
  fail,
  sameOrigin,
  ensureDb,
  normalizeEmail,
  verifyPassword,
  createSession,
  sessionSetCookie,
  publicUser,
} from "../../lib/auth.js";
import { clientKey, rateLimit, tooMany } from "../../lib/ratelimit.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail(403, "不正なリクエストです。");
  const dbError = ensureDb(env);
  if (dbError) return dbError;

  const ipLimit = await rateLimit(env, `login-ip:${clientKey(request)}`, 20, 15 * 60 * 1000);
  if (!ipLimit.allowed) return tooMany(ipLimit.retryAfterMs);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return fail(400, "入力内容を確認してください。");
  }

  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!email || !password) return fail(400, "メールアドレスとパスワードを入力してください。");

  const emailLimit = await rateLimit(env, `login-email:${email}`, 10, 15 * 60 * 1000);
  if (!emailLimit.allowed) return tooMany(emailLimit.retryAfterMs);

  const row = await env.DB.prepare(
    "SELECT id, email, name, password_hash, password_salt, password_iterations, created_at FROM users WHERE email = ?",
  )
    .bind(email)
    .first();

  if (!row) return fail(401, "メールアドレスまたはパスワードが違います。");

  const ok = await verifyPassword(
    password,
    row.password_salt,
    row.password_hash,
    row.password_iterations,
  );
  if (!ok) return fail(401, "メールアドレスまたはパスワードが違います。");

  const token = await createSession(env, row.id);
  return json({ user: publicUser(row) }, 200, { "set-cookie": sessionSetCookie(token) });
}
