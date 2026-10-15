import { fail, ensureDb, currentUser } from "../../../lib/auth.js";
import { resultsCsv } from "../../../../core.js";

export async function onRequestGet({ request, env, params }) {
  const dbError = ensureDb(env);
  if (dbError) return dbError;
  const user = await currentUser(request, env);
  if (!user) return fail(401, "ログインしていません。");

  const job = await env.DB.prepare(
    "SELECT id, title FROM jobs WHERE id = ? AND user_id = ?",
  )
    .bind(params.id, user.id)
    .first();
  if (!job) return fail(404, "対象の履歴が見つかりません。");

  const { results } = await env.DB.prepare(
    "SELECT row_index, source_id, text, category, candidate, score, margin, reason, nearest FROM job_results WHERE job_id = ? ORDER BY row_index ASC",
  )
    .bind(job.id)
    .all();

  const rows = (results || []).map((r) => ({
    id: r.source_id ?? r.row_index + 1,
    text: r.text,
    category: r.category,
    candidate: r.candidate,
    score: r.score,
    margin: r.margin,
    reason: r.reason,
    nearest: r.nearest,
  }));

  return new Response(resultsCsv(rows), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="nagiport-results-${job.id}.csv"`,
      "cache-control": "no-store",
    },
  });
}
