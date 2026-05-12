#!/usr/bin/env bash
#
# Invex end-to-end smoke test.
#
# Exercises the most important paths and prints PASS/FAIL per check. Exits
# non-zero if anything fails so this is safe to drop in a deploy pipeline.
#
# Usage:
#   INVEX_URL=http://localhost:3000 \
#   INVEX_USER=admin \
#   INVEX_PASS=YourAdminPass \
#   ./scripts/smoke-test.sh
#
# Optional: set CLEANUP=1 to roll back the test data we create.
#
# Requires: curl, jq.

set -uo pipefail

URL="${INVEX_URL:-http://localhost:3000}"
USERNAME="${INVEX_USER:-admin}"
PASSWORD="${INVEX_PASS:-}"
CLEANUP="${CLEANUP:-0}"

if [[ -z "$PASSWORD" ]]; then
  echo "Set INVEX_PASS to an admin password." >&2
  exit 2
fi

for bin in curl jq; do
  command -v "$bin" >/dev/null || { echo "Missing $bin" >&2; exit 2; }
done

PASS=0
FAIL=0
FAILED_NAMES=()

# ── helpers ─────────────────────────────────────────────────────────────
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "  \033[31m✗\033[0m %s\n      %s\n" "$1" "$2"; FAIL=$((FAIL+1)); FAILED_NAMES+=("$1"); }

# Wrap curl so every call gets the Authorization header (when set) and
# JSON content type, and so a non-2xx response surfaces both the status
# and the body for debugging.
api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -X "$method" -H "Accept: application/json")
  [[ -n "${TOKEN:-}" ]] && args+=(-H "Authorization: Bearer $TOKEN")
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" --data "$body")
  fi
  curl "${args[@]}" -w '\n__STATUS__%{http_code}' "$URL$path"
}

# Extracts the HTTP status, body, and a parsed JSON field from an api() call.
# Sets globals: STATUS, BODY, VAL ($3 = jq query, default "." returning body).
last() {
  local raw="$1" jq_query="${2:-.}"
  STATUS="${raw##*__STATUS__}"
  BODY="${raw%__STATUS__*}"
  VAL="$(printf '%s' "$BODY" | jq -r "$jq_query" 2>/dev/null || true)"
}

# Asserts the last call returned 2xx and the JSON `success` field is true.
expect_ok() {
  local label="$1"
  if [[ "$STATUS" =~ ^2 ]] && [[ "$(printf '%s' "$BODY" | jq -r '.success // empty' 2>/dev/null)" == "true" ]]; then
    ok "$label"
    return 0
  fi
  fail "$label" "HTTP $STATUS · body: $(printf '%s' "$BODY" | head -c 200)"
  return 1
}

# Asserts the last call returned a specific status (useful for negative tests).
expect_status() {
  local label="$1" want="$2"
  if [[ "$STATUS" == "$want" ]]; then
    ok "$label"
    return 0
  fi
  fail "$label" "expected HTTP $want, got $STATUS · body: $(printf '%s' "$BODY" | head -c 200)"
  return 1
}

section() { printf "\n\033[1m▸ %s\033[0m\n" "$1"; }

# ── 1. Health & auth ────────────────────────────────────────────────────
section "Health & auth"

last "$(api GET /api/health)"
[[ "$STATUS" == "200" ]] && ok "GET /api/health" || fail "GET /api/health" "HTTP $STATUS"

# Bad credentials → 401
last "$(api POST /api/auth/login '{"username":"definitely-not-real","password":"wrong-pass-123"}')"
expect_status "POST /api/auth/login (bad creds → 401)" "401"

# Real login
last "$(api POST /api/auth/login "$(jq -n --arg u "$USERNAME" --arg p "$PASSWORD" '{username:$u,password:$p}')")" '.token'
if [[ "$STATUS" == "200" && "$VAL" != "null" && -n "$VAL" ]]; then
  TOKEN="$VAL"
  ok "POST /api/auth/login (admin)"
