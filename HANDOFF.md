# Nagiport site preparation handoff

Base: GitHub HEAD `fea3a4b9884b0fcf3f0cfc082faee97c0ae78cd3`, freshly cloned 2026-10-08. No push or publication performed.

Final follow-up: user explicitly assigned the remaining CSV operation QA to themselves and authorized skipping it for this publication attempt. It remains unperformed, not passed. Latest remote fetch confirmed origin/main still at the base above (no conflict). Final static review found no prohibited real name, no video/classifier changes and no active payment/delivery claim. Zero reviews now display `対象なし`, with no 500-yen estimate; the minimum applies only from one review. Both 20MB and 100 columns are explicitly described as this screen's technical limits, not service intake limits. Relevant 12 tests passed again.

Publication attempt: local implementation commit `2bd55e0` was ready, but `git push origin main` failed with `remote: Invalid username or token` / `Authentication failed`. No new authentication, token, credential change or alternative publication route was attempted. Public readback cannot confirm these changes because the push failed. Parent must resolve the existing GitHub authentication before a fresh remote-conflict check and authorized push.

Changes: dark pricing / local CSV estimator at estimate.html; home and demo navigation; CSV preparation steps; non-CSV and recurring-use consultation via nagiport.contact@gmail.com; explicit preparation status and fictional mail-demo disclosure. Existing video, posters, artwork, classifier and trial were not modified. No real-name addition.

Reference price examples: 250 = 500 yen, 1,000 = 2,000, 1,001 = 2,001, 10,000 = 11,000, 10,001 = 11,000.5, 20,000 = 16,000. Fractional amounts deliberately remain unrounded; invoice rounding requires a future decision.

## QA evidence and limits

`node --test tests/estimate.test.mjs tests/video.test.mjs`: 12 passed, 0 failed. Covers progressive boundaries/minimum, malformed and unsafe counts, synthetic sample quoting/multiline/empty bodies, malformed CSV, 10,001-row counting, existing video regression. No classification accuracy rerun or model download.

Chrome initially loaded the local page. The later call was reported as user-aborted. The follow-up QA below supersedes the initial incomplete status for the checks it explicitly lists.

### Follow-up actual-browser QA

At restart the local HTTP server was stopped and the old tab debugger was unattached. Restarting the server and creating a new tab in the existing Chrome restored ordinary operations without authentication or permission changes.

- Inputs 1,000 → 2,000 yen; 1,001 → 2,001; 10,000 → 11,000; 10,001 → 11,000.5. Empty, negative, decimal and alphabetic entries show an error and clear the estimate; a valid subsequent entry recovers.
- Home, estimate and demo at 375 / 768 / 1440 CSS pixels: document scroll widths never exceed viewport width. Screenshots show dark layouts and wrapped navigation. At 375 the estimate panels stack vertically.
- Home → pricing and estimate → demo → home links work. Reset without a selected file restores 1,000 / 2,000 yen and disables CSV columns.
- Review video plays with readyState 4; moving to mail pauses review. Mail starts paused, plays through its native control (readyState 4), then pauses through that control. The fictional / unimplemented mail-service disclosure stays visible.

Still blocked: official Chrome file-chooser setFiles returns `To enable file upload ... enable Allow access to file URLs` for the ChatGPT extension. Retried after the user's message that permission was pressed; the same error remained. No extension setting was changed. Actual CSV selection, column/header changes, reselection, malformed-file recovery and race cancellation remain unverified in browser. Pure parser/sample tests passed but do not substitute for these UI checks. No accuracy rerun.

Screenshots: sibling local `../qa-evidence/` directory contains home-375/768/1440.jpg, estimate-375/768/1440.jpg, estimate-boundary-1440.jpg, demo-375/768/1440.jpg and mail-playing-1440.jpg. QA evidence is not added to public assets. Full-page capture timed out; viewport captures succeeded. Viewport override was reset afterward.

Public URL fetch via web tool failed as inaccessible; repository HEAD is verified but current deployed-page equality is not verified.

