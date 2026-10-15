// Shared helpers for the account API (Cloudflare Pages Functions + D1).
// No third-party dependencies; uses Web Crypto and the `DB` D1 binding.

const encoder = new TextEncoder();
// workerd caps PBKDF2 at DEFAULT_MAX_PBKDF2_ITERATIONS = 100,000; a higher count
// throws at runtime (Cloudflare/workerd#7550 is still open to raise it to 1M).
// 100,000 is therefore the safe maximum on Workers/Pages today. The count is
// stored per user, so it can be raised once the runtime cap allows it.
const PBKDF2_ITERATIONS = 100000;
const SESSION_COOKIE = "np_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function fail(status, message) {
  return json({ error: message }, status);
}

function toBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return toBase64Url(new Uint8Array(bits));
}

export async function hashPassword(password, saltBase64Url) {
  const salt = saltBase64Url
    ? fromBase64Url(saltBase64Url)
    : crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return { salt: toBase64Url(salt), hash, iterations: PBKDF2_ITERATIONS };
}

export async function verifyPassword(password, salt, expectedHash, iterations) {
  const hash = await pbkdf2(password, fromBase64Url(salt), iterations || PBKDF2_ITERATIONS);
  return constantTimeEqual(hash, expectedHash);
}

function randomToken(bytes = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function parseCookies(request) {
  const header = request.headers.get("cookie") || "";
  const out = {};
  header.split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq === -1) return;
    const key = part.slice(0, eq).trim();
    if (!key) return;
    const rawValue = part.slice(eq + 1).trim();
    try {
      out[key] = decodeURIComponent(rawValue);
    } catch {
      // Malformed percent-encoding: keep the raw value so callers never throw.
      out[key] = rawValue;
    }
  });
  return out;
}

export function sessionSetCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

export function sessionClearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function validatePassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 200 &&
    /[A-Za-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name || null,
    created_at: row.created_at,
  };
}

export async function createSession(env, userId) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(tokenHash, userId, now, now + SESSION_MAX_AGE * 1000)
    .run();
  return token;
}

export async function currentUser(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    "SELECT u.id, u.email, u.name, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
  )
    .bind(tokenHash, Date.now())
    .first();
  return row || null;
}

export async function destroySession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function ensureDb(env) {
  return env && env.DB ? null : fail(503, "アカウント機能は準備中です（DB未接続）。");
}

export function newId() {
  return crypto.randomUUID();
}