else
  fail "POST /api/auth/login (admin)" "HTTP $STATUS · body: $(printf '%s' "$BODY" | head -c 200)"
  echo "Cannot continue without an admin token." >&2
  exit 1
fi

last "$(api GET /api/auth/me)" '.user.role'
if [[ "$VAL" == "admin" ]]; then ok "GET /api/auth/me (role=admin)"; else fail "GET /api/auth/me" "role=$VAL"; fi

# Password policy: weak password should be rejected on change-password
last "$(api PUT /api/auth/change-password '{"current_password":"placeholder","new_password":"short"}')"
expect_status "PUT /api/auth/change-password (weak pw → 400)" "400"

# ── 2. Token error branches ─────────────────────────────────────────────
section "Token error branches"

SAVED_TOKEN="$TOKEN"
TOKEN="not-a-real-token"
last "$(api GET /api/products)" '.code'
if [[ "$STATUS" == "401" && "$VAL" == "TOKEN_INVALID" ]]; then
  ok "GET /api/products with bad token → TOKEN_INVALID"
else
  fail "GET /api/products with bad token" "HTTP $STATUS · code: $VAL"
fi
TOKEN="$SAVED_TOKEN"

# Public register may NOT escalate to admin
last "$(api POST /api/auth/register '{"username":"never-created","password":"Password123!","full_name":"x","email":"x@x.x","role":"admin"}')"
expect_status "POST /api/auth/register role=admin (→ 403)" "403"

# ── 3. Read endpoints reach the DB ──────────────────────────────────────
section "Read endpoints"

for path in \
  "/api/products" \
  "/api/categories" \
  "/api/suppliers" \
  "/api/locations" \
  "/api/locations/summary" \
  "/api/locations/inventory-matrix" \
  "/api/batches" \
  "/api/batches/expiring" \
  "/api/orders" \
  "/api/adjustments" \
  "/api/transfers" \
  "/api/reason-codes" \
  "/api/reports/dashboard" \
  "/api/reports/low-stock" \
  "/api/reports/expiring" \
  "/api/reports/stock-summary" \
  "/api/reports/movement-log" \
  "/api/dashboard/urgent-batches" \
  "/api/notifications" \
  "/api/users" \
  "/api/activity-logs" \
  "/api/activity-logs/facets"
do
  last "$(api GET "$path")"
  expect_ok "GET $path"
done

# Filtered reason-codes (used by the Adjustments form)
last "$(api GET '/api/reason-codes?type=INCREASE')"
expect_ok "GET /api/reason-codes?type=INCREASE"

# ── 4. Verify the location-SKU model ────────────────────────────────────
section "Location-SKU model"

# Pick the first product that currently has stock at any location.
last "$(api GET /api/products)"
PRODUCT_ID="$(printf '%s' "$BODY" | jq -r '[.data[] | select(.total_stock // .location_stock // 0 | tonumber > 0)][0].id // .data[0].id')"
PRODUCT_NAME="$(printf '%s' "$BODY" | jq -r --arg id "$PRODUCT_ID" '.data[] | select(.id==($id|tonumber)).name')"

if [[ -z "$PRODUCT_ID" || "$PRODUCT_ID" == "null" ]]; then
  fail "Find a product to inspect" "/api/products returned no rows"
else
  ok "Found product to inspect: $PRODUCT_NAME (id=$PRODUCT_ID)"

  last "$(api GET "/api/products/$PRODUCT_ID")"
  CUR_SKU="$(printf '%s' "$BODY" | jq -r '.data.current_sku // empty')"
  BASE_SKU="$(printf '%s' "$BODY" | jq -r '.data.sku // empty')"
  if [[ -n "$CUR_SKU" ]]; then
    ok "GET /api/products/:id exposes current_sku ($CUR_SKU; base=$BASE_SKU)"
  else
    fail "GET /api/products/:id current_sku" "missing field"
  fi

  last "$(api GET "/api/products/$PRODUCT_ID/stock")"
  expect_ok "GET /api/products/:id/stock"