## Prototype retrieval blocker

Library known-reference prepare_materialize returned version 0 and initially a signed transfer, then returned workspace_path `/workspace/scratch/c12a521516ab/nagiport-csv-preparation-2026-10-08.zip` with no download URL. That path does not exist on this Windows host. The current official materialization helper failed with `transfer.download_url must be a non-empty string`. No raw URL download or cloud-path assumption was used. Prototype bytes were not read or integrated; independent implementation uses GitHub CSV parser.

## Before launch

Parent performs final review and publication. Complete blocked CSV file-selection UI QA, deployed-page verification and prototype comparison when materialization is available. Confirm a suitable commercial intake host and its current terms before paid transactions, plus formal service/data handling terms, delivery workflow and invoice rounding. Model, payment and production result CSV connection are not implemented. No storage-period or deletion guarantee is promised. No new account, billing agreement, OAuth, key, permissions or customer-data transfer was initiated.

## Account / customer dashboard (branch `customer-account-v1`)

Owner asked for a real login UI and the account-holder customer page, publish-ready for a Cloudflare custom domain (`.io` GitHub Pages is the interim host). Scope: real auth (email + password), no payment or file-transfer connection yet.

- Pages: `customer.html` (login / signup), `dashboard.html` (logged-in my page: usage, orders, files, profile). Shared: `account.js`, `account.css`.
- API: Cloudflare Pages Functions under `functions/api/auth/` (`register`, `login`, `logout`, `me`) with shared `functions/lib/auth.js`. Passwords use PBKDF2-SHA256 (120k iterations, per-user salt). Sessions are random tokens stored as SHA-256 hashes in D1; cookie is HttpOnly/Secure/SameSite=Lax, 30 days.
- Schema: `migrations/0001_auth.sql` (tables `users`, `sessions`).
- Preview: `?preview=1` on `customer.html` / `dashboard.html` walks the UI without a backend (banner shown, no real data). Static GitHub Pages has no Functions, so real calls need Cloudflare.
- Tests: `node --test tests/auth.test.mjs` (7) plus existing suites pass locally (50 total).
- Saved target (explicit): only the classification results for rows the user chose to save (row text + label + hold reason + scores). The original CSV file is never uploaded or stored; classification runs in the browser. Saves are idempotent via a client token (`migrations/0004_jobs_token.sql`), and list/detail/CSV/delete all enforce server-side ownership.
- Not done: email verification, password reset, CSRF beyond SameSite + Origin check, privacy/terms text, payment and file delivery. These remain before handling real customer data.

### Account screens (spec)

`customer.html` (login / signup), `dashboard.html` (account overview), `classify.html` (dark in-browser classification with a pre-send confirmation step and result filter), `history.html` (stored jobs with server-side CSV download). Shared controller `account.js`; styles `account.css` + `classify-dark.css`. The public demo `try.html` is untouched; the confirmation step and filter activate only when their elements exist.

### Deploy (Cloudflare Pages)

`wrangler.toml` targets a Pages project `nagiport` served from the repo root, with a D1 binding named `DB` and `functions/_middleware.js` adding baseline security headers. Once the domain is bought, publishing is:

```
npx wrangler d1 create nagiport-accounts
# paste the returned database_id into wrangler.toml (the committed value is a placeholder)
npx wrangler d1 execute nagiport-accounts --file=migrations/0001_auth.sql
npx wrangler d1 execute nagiport-accounts --file=migrations/0002_jobs.sql
npx wrangler d1 execute nagiport-accounts --file=migrations/0003_ratelimit.sql
npx wrangler d1 execute nagiport-accounts --file=migrations/0004_jobs_token.sql
npx wrangler d1 execute nagiport-accounts --file=migrations/0006_jobs_hash.sql
# confirm the target and tables before deploying
npx wrangler d1 execute nagiport-accounts --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
npx wrangler pages deploy .
# then add the custom domain in the Pages project settings
```

The site keeps working on GitHub Pages (.io) without Functions; only the real login/DB calls need Cloudflare.

