import {
  json,
  fail,
  sameOrigin,
  ensureDb,
  normalizeEmail,
  validateEmail,
  validatePassword,
  hashPassword,
  createSession,
  sessionSetCookie,
  publicUser,
  newId,
} from "../../lib/auth.js";
import { clientKey, rateLimit, tooMany } from "../../lib/ratelimit.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail(403, "不正なリクエストです。");
  const dbError = ensureDb(env);
  if (dbError) return dbError;

  const ipLimit = await rateLimit(env, `register-ip:${clientKey(request)}`, 10, 60 * 60 * 1000);
  if (!ipLimit.allowed) return tooMany(ipLimit.retryAfterMs);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return fail(400, "入力内容を確認してください。");
  }

  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const name = String(body.name || "").trim().slice(0, 80) || null;

  if (!validateEmail(email)) return fail(400, "メールアドレスの形式を確認してください。");
  if (!validatePassword(password))
    return fail(400, "パスワードは8文字以上で、英字と数字を含めてください。");

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();
  if (existing) return fail(409, "このメールアドレスはすでに登録されています。");

  const { salt, hash, iterations } = await hashPassword(password);
  const id = newId();
  const now = Date.now();

  try {
    await env.DB.prepare(
      "INSERT INTO users (id, email, name, password_hash, password_salt, password_iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(id, email, name, hash, salt, iterations, now)
      .run();
  } catch {
    return fail(409, "このメールアドレスはすでに登録されています。");
  }

  const token = await createSession(env, id);
  return json(
    { user: publicUser({ id, email, name, created_at: now }) },
    201,
    { "set-cookie": sessionSetCookie(token) },
  );
}
