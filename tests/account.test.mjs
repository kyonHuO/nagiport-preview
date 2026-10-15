import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// Runs account.js (classify page path) in a minimal DOM sandbox and checks the
// save button actually wires up and posts to /api/jobs. This is a regression
// test for classify.html forgetting to load account.js.

function makeEl(id) {
  return {
    id,
    hidden: false,
    disabled: false,
    textContent: "",
    children: [],
    attrs: {},
    listeners: {},
    append(...nodes) {
      this.children.push(...nodes);
    },
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    replaceChildren() {
      this.children = [];
    },
  };
}

function runAccount() {
  const els = {
    "save-result": makeEl("save-result"),
    "save-run": makeEl("save-run"),
    "save-status": makeEl("save-status"),
  };
  const calls = [];
  const winListeners = {};
  const document = {
    body: { getAttribute: (k) => (k === "data-page" ? "classify" : null) },
    getElementById: (id) => els[id] || null,
    createElement: (tag) => makeEl("created-" + tag),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const window = {
    addEventListener(type, fn) {
      (winListeners[type] = winListeners[type] || []).push(fn);
    },
    crypto: { randomUUID: () => "test-token" },
  };
  const location = { search: "", href: "" };
  const sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const response = (status, data) => ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
  function fetch(url, opts) {
    calls.push({ url, opts });
    if (url.endsWith("/api/auth/me")) return Promise.resolve(response(200, { user: { id: "u1" } }));
    if (url.endsWith("/api/jobs")) return Promise.resolve(response(201, { job: { id: "j1" } }));
    return Promise.resolve(response(404, {}));
  }
  const sandbox = {
    document,
    window,
    location,
    sessionStorage,
    fetch,
    URLSearchParams,
    crypto: { randomUUID: () => "test-token" },
    console,
  };
  const code = readFileSync(new URL("../account.js", import.meta.url), "utf8");
  vm.runInNewContext(code, sandbox, { filename: "account.js" });
  return { els, calls, winListeners };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("save is blocked before any classification result", async () => {
  const { els, calls } = runAccount();
  await tick();
  els["save-run"].listeners.click[0]();
  await tick();
  assert.equal(calls.some((c) => c.url.endsWith("/api/jobs")), false);
  assert.match(els["save-status"].textContent, /保存する結果がありません/);
});

test("save button posts results with a client token after completion", async () => {
  const { els, calls, winListeners } = runAccount();
  await tick(); // let /me resolve
  assert.ok(winListeners["nagiport:complete"], "account.js must register the completion listener");

  winListeners["nagiport:complete"][0]({
    detail: { results: [{ id: 1, text: "good", category: "positive" }] },
  });
  assert.equal(els["save-result"].hidden, false);

  els["save-run"].listeners.click[0]();
  await tick();
  await tick();

  const jobCall = calls.find((c) => c.url.endsWith("/api/jobs"));
  assert.ok(jobCall, "expected a POST to /api/jobs");
  assert.equal(jobCall.opts.method, "POST");
  const body = JSON.parse(jobCall.opts.body);
  assert.equal(body.client_token, "test-token");
  assert.equal(body.results.length, 1);
  assert.equal(body.results[0].text, "good");
  assert.match(els["save-status"].textContent, /保存しました/);
});
