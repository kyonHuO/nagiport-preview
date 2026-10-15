#!/usr/bin/env bash
# Integration test for the account + jobs API against the real Workers runtime
# (`wrangler pages dev`, workerd) with a local D1 database.
#
# Setup:
#   npx wrangler d1 execute nagiport-accounts --local --file=migrations/0001_auth.sql
#   npx wrangler d1 execute nagiport-accounts --local --file=migrations/0002_jobs.sql
#   npx wrangler d1 execute nagiport-accounts --local --file=migrations/0003_ratelimit.sql
#   npx wrangler d1 execute nagiport-accounts --local --file=migrations/0004_jobs_token.sql
#   npx wrangler pages dev . --d1 DB=REPLACE_WITH_D1_DATABASE_ID --local-protocol https --port 8790
#   bash tests/integration/api.test.sh
#
# Override the target with BASE=https://host:port. The server uses a Secure
# cookie, so it must be tested over https (pages dev --local-protocol https).
set -u
BASE="${BASE:-https://127.0.0.1:8790}"
J="$(mktemp -d)"
trap 'rm -rf "$J"' EXIT
# Unique source IP per run so rate-limit buckets do not leak between runs.
printf 'header = "x-forwarded-for: test-%s"\n' "$RANDOM$RANDOM" > "$J/curlrc"
CURL="curl -sk -K $J/curlrc"
# Local runs share the same source IP, so rate-limit buckets pile up between
# runs. Set RESET_D1=1 to clear them first (requires wrangler + local D1).
if [ "${RESET_D1:-0}" = "1" ]; then
  npx wrangler d1 execute nagiport-accounts --local --command "DELETE FROM auth_attempts" >/dev/null 2>&1 || true
fi
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1  expected=$2 actual=$3"; fail=$((fail+1)); fi; }
code() { $CURL -o /dev/null -w "%{http_code}" "$@"; }
jsonid() { python3 -c 'import sys,json;print(json.load(sys.stdin).get("job",{}).get("id",""))'; }
jsoncount() { python3 -c 'import sys,json;print(len(json.load(sys.stdin).get("jobs",[])))'; }

EMAIL_A="alice+$RANDOM@example.com"
EMAIL_B="bob+$RANDOM@example.com"
TOKEN="tok-$RANDOM"
RESULTS='{"client_token":"'"$TOKEN"'","results":[{"id":1,"text":"good","category":"positive","candidate":"positive","score":0.6,"margin":0.1},{"id":2,"text":"bad","category":"negative","candidate":"negative","score":0.5,"margin":0.05}]}'

check "register A (201)" 201 "$(code -X POST "$BASE/api/auth/register" -H 'content-type: application/json' -H "origin: $BASE" -c "$J/a" -d "{\"email\":\"$EMAIL_A\",\"password\":\"pass1234\",\"name\":\"Alice\"}")"
check "me A after register (200)" 200 "$(code "$BASE/api/auth/me" -H "origin: $BASE" -b "$J/a")"
check "duplicate register (409)" 409 "$(code -X POST "$BASE/api/auth/register" -H 'content-type: application/json' -H "origin: $BASE" -d "{\"email\":\"$EMAIL_A\",\"password\":\"pass1234\"}")"
check "wrong password (401)" 401 "$(code -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -H "origin: $BASE" -d "{\"email\":\"$EMAIL_A\",\"password\":\"wrongpass1\"}")"
check "malformed json (400)" 400 "$(code -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -H "origin: $BASE" -d '{bad json')"
check "cross-origin (403)" 403 "$(code -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -H "origin: https://evil.example" -d "{\"email\":\"$EMAIL_A\",\"password\":\"pass1234\"}")"
check "register B (201)" 201 "$(code -X POST "$BASE/api/auth/register" -H 'content-type: application/json' -H "origin: $BASE" -c "$J/b" -d "{\"email\":\"$EMAIL_B\",\"password\":\"pass1234\"}")"
check "malformed cookie (401 not 500)" 401 "$(code "$BASE/api/auth/me" -H "origin: $BASE" -H 'cookie: np_session=%zz%')"

JOB_ID=$($CURL -X POST "$BASE/api/jobs" -H 'content-type: application/json' -H "origin: $BASE" -b "$J/a" -d "$RESULTS" | jsonid)
check "create job A (id present)" "yes" "$([ -n "$JOB_ID" ] && echo yes || echo no)"
DUP_ID=$($CURL -X POST "$BASE/api/jobs" -H 'content-type: application/json' -H "origin: $BASE" -b "$J/a" -d "$RESULTS" | jsonid)
check "double save with same token returns same id" "$JOB_ID" "$DUP_ID"
check "double save did not create a second job (list=1)" 1 "$($CURL "$BASE/api/jobs" -H "origin: $BASE" -b "$J/a" | jsoncount)"
check "me includes own usage rows (>=2)" "yes" "$($CURL "$BASE/api/auth/me" -H "origin: $BASE" -b "$J/a" | python3 -c 'import sys,json;u=json.load(sys.stdin).get("usage",{});print("yes" if u.get("rows",0)>=2 else "no")')"
check "job detail A (200)" 200 "$(code "$BASE/api/jobs/$JOB_ID" -H "origin: $BASE" -b "$J/a")"
check "non-JSON body rejected (415)" 415 "$(code -X POST "$BASE/api/jobs" -H 'content-type: text/plain' -H "origin: $BASE" -b "$J/a" -d 'not json')"
RESULTS_DIFF='{"client_token":"'"$TOKEN"'","results":[{"id":9,"text":"different content","category":"hold"}]}'
check "same token with different content (409)" 409 "$(code -X POST "$BASE/api/jobs" -H 'content-type: application/json' -H "origin: $BASE" -b "$J/a" -d "$RESULTS_DIFF")"
check "job csv A (200)" 200 "$(code "$BASE/api/jobs/$JOB_ID/csv" -H "origin: $BASE" -b "$J/a")"
check "job csv A content-type" "text/csv; charset=utf-8" "$($CURL -o /dev/null -D - "$BASE/api/jobs/$JOB_ID/csv" -H "origin: $BASE" -b "$J/a" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}')"

