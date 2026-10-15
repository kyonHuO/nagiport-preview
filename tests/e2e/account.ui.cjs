// Screen tests for the account UI details (needs the same secure server as the
// classify screen test): confirmation step + invalidation, result filter,
// responsive overflow and tap-target size.
//
//   BASE=https://127.0.0.1:8790 NODE_PATH=<node_modules with puppeteer-core> \
//     node tests/e2e/account.ui.cjs

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
    const page = await browser.newPage();
    const email = `ui+${Date.now()}@example.com`;

    // Register so the account classify page is reachable.
    await page.goto(BASE + "/customer.html", { waitUntil: "load" });
    await page.click("#tab-signup");
    await page.type("#signup-email", email);
    await page.type("#signup-password", "pass1234");
    await page.type("#signup-password2", "pass1234");
    await page.click("#signup-form button[type=submit]");
    await page.waitForFunction(() => /\/dashboard$/.test(location.pathname), { timeout: 15000 }).catch(() => {});

    // Confirmation step: appears with a row count, and is invalidated by edits.
    await page.goto(BASE + "/classify.html", { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 800));
    await page.type("#review-input", "1行目の口コミ\\n2行目の口コミ", { delay: 5 });
    await page.click("#classify-input");
    await page.waitForFunction(() => !document.getElementById("classify-confirm").hidden, { timeout: 5000 }).catch(() => {});
    const confirmCount = await page.$eval("#confirm-count", (n) => n.textContent).catch(() => "");
    check("confirmation step shows a valid row count", /有効な行数/.test(confirmCount));
    await page.type("#review-input", "\\n3行目", { delay: 5 });
    await new Promise((r) => setTimeout(r, 300));
    const confirmHiddenAfterEdit = await page.$eval("#classify-confirm", (n) => n.hidden).catch(() => false);
    check("editing input invalidates the confirmation", confirmHiddenAfterEdit);

    // Result filter: seed rows through the debug seam (no model download).
    await page.goto(BASE + "/classify.html?debug=1", { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 800));
    await page.evaluate(() => {
      document.getElementById("results").hidden = false;
      window.__nagiport.appendResult({ id: 1, text: "good", category: "positive", candidate: "positive", score: 0.6, margin: 0.1 });
      window.__nagiport.appendResult({ id: 2, text: "bad", category: "negative", candidate: "negative", score: 0.5, margin: 0.05 });
    });
    await page.waitForSelector("#result-filter .filter-chip", { timeout: 5000 }).catch(() => {});
    const chips = await page.$$eval("#result-filter .filter-chip", (n) => n.map((b) => b.textContent));
    check("result filter has chips", chips.length >= 3);
    await page.evaluate(() => document.querySelectorAll("#result-filter .filter-chip")[1].click());
    await new Promise((r) => setTimeout(r, 150));
    const visibleCats = await page.$$eval("#result-list .result-row", (rows) =>
      rows.filter((r) => !r.hidden).map((r) => r.dataset.category),
    );
    check("filter shows only the chosen category", visibleCats.length > 0 && visibleCats.every((c) => c === visibleCats[0]));

    const dims = await page.evaluate(() => {
      const nav = document.querySelector(".account-nav a");
      const r = nav ? nav.getBoundingClientRect() : { height: 0 };
      return { navHeight: r.height, overflows: document.documentElement.scrollWidth > window.innerWidth + 1 };
    });
    check("account nav tap target is >= 44px", dims.navHeight >= 44);

    // Responsive overflow at 375 / 768 / 1440.
    let overflowOk = true;
    for (const width of [375, 768, 1440]) {
      await page.setViewport({ width, height: 900 });
      for (const path of ["/customer.html", "/classify.html", "/dashboard.html", "/history.html"]) {
        await page.goto(BASE + path, { waitUntil: "load" });
        await new Promise((r) => setTimeout(r, 200));
        const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (over) {
          console.log(`      overflow at ${width}px on ${path}`);
          overflowOk = false;
        }
      }
    }
    check("no horizontal overflow at 375/768/1440", overflowOk);
  } finally {
    await browser.close();
  }
  console.log("-----");
  console.log(`TOTAL pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