### Verification

- Unit: `node --test tests/core.test.mjs tests/estimate.test.mjs tests/video.test.mjs tests/auth.test.mjs` → 50 passed (7 of these are auth helpers).
- Integration (real workerd + local D1): `tests/integration/api.test.sh` → 33 checks. Covers register/login/me, duplicate/wrong-password/malformed-JSON/cross-origin/malformed-cookie handling, job create/list/detail/CSV, idempotent double-save (same `client_token` returns the same job), delete with ownership (another user gets 404), two-account isolation, no-cookie 401, logout, post-logout 401, repeated-failed-login rate limiting (429) non-JSON body rejection, same-token-different-content rejection, delete cross-origin, concurrent-request rate limiting, and session expiry (with `RESET_D1=1` against a local D1). Setup commands are in the script header. Requires `wrangler pages dev --local-protocol https` because the session cookie is Secure.
- Screen test (browser, real server): `tests/e2e/classify.screen.cjs` → 8 checks. Drives Chrome with puppeteer-core: unauthenticated `classify.html` redirects to login, signup reaches the dashboard, the classify page stays when logged in, the save panel appears after completion, save reports success, re-saving the same result is idempotent (history keeps one job), and the job shows up in history with a CSV link. Classification completion is simulated with the `nagiport:complete` event (the ~220MB model is not downloaded). Run with `BASE=... NODE_PATH=<node_modules with puppeteer-core> node tests/e2e/classify.screen.cjs`.
- Screen test (UI details): `tests/e2e/account.ui.cjs` → 6 checks. Covers the confirmation step and its invalidation on edit, the result filter (via a `?debug=1` test seam that appends rows without the model), a >=44px tap target, and no horizontal overflow at 375/768/1440 on customer/classify/dashboard/history.
- Real-model E2E: `tests/e2e/classify.realmodel.cjs` → 4 checks. Runs the actual EmbeddingGemma-2 ONNX model in the browser (WASM), classifies two rows, saves and confirms history. Heavy (~220MB first download, ~26s here); manual only, not in CI. In the local run the two sample rows were labelled 判定保留 and 否定的; label quality/threshold calibration is a separate concern.
- Runtime constraint: workerd caps PBKDF2 at 100,000 iterations (`DEFAULT_MAX_PBKDF2_ITERATIONS`); a higher value throws. The code uses 100,000 and stores the count per user so it can be raised once the cap does (Cloudflare/workerd#7550 is still open).

### Before connecting for real (decisions)

`wrangler.toml` is a template: the `database_id` is a placeholder and no live resource has been touched. Before any real D1/Pages operation, confirm:

1. Owner and Cloudflare account/project that will host the Pages project.
2. The real D1 database name/id to bind as `DB`, and that migrations were applied to that exact database (verify the table list above).
3. Data handling: customer review text is stored in D1 (`jobs` / `job_results`); privacy/terms text, retention and deletion policy are not written yet.
4. Cost: D1/Pages usage beyond the free tier.

The browser-only demo (`try.html`) stays public and needs no login; the account feature (`classify.html` + `history.html`) requires a session and stores results in D1.

### GitHub-based deploy (Cloudflare Pages)

Two workflows under `.github/workflows/`:

- `d1-migrate.yml` (manual `workflow_dispatch`): applies migrations 0001–0004 to the production D1 database, then prints the table list.
- `deploy-pages.yml` (on push to `main`, or manual): injects the D1 id into `wrangler.toml` and runs `wrangler pages deploy . --project-name=nagiport`.

Repository secrets required:

1. `CLOUDFLARE_API_TOKEN` — Pages:Edit and D1:Edit.
2. `CLOUDFLARE_ACCOUNT_ID`.
3. `CLOUDFLARE_D1_DATABASE_ID` — the id from `wrangler d1 create nagiport-accounts`.

Order: create D1 → add secrets → run `D1 migrate` once → merge to `main` (or run `Deploy` manually) → register `nagiport.com` as a custom domain on the Pages project and let DNS/SSL issue.
