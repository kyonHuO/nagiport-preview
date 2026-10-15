import { json, fail, ensureDb } from "../../lib/auth.js";

// Admin-only usage view. Requires the ADMIN_TOKEN env var and a matching
// x-admin-token header (or Authorization: Bearer). Not linked from the site.
export async function onRequestGet({ request, env }) {
  const dbError = ensureDb(env);
  if (dbError) return dbError;

  const token = env.ADMIN_TOKEN;
  if (!token) return fail(503, "管理者機能は未設定です。");

  const header = request.headers.get("x-admin-token") || "";
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if ((header || bearer) !== token) return fail(401, "認証が必要です。");

  const period = request.headers.get("x-usage-period") || "";
  const ym = /^\d{4}-\d{2}$/.test(period) ? period : null;

  const sql = ym
    ? "SELECT u.email, COUNT(j.id) AS jobs, COALESCE(SUM(j.total),0) AS rows, MAX(j.created_at) AS last FROM users u LEFT JOIN jobs j ON j.user_id = u.id AND strftime('%Y-%m', j.created_at/1000, 'unixepoch') = ? GROUP BY u.id ORDER BY rows DESC"
    : "SELECT u.email, COUNT(j.id) AS jobs, COALESCE(SUM(j.total),0) AS rows, MAX(j.created_at) AS last FROM users u LEFT JOIN jobs j ON j.user_id = u.id GROUP BY u.id ORDER BY rows DESC";

  const stmt = env.DB.prepare(sql);
  const { results } = await (ym ? stmt.bind(ym) : stmt).all();
  return json({ period: ym, usage: results || [] });
}
