import { json, fail, sameOrigin, ensureDb, currentUser } from "../../lib/auth.js";

export async function onRequestGet({ request, env, params }) {
  const dbError = ensureDb(env);
  if (dbError) return dbError;
  const user = await currentUser(request, env);
  if (!user) return fail(401, "ログインしていません。");

  const job = await env.DB.prepare(
    "SELECT id, title, total, counts_json, created_at FROM jobs WHERE id = ? AND user_id = ?",
  )
    .bind(params.id, user.id)
    .first();
  if (!job) return fail(404, "対象の履歴が見つかりません。");

  const { results } = await env.DB.prepare(
    "SELECT row_index, source_id, text, category, candidate, score, margin, reason, nearest, method FROM job_results WHERE job_id = ? ORDER BY row_index ASC",
  )
    .bind(job.id)
    .all();

  let counts = {};
  try {
    counts = JSON.parse(job.counts_json || "{}");
  } catch {}

  return json({
    job: { id: job.id, title: job.title || null, total: job.total, counts, created_at: job.created_at },
    results: results || [],
  });
}

export async function onRequestDelete({ request, env, params }) {
  if (!sameOrigin(request)) return fail(403, "不正なリクエストです。");
  const dbError = ensureDb(env);
  if (dbError) return dbError;
  const user = await currentUser(request, env);
  if (!user) return fail(401, "ログインしていません。");

  const job = await env.DB.prepare("SELECT id FROM jobs WHERE id = ? AND user_id = ?")
    .bind(params.id, user.id)
    .first();
  if (!job) return fail(404, "対象の履歴が見つかりません。");

  await env.DB.batch([
    env.DB.prepare("DELETE FROM job_results WHERE job_id = ?").bind(job.id),
    env.DB.prepare("DELETE FROM jobs WHERE id = ?").bind(job.id),
  ]);
  return json({ ok: true });
}
