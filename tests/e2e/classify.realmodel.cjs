// Real-model E2E: classify with the actual EmbeddingGemma-2 ONNX model in the
// browser, then save and confirm the history. Heavy: the first run downloads
// ~220MB. Not part of CI; run manually.
//
//   npx wrangler pages dev . --d1 DB=REPLACE_WITH_D1_DATABASE_ID --local-protocol https --port 8790
//   BASE=https://127.0.0.1:8790 NODE_PATH=<node_modules with puppeteer-core> \
//     node tests/e2e/classify.realmodel.cjs

const puppeteer = require("puppeteer-core");

const BASE = process.env.BASE || "https://127.0.0.1:8790";
const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const MODEL_TIMEOUT = Number(process.env.MODEL_TIMEOUT || 420000);

let pass = 0;
let fail = 0;
function check(name, ok) {
  console.log((ok ? "PASS  " : "FAIL  ") + name);
  ok ? pass++ : fail++;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
    acceptInsecureCerts: true,
  });
  try {
    const page = await browser.newPage();
    page.on("console", (m) => {
      const t = m.text();
      if (/error|失敗|fail/i.test(t)) console.log("CONSOLE", t.slice(0, 200));
    });
    const email = `real+${Date.now()}@example.com`;

    await page.goto(BASE + "/customer.html", { waitUntil: "load" });
    await page.click("#tab-signup");
    await page.type("#signup-email", email);
    await page.type("#signup-password", "pass1234");
    await page.type("#signup-password2", "pass1234");
    await page.click("#signup-form button[type=submit]");
    await page.waitForFunction(() => /\/dashboard$/.test(location.pathname), { timeout: 15000 }).catch(() => {});

    await page.goto(BASE + "/classify.html", { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 800));
    await page.select("#device-choice", "wasm");
    await page.evaluate(() => {
      const t = document.getElementById("review-input");
      t.value = "音が静かで毎日使いやすいです\nすぐ壊れて使えませんでした";
      t.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.click("#classify-input"); // shows the confirmation step
    await page.waitForFunction(() => !document.getElementById("classify-confirm").hidden, { timeout: 5000 }).catch(() => {});
    check("confirmation step appeared", await page.$eval("#classify-confirm", (n) => !n.hidden));

    const started = Date.now();
    await page.click("#classify-confirm-run");
    // The save panel appears on completion, so this waits for the whole run.
    await page.waitForFunction(() => !document.getElementById("save-result").hidden, { timeout: MODEL_TIMEOUT }).catch(() => {});
    const rows = await page.$$eval("#result-list .result-row", (n) => n.length).catch(() => 0);
    console.log(`      classification took ~${Math.round((Date.now() - started) / 1000)}s, ${rows} rows`);
    check("real model produced results", rows >= 2);

    const labels = await page.$$eval("#result-list .label", (n) => n.map((b) => b.textContent));
    console.log("      labels:", labels.join(", "));

    await page.click("#save-run");
    await page.waitForFunction(() => /保存しました|保存済み/.test(document.getElementById("save-status").textContent), { timeout: 20000 }).catch(() => {});
    check("saved after real classification", /保存しました|保存済み/.test(await page.$eval("#save-status", (n) => n.textContent)));

    await page.goto(BASE + "/history.html", { waitUntil: "load" });
    await page.waitForSelector("#history-list .dash-card", { timeout: 15000 }).catch(() => {});
    const cards = await page.$$eval("#history-list .dash-card", (n) => n.length).catch(() => 0);
    check("history shows the job", cards >= 1);
  } finally {
    await browser.close();
  }
  console.log("-----");
  console.log(`TOTAL pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