fi

# ── 5. Adjust-stock round-trip (admin-only) ─────────────────────────────
section "Adjust-stock round-trip"

if [[ -n "${PRODUCT_ID:-}" && "$PRODUCT_ID" != "null" ]]; then
  # Find a (product, location) row with positive qty so we can bump by 1 then back.
  last "$(api GET "/api/products/$PRODUCT_ID/stock")"
  LOC_ID="$(printf '%s' "$BODY" | jq -r '[.data[] | select(.quantity|tonumber > 0)][0].location_id // empty')"
  START_QTY="$(printf '%s' "$BODY" | jq -r '[.data[] | select(.quantity|tonumber > 0)][0].quantity // 0')"

  if [[ -n "$LOC_ID" ]]; then
    PLUS_ONE=$((START_QTY + 1))
    BODY_JSON="$(jq -n --argjson loc "$LOC_ID" --argjson q "$PLUS_ONE" '{changes:[{location_id:$loc,target_quantity:$q}]}')"
    last "$(api POST "/api/products/$PRODUCT_ID/adjust-stock" "$BODY_JSON")"
    expect_ok "POST /api/products/:id/adjust-stock (+1)"

    # Verify
    last "$(api GET "/api/products/$PRODUCT_ID/stock")"
    NEW_QTY="$(printf '%s' "$BODY" | jq -r --arg lid "$LOC_ID" '.data[] | select(.location_id==($lid|tonumber)).quantity')"
    if [[ "$NEW_QTY" == "$PLUS_ONE" ]]; then
      ok "Stock incremented to $NEW_QTY at location $LOC_ID"
    else
      fail "Stock increment verification" "want $PLUS_ONE, got $NEW_QTY"
    fi

    # Roll back to original
    BODY_JSON="$(jq -n --argjson loc "$LOC_ID" --argjson q "$START_QTY" '{changes:[{location_id:$loc,target_quantity:$q}]}')"
    last "$(api POST "/api/products/$PRODUCT_ID/adjust-stock" "$BODY_JSON")"
    expect_ok "POST /api/products/:id/adjust-stock (rollback)"

    # Negative test: refuse below 0
    BODY_JSON="$(jq -n --argjson loc "$LOC_ID" '{changes:[{location_id:$loc,target_quantity:-5}]}')"
    last "$(api POST "/api/products/$PRODUCT_ID/adjust-stock" "$BODY_JSON")"
    expect_status "adjust-stock with negative target → 400" "400"
  else
    fail "Adjust-stock round-trip" "no (product,location) with qty>0 found"
  fi
fi

# ── 6. Activity log captures recent writes ──────────────────────────────
section "Activity log"

last "$(api GET '/api/activity-logs?limit=5')"
RECENT_COUNT="$(printf '%s' "$BODY" | jq -r '.data | length')"
if [[ "$RECENT_COUNT" -ge 1 ]]; then
  ok "Activity log has $RECENT_COUNT recent entries"
else
  fail "Activity log read" "no entries returned"
fi

# Facets should expose distinct actions/entity types from the log.
last "$(api GET '/api/activity-logs/facets')" '.data.actions | length'
if [[ "$VAL" =~ ^[0-9]+$ ]] && [[ "$VAL" -gt 0 ]]; then
  ok "Activity log facets ($VAL distinct actions)"
else
  fail "Activity log facets" "actions length = $VAL"
fi

# ── 7. Optional cleanup ─────────────────────────────────────────────────
if [[ "$CLEANUP" == "1" ]]; then
  section "Cleanup"
  echo "  (nothing to clean — adjust-stock round-trip already restored stock)"
fi

# ── Summary ─────────────────────────────────────────────────────────────
printf "\n\033[1mResults:\033[0m \033[32m%d passed\033[0m, \033[31m%d failed\033[0m\n" "$PASS" "$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  printf "\nFailed checks:\n"
  for name in "${FAILED_NAMES[@]}"; do
    printf "  - %s\n" "$name"
  done
  exit 1
fi
