import { json, fail, ensureDb, currentUser, publicUser } from "../../lib/auth.js";

export async function onRequestGet({ request, env }) {
  const dbError = ensureDb(env);
  if (dbError) return dbError;

  const row = await currentUser(request, env);
  if (!row) return fail(401, "ログインしていません。");
  return json({ user: publicUser(row) });
}
