#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
WORKDIR="$(cd "$(dirname "$0")/.." && pwd)"
COOKIE_JAR="$(mktemp -t prodes-admin-cookie.XXXXXX)"
trap 'rm -f "$COOKIE_JAR"' EXIT

if [ -z "${ADMIN_PASSWORD:-}" ] && [ -f "$WORKDIR/.env.local" ]; then
  # Parse only ADMIN_PASSWORD from .env.local (safe even if file has non-shell lines).
  admin_line="$(grep -E '^(export[[:space:]]+)?ADMIN_PASSWORD=' "$WORKDIR/.env.local" | tail -n 1 || true)"
  if [ -n "$admin_line" ]; then
    admin_value="${admin_line#*=}"
    admin_value="${admin_value%$'\r'}"
    admin_value="${admin_value#\"}"
    admin_value="${admin_value%\"}"
    admin_value="${admin_value#\'}"
    admin_value="${admin_value%\'}"
    ADMIN_PASSWORD="$admin_value"
    export ADMIN_PASSWORD
  fi
fi

if [ -z "${ADMIN_PASSWORD:-}" ]; then
  echo "[ERR] ADMIN_PASSWORD absent (.env.local)."
  exit 1
fi

pass_count=0
fail_count=0

report() {
  local status="$1"; shift
  local label="$*"
  if [ "$status" = "PASS" ]; then
    pass_count=$((pass_count + 1))
    printf "[PASS] %s\n" "$label"
  else
    fail_count=$((fail_count + 1))
    printf "[FAIL] %s\n" "$label"
  fi
}

expect_code() {
  local label="$1"
  local expected="$2"
  local code="$3"
  if [ "$code" = "$expected" ]; then
    report PASS "$label => $code"
  else
    report FAIL "$label => got $code expected $expected"
  fi
}

expect_one_of() {
  local label="$1"
  local allowed_csv="$2"
  local code="$3"
  IFS=',' read -r -a allowed <<< "$allowed_csv"
  for item in "${allowed[@]}"; do
    if [ "$code" = "$item" ]; then
      report PASS "$label => $code"
      return
    fi
  done
  report FAIL "$label => got $code expected one of [$allowed_csv]"
}

http_code() {
  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" "$@" || true)"
  if [ -z "$code" ]; then
    echo "000"
  else
    echo "$code"
  fi
}

# Unauthenticated gate checks
code="$(http_code "$BASE_URL/admin")"
expect_one_of "gate /admin without cookie" "307,200" "$code"

code="$(http_code "$BASE_URL/api/admin/products-list?page=0")"
expect_one_of "products-list without auth" "401,403" "$code"

# Login to admin cookie session
login_code="$(http_code \
  -c "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$ADMIN_PASSWORD\"}" \
  "$BASE_URL/api/admin/auth")"
expect_code "POST /api/admin/auth" "200" "$login_code"

# Backoffice pages with session cookie
pages=(
  "/admin"
  "/admin/catalogue"
  "/admin/categories"
  "/admin/contenu"
  "/admin/devis"
  "/admin/ia"
  "/admin/import"
  "/admin/paniers-abandonnes"
  "/admin/produits"
  "/admin/seo"
  "/admin/veille"
)

for path in "${pages[@]}"; do
  code="$(http_code -b "$COOKIE_JAR" "$BASE_URL$path")"
  expect_code "GET $path" "200" "$code"
done

# Authenticated API checks using Bearer token (admin API contract)
api_get=(
  "/api/admin/products-list?page=0&limit=5"
  "/api/admin/analytics"
  "/api/admin/competitive"
  "/api/admin/import-logs"
  "/api/admin/site-config"
  "/api/admin/testimonials"
  "/api/admin/ia/categories-list"
  "/api/admin/ia/audit"
  "/api/admin/ia/detect-duplicates"
  "/api/admin/ia/generate-descriptions?mode=list"
  "/api/admin/homepage-sections"
)

for path in "${api_get[@]}"; do
  code="$(http_code \
    -H "Authorization: Bearer $ADMIN_PASSWORD" \
    "$BASE_URL$path")"
  expect_code "GET $path" "200" "$code"
done

# Mutation endpoints with intentionally invalid payloads (expect 400, not 500)
code="$(http_code \
  -X POST \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR" \
  -d '{"ids":[],"status":"traite"}' \
  "$BASE_URL/api/admin/devis/bulk-status")"
expect_code "POST /api/admin/devis/bulk-status invalid payload" "400" "$code"

code="$(http_code \
  -X PATCH \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR" \
  -d '{"ids":[],"status":"traite"}' \
  "$BASE_URL/api/admin/devis/bulk-status")"
expect_code "PATCH /api/admin/devis/bulk-status invalid payload" "400" "$code"

code="$(http_code \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_PASSWORD" \
  -d '{"ids":[],"action":"publish"}' \
  "$BASE_URL/api/admin/products/bulk")"
expect_code "POST /api/admin/products/bulk invalid payload" "400" "$code"

code="$(http_code \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_PASSWORD" \
  -d '{"webhook":"unknown"}' \
  "$BASE_URL/api/admin/trigger-webhook")"
expect_one_of "POST /api/admin/trigger-webhook invalid webhook" "400,404" "$code"

code="$(http_code \
  -X POST \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR" \
  -d '{"webhook":"descriptions"}' \
  "$BASE_URL/api/admin/trigger-webhook")"
expect_code "POST /api/admin/trigger-webhook known webhook (degraded allowed)" "200" "$code"

echo "---"
echo "Backoffice smoke summary: PASS=$pass_count FAIL=$fail_count"

if [ "$fail_count" -gt 0 ]; then
  exit 1
fi
