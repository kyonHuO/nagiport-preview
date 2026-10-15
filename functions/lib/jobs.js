// Helpers for the per-customer job (classification result) API.

export const MAX_ROWS = 100;
export const MAX_CHARS_PER_ROW = 2000;
export const MAX_TOTAL_CHARS = 100000;
export const CATEGORIES = ["positive", "negative", "mixed", "hold", "skipped"];

export async function contentHash(results) {
  const canonical = JSON.stringify(
    results.map((r) => [r.row_index, r.source_id, r.text, r.category]),
  );
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizeResults(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0 || raw.length > MAX_ROWS) return null;
  const out = [];
  let total = 0;
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] || {};
    const text = typeof r.text === "string" ? r.text : "";
    if (!text) return null;
    if (text.length > MAX_CHARS_PER_ROW) return null;
    total += text.length;
    if (total > MAX_TOTAL_CHARS) return null;
    const category = CATEGORIES.includes(r.category) ? r.category : "hold";
    out.push({
      row_index: i,
      source_id: r.id === undefined || r.id === null ? null : String(r.id).slice(0, 200),
      text,
      category,
      candidate: CATEGORIES.includes(r.candidate) ? r.candidate : null,
      score: Number.isFinite(r.score) ? r.score : null,
      margin: Number.isFinite(r.margin) ? r.margin : null,
      reason: typeof r.reason === "string" ? r.reason.slice(0, 500) : null,
      nearest: typeof r.nearest === "string" ? r.nearest.slice(0, 2000) : null,
      method:
        typeof r.method === "string"
          ? r.method.slice(0, 200)
          : "Bilingual prototype centroids; uncalibrated similarity, not probability",
    });
  }
  return out;
}

export function buildCounts(results) {
  const counts = {};
  for (const key of CATEGORIES) counts[key] = 0;
  for (const r of results) if (counts[r.category] !== undefined) counts[r.category]++;
  return counts;
}

export function newJobId() {
  return crypto.randomUUID();
}

export function newResultId() {
  return crypto.randomUUID();
}
