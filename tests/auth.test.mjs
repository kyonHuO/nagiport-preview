import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateEmail,
  validatePassword,
  normalizeEmail,
  hashPassword,
  verifyPassword,
  publicUser,
  parseCookies,
} from "../functions/lib/auth.js";

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Foo@Example.COM "), "foo@example.com");
  assert.equal(normalizeEmail(undefined), "");
});

test("validateEmail accepts normal addresses only", () => {
  assert.equal(validateEmail("a@b.co"), true);
  assert.equal(validateEmail("no-at-sign"), false);
  assert.equal(validateEmail("a@b"), false);
  assert.equal(validateEmail("a@" + "x".repeat(300) + ".com"), false);
});

test("validatePassword requires 8+ chars with a letter and a digit", () => {
  assert.equal(validatePassword("pass1234"), true);
  assert.equal(validatePassword("short1"), false);
  assert.equal(validatePassword("allletters"), false);
  assert.equal(validatePassword("12345678"), false);
});

test("hash/verify round-trips and rejects wrong passwords", async () => {
  const stored = await hashPassword("pass1234");
  assert.ok(stored.salt && stored.hash && stored.iterations > 0);
  assert.equal(await verifyPassword("pass1234", stored.salt, stored.hash, stored.iterations), true);
  assert.equal(await verifyPassword("wrong123", stored.salt, stored.hash, stored.iterations), false);
});

test("salt is unique per call for same password", async () => {
  const a = await hashPassword("pass1234");
  const b = await hashPassword("pass1234");
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test("publicUser exposes only safe fields", () => {
  const row = {
    id: "u1",
    email: "a@b.co",
    name: "A",
    created_at: 1,
    password_hash: "secret",
    password_salt: "secret",
    password_iterations: 1,
  };
  assert.deepEqual(publicUser(row), { id: "u1", email: "a@b.co", name: "A", created_at: 1 });
});

test("parseCookies reads a simple cookie header", () => {
  const req = new Request("https://example.com/", { headers: { cookie: "a=1; np_session=abc%3D; b=2" } });
  assert.deepEqual(parseCookies(req), { a: "1", np_session: "abc=", b: "2" });
});