check "list jobs B (0, isolated)" 0 "$($CURL "$BASE/api/jobs" -H "origin: $BASE" -b "$J/b" | jsoncount)"
check "B access A job (404)" 404 "$(code "$BASE/api/jobs/$JOB_ID" -H "origin: $BASE" -b "$J/b")"
check "B access A csv (404)" 404 "$(code "$BASE/api/jobs/$JOB_ID/csv" -H "origin: $BASE" -b "$J/b")"
check "delete cross-origin (403)" 403 "$(code -X DELETE "$BASE/api/jobs/$JOB_ID" -H "origin: https://evil.example" -b "$J/a")"
check "B delete A job (404, ownership)" 404 "$(code -X DELETE "$BASE/api/jobs/$JOB_ID" -H "origin: $BASE" -b "$J/b")"
check "A job still exists after B delete (200)" 200 "$(code "$BASE/api/jobs/$JOB_ID" -H "origin: $BASE" -b "$J/a")"
check "no-cookie list jobs (401)" 401 "$(code "$BASE/api/jobs" -H "origin: $BASE")"

check "A delete own job (200)" 200 "$(code -X DELETE "$BASE/api/jobs/$JOB_ID" -H "origin: $BASE" -b "$J/a")"
check "deleted job detail (404)" 404 "$(code "$BASE/api/jobs/$JOB_ID" -H "origin: $BASE" -b "$J/a")"
check "list jobs A after delete (0)" 0 "$($CURL "$BASE/api/jobs" -H "origin: $BASE" -b "$J/a" | jsoncount)"

check "logout A (200)" 200 "$(code -X POST "$BASE/api/auth/logout" -H "origin: $BASE" -b "$J/a" -c "$J/a")"
check "me after logout (401)" 401 "$(code "$BASE/api/auth/me" -H "origin: $BASE" -b "$J/a")"

# Session expiry. Needs a local D1 to force-expire rows, so it runs only with RESET_D1=1.
if [ "${RESET_D1:-0}" = "1" ]; then
  code -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -H "origin: $BASE" -c "$J/x" -d "{\"email\":\"$EMAIL_A\",\"password\":\"pass1234\"}" >/dev/null
  check "fresh session (200)" 200 "$(code "$BASE/api/auth/me" -H "origin: $BASE" -b "$J/x")"
  npx wrangler d1 execute nagiport-accounts --local --command "UPDATE sessions SET expires_at = 0" >/dev/null 2>&1 || true
  check "expired session (401)" 401 "$(code "$BASE/api/auth/me" -H "origin: $BASE" -b "$J/x")"
else
  echo "SKIP  expired session test (set RESET_D1=1 with a local D1)"
fi

# Concurrent burst: the atomic update must not let everyone through.
BURST="burst-$RANDOM$RANDOM"
TMPD="$(mktemp -d)"
for i in $(seq 1 40); do
  ( curl -sk -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -H "origin: $BASE" -H "x-forwarded-for: $BURST" -d "{\"email\":\"cx+$i-$RANDOM@example.com\",\"password\":\"wrongpass1\"}" >> "$TMPD/codes" ) &
done
wait
C401=$(grep -c '^401$' "$TMPD/codes" || true)
C429=$(grep -c '^429$' "$TMPD/codes" || true)
rm -rf "$TMPD"
check "concurrent limit: at most 20 allowed" "yes" "$([ "$C401" -le 20 ] && echo yes || echo no)"
check "concurrent limit: at least 20 blocked" "yes" "$([ "$C429" -ge 20 ] && echo yes || echo no)"

if [ -n "${ADMIN_TOKEN:-}" ]; then
  check "admin usage no token (401)" 401 "$(code "$BASE/api/admin/usage" -H "origin: $BASE")"
  check "admin usage bad token (401)" 401 "$(code "$BASE/api/admin/usage" -H "origin: $BASE" -H 'x-admin-token: wrong')"
  check "admin usage with token (200)" 200 "$(code "$BASE/api/admin/usage" -H "origin: $BASE" -H "x-admin-token: $ADMIN_TOKEN")"
else
  echo "SKIP  admin usage tests (set ADMIN_TOKEN and a local .dev.vars)"
fi

RL=""
for _ in $(seq 1 25); do
  c="$(code -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -H "origin: $BASE" -d "{\"email\":\"$EMAIL_A\",\"password\":\"wrongpass1\"}")"
  if [ "$c" = "429" ]; then RL=yes; break; fi
done
check "repeated failed logins rate limited (429)" yes "$RL"

echo "-----"
echo "TOTAL pass=$pass fail=$fail"
[ "$fail" = 0 ]
