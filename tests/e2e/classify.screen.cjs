// Screen test for the account classify flow (needs a running secure server).
//
//   npx wrangler pages dev . --d1 DB=REPLACE_WITH_D1_DATABASE_ID --local-protocol https --port 8790
//   BASE=https://127.0.0.1:8790 NODE_PATH=/path/to/node_modules node tests/e2e/classify.screen.cjs
//
// Requires `puppeteer-core` (or `puppeteer`) resolvable, and Chrome installed.
// The model download (~220MB) is not exercised: classification completion is
// simulated with the `nagiport:complete` event, so this checks the page wiring,
// auth gate, save button and history rendering.

const puppeteer = require("puppeteer-core");

const BASE = process.env.BASE || "https://127.0.0.1:8790";
const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) {
    console.log("PASS  " + name);
    pass++;
  } else {
    console.log("FAIL  " + name);
    fail++;
  }
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
    acceptInsecureCerts: true,
  });
  try {
    const email = `screen+${Date.now()}@example.com`;

    // 1. Not logged in: classify.html must redirect to the login page.
    const anon = await browser.createBrowserContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(BASE + "/classify.html", { waitUntil: "load" });
    await anonPage.waitForFunction(() => /\/customer$/.test(location.pathname), { timeout: 8000 }).catch(() => {});
    check("unauthenticated classify redirects to login", /\/customer$/.test(new URL(anonPage.url()).pathname));
    await anon.close();

    // 2. Register through the UI.
    const page = await browser.newPage();
    await page.goto(BASE + "/customer.html", { waitUntil: "load" });
    await page.click("#tab-signup");
    await page.type("#signup-email", email);
    await page.type("#signup-password", "pass1234");
    await page.type("#signup-password2", "pass1234");
    await page.click("#signup-form button[type=submit]");
    await page.waitForFunction(() => /\/dashboard$/.test(location.pathname), { timeout: 15000 }).catch(() => {});
    check("signup navigates to dashboard", /\/dashboard$/.test(new URL(page.url()).pathname));

    // 3. Classify page loads when logged in (no redirect).
    await page.goto(BASE + "/classify.html", { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 1000));
    check("classify page stays when logged in", /\/classify$/.test(new URL(page.url()).pathname));

    // 4. Simulate a finished classification, then save.
    await page.evaluate(() => {
      document.getElementById("results").hidden = false;
      window.dispatchEvent(
        new CustomEvent("nagiport:complete", {
          detail: { results: [{ id: 1, text: "good", category: "positive", candidate: "positive", score: 0.6, margin: 0.1 }] },
        }),
      );
    });
    await page.waitForFunction(() => !document.getElementById("save-result").hidden, { timeout: 5000 }).catch(() => {});
    const shown = await page.$eval("#save-result", (n) => !n.hidden);
    check("save panel appears after completion", shown);

    await page.click("#save-run");
    await page.waitForFunction(() => /保存しました|保存済み/.test(document.getElementById("save-status").textContent), { timeout: 10000 }).catch(() => {});
    const saved = await page.$eval("#save-status", (n) => n.textContent);
    check("save reports success", /保存しました|保存済み/.test(saved));

    // Pressing save again for the same result must not create a duplicate.
    await page.click("#save-run");
    await page.waitForFunction(() => /保存済み/.test(document.getElementById("save-status").textContent), { timeout: 10000 }).catch(() => {});
    const again = await page.$eval("#save-status", (n) => n.textContent);
    check("re-saving the same result is idempotent", /保存済み/.test(again));

    // 5. History lists the saved job with a CSV download link.
    await page.goto(BASE + "/history.html", { waitUntil: "load" });
    await page.waitForSelector("#history-list .dash-card", { timeout: 10000 }).catch(() => {});
    const cards = await page.$$eval("#history-list .dash-card", (nodes) => nodes.length);
    check("history shows exactly one job", cards === 1);
    const csv = await page.$$eval("#history-list a", (as) => as.map((a) => a.getAttribute("href")).join(" "));
    check("history has a CSV download link", /\/api\/jobs\/.+\/csv/.test(csv));
  } finally {
    await browser.close();
  }
  console.log("-----");
  console.log(`TOTAL pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
