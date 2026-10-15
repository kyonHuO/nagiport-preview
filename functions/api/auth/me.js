import { json, fail, ensureDb, currentUser, publicUser } from "../../lib/auth.js";

export async function onRequestGet({ request, env }) {
  const dbError = ensureDb(env);
  if (dbError) return dbError;

  const row = await currentUser(request, env);
  if (!row) return fail(401, "ログインしていません。");

  const period = new Date().toISOString().slice(0, 7);
  const usage = await env.DB.prepare(
    "SELECT COUNT(id) AS jobs, COALESCE(SUM(total), 0) AS rows FROM jobs WHERE user_id = ? AND strftime('%Y-%m', created_at / 1000, 'unixepoch') = ?",
  )
    .bind(row.id, period)
    .first();

  return json({
    user: publicUser(row),
    usage: { period, jobs: usage ? usage.jobs : 0, rows: usage ? usage.rows : 0 },
  });
}
