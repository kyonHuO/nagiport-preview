import { json, fail, sameOrigin, ensureDb, destroySession, sessionClearCookie } from "../../lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail(403, "不正なリクエストです。");
  const dbError = ensureDb(env);
  if (dbError) return dbError;

  await destroySession(request, env);
  return json({ ok: true }, 200, { "set-cookie": sessionClearCookie() });
}
