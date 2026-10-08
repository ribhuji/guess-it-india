#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-https://guess-it-india.ribhuratnam2000.workers.dev}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/guess-it-smoke.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

if ! command -v curl >/dev/null 2>&1; then
  echo "FAIL curl is required"
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "FAIL jq is required for JSON assertions"
  exit 1
fi

pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; exit 1; }

request() {
  local method="$1" route="$2" name="$3" data="${4:-}"
  if [[ -n "$data" ]]; then
    curl --silent --show-error --request "$method" "$BASE_URL$route" \
      -H 'content-type: application/json' --data "$data" \
      -o "$TMP_DIR/$name.body" -w '%{http_code}' >"$TMP_DIR/$name.status"
  else
    curl --silent --show-error --request "$method" "$BASE_URL$route" \
      -o "$TMP_DIR/$name.body" -w '%{http_code}' >"$TMP_DIR/$name.status"
  fi
}

status() { cat "$TMP_DIR/$1.status"; }
json() { jq -e "$1" "$TMP_DIR/$2.body" >/dev/null; }

request GET /api/health health
[[ "$(status health)" == 200 ]] || fail "health returns HTTP 200"
json '.ok == true and .app == "Guess It India"' health || fail "health payload"
pass "health"

request GET /api/categories categories
[[ "$(status categories)" == 200 ]] || fail "categories returns HTTP 200"
json '.categories | length == 4' categories || fail "four categories returned"
expected_categories='["famous-indians","monuments","numbers","sportspersons"]'
actual_categories="$(jq -c '[.categories[].id] | sort' "$TMP_DIR/categories.body")"
[[ "$actual_categories" == "$expected_categories" ]] || fail "category IDs"
if jq -e 'has("secrets") or has("secretLists")' "$TMP_DIR/categories.body" >/dev/null; then
  fail "category response exposes secrets"
fi
pass "categories"

curl --silent --show-error --dump-header "$TMP_DIR/health.headers" \
  "$BASE_URL/api/health" -o /dev/null
grep -Eiq '^cache-control:.*no-store' "$TMP_DIR/health.headers" || fail "Cache-Control no-store"
grep -Eiq '^x-content-type-options:' "$TMP_DIR/health.headers" || fail "X-Content-Type-Options"
grep -Eiq '^referrer-policy:' "$TMP_DIR/health.headers" || fail "Referrer-Policy"
pass "API security headers"

request GET /api/games/not-a-valid-uuid bad_uuid
[[ "$(status bad_uuid)" =~ ^4[0-9][0-9]$ ]] || fail "malformed UUID rejected"
json 'has("error")' bad_uuid || fail "malformed UUID error JSON"
pass "malformed UUID"

request POST /api/games bad_category '{"category":"not-real"}'
[[ "$(status bad_category)" =~ ^4[0-9][0-9]$ ]] || fail "invalid category rejected"
json 'has("error")' bad_category || fail "invalid category error JSON"
pass "invalid category"

request GET /api/dev/judge dev_judge
[[ "$(status dev_judge)" =~ ^4[0-9][0-9]$ ]] || fail "dev judge route unavailable"
request GET /api/dev/pick-secret dev_pick
[[ "$(status dev_pick)" =~ ^4[0-9][0-9]$ ]] || fail "dev pick route unavailable"
pass "development routes unavailable"

request POST /api/games empty_game '{"category":"monuments"}'
[[ "$(status empty_game)" == 200 ]] || fail "empty-question test game starts"
EMPTY_ID="$(jq -r '.sessionId' "$TMP_DIR/empty_game.body")"
request POST "/api/games/$EMPTY_ID/questions" empty_question '{"question":"   "}'
[[ "$(status empty_question)" == 400 ]] || fail "empty question rejected"
json 'has("error")' empty_question || fail "empty question error JSON"
pass "empty question"

request POST /api/games rate_game '{"category":"monuments"}'
[[ "$(status rate_game)" == 200 ]] || fail "rate-limit test game starts"
SESSION_ID="$(jq -r '.sessionId' "$TMP_DIR/rate_game.body")"
[[ "$SESSION_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]] || fail "session ID is UUID-shaped"
json '.questionsUsed == 0 and .questionsLeft == 20 and (has("secret") | not)' rate_game || fail "initial game response"
pass "game creation"

question_data='{"question":"Is it located in India?"}'
(request POST "/api/games/$SESSION_ID/questions" question_a "$question_data") &
(request POST "/api/games/$SESSION_ID/questions" question_b "$question_data") &
wait
FIRST_STATUS="$(status question_a)"
SECOND_STATUS="$(status question_b)"
if [[ ! ( "$FIRST_STATUS" == 200 && "$SECOND_STATUS" == 429 || "$FIRST_STATUS" == 429 && "$SECOND_STATUS" == 200 ) ]]; then
  fail "rapid submissions return one 200 and one 429"
fi
if [[ "$FIRST_STATUS" == 429 ]]; then RATE_LIMITED=question_a; ACCEPTED=question_b; else RATE_LIMITED=question_b; ACCEPTED=question_a; fi
json '.error == "Please wait a moment before asking another question."' "$RATE_LIMITED" || fail "rate-limit error payload"
json '(.answer == "YES" or .answer == "NO" or .answer == "MAYBE" or .answer == "CORRECT") and .questionsUsed == 1 and (has("secret") | not)' "$ACCEPTED" || fail "accepted question response"
pass "rate limiting"

request GET "/api/games/$SESSION_ID" active_state
[[ "$(status active_state)" == 200 ]] || fail "active state request"
json '.questionsUsed == 1 and .questionsLeft == 19 and (.history | length) == 1 and (has("secret") | not)' active_state || fail "active state shape"
pass "active state persistence and secrecy"

sleep 1
request POST "/api/games/$SESSION_ID/questions" after_cooldown '{"question":"Was it built before the year 2000?"}'
[[ "$(status after_cooldown)" == 200 ]] || fail "post-cooldown question"
json '(.answer == "YES" or .answer == "NO" or .answer == "MAYBE" or .answer == "CORRECT") and .questionsUsed == 2' after_cooldown || fail "post-cooldown response"
pass "cooldown recovery"

request POST "/api/games/$SESSION_ID/give-up" give_up
[[ "$(status give_up)" == 200 ]] || fail "give-up request"
json '.finished == true and .won == false and (.secret | type) == "string"' give_up || fail "give-up response"
request POST "/api/games/$SESSION_ID/questions" after_give_up '{"question":"Is it in India?"}'
[[ "$(status after_give_up)" == 409 ]] || fail "question after give-up rejected"
json 'has("error")' after_give_up || fail "question-after-give-up error JSON"
request GET "/api/games/$SESSION_ID" finished_state
[[ "$(status finished_state)" == 200 ]] || fail "finished state request"
json '.finished == true and .won == false and (.history | length) == 2 and (has("secret") | not)' finished_state || fail "finished public state shape"
pass "give-up and finished state"

echo "Production smoke checks passed."
