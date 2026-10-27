#!/bin/bash
# Rejeu BC3 cycle de correction 2 (I1 D-02/D-03/D-04), depuis la racine du worktree, arbre propre.
#   bash evidence/W1/BC3/raw/cycle2/replay_cycle2.sh
# Bases (toutes BC3 cycle 2) : prodes_site_bc3c2_test (suites), _smoke (http-smoke, vide), _limits (http-body-limits),
# _probe_test (sonde), _ui (navigateur). Ports : 3367 (suites et serveurs lancés ici), 3368 (A2 test:http, navigateur).
# Chaque serveur lancé ici est arrêté par SON PID ; aucun kill global.
set -u
R=evidence/W1/BC3/raw/cycle2
PG=postgres://prodes_site:local-dev-only@localhost:54318
TDB=$PG/prodes_site_bc3c2_test
PW=/Users/nico/.npm/_npx/e41f203b7505f1fb/node_modules
CHR="/Users/nico/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
AXE=/Users/nico/.config/superpowers/worktrees/commerce/codex-catalog-pagination/node_modules/axe-core/axe.min.js
SHA=$(git rev-parse HEAD)
hdr() { echo "# SHA=$SHA $(date -u +%FT%TZ) — $1"; }
run() { local f=$R/$1.txt; shift; { hdr "$*"; echo "\$ $*"; "$@"; echo "exit=$?"; } > $f 2>&1; }

{ git rev-parse HEAD; git status --short; node -v; npx --no-install next --version 2>/dev/null; } > $R/git_state.txt 2>&1
ls -a | grep -E '^\.env' > $R/env_files.txt; echo "exit=$? (1 = aucun .env*)" >> $R/env_files.txt

# État propre
{ hdr "rm -rf node_modules .next c0/ts/dist && npm ci"; rm -rf node_modules .next c0/ts/dist .bc2-build .bc4-build; npm ci; echo "exit=$?"; } > $R/npm_ci.txt 2>&1
{ hdr "build sous env -i"; env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 npm run build; echo "exit=$?"; } > $R/build.txt 2>&1
python3 -c "import json;print(json.dumps(json.load(open('.next/server/functions-config-manifest.json'))['functions']['/_middleware'],indent=1))" > $R/proxy_matcher_compiled.txt 2>&1
run typecheck npm run typecheck
run c0_check npm run c0:check
run c0_build_test sh -c "npm run c0:build && npm run c0:test"
run c0_check_after_build npm run c0:check
run c0_vendor_test npm run c0:vendor-test

# Suites (bases BC3 cycle 2)
run test_storefront_3367 env SITE_TEST_DATABASE_URL=$TDB SITE_TEST_PORT=3367 npm run test:storefront
run test_http_a2_3368 env SITE_TEST_PORT=3368 npm run test:http
run test_bc2 env SITE_TEST_DATABASE_URL=$TDB npm run test:bc2
run test_bc4 env SITE_TEST_DATABASE_URL=$TDB npm run test:bc4
run test_bc4_http_3367 env SITE_TEST_DATABASE_URL=$TDB SITE_TEST_PORT=3367 npm run test:bc4:http
run test_ui_playwright_3368 env PLAYWRIGHT_DIR=$PW CHROMIUM="$CHR" UI_OUT=$R/ui AXE=$AXE SITE_TEST_DATABASE_URL=prodes_site_bc3c2_ui SITE_TEST_PORT=3368 node --test --test-concurrency=1 tests/ui/storefront.ui.mjs

# Serveur réel 3367 (mêmes variables que la recette I1), lancé et arrêté par PID
start() {  # $1 = base
  curl -s -m 1 -o /dev/null http://127.0.0.1:3367/ && { echo "PORT 3367 OCCUPÉ"; return 1; }
  env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production SITE_DATABASE_URL=$PG/$1 SITE_ENV=staging \
    SITE_KEYRING_PATH=$PWD/c0/fixtures/keys/test_keyring.json SITE_ACK_KEY_ID=c0-test-ack-01 SITE_CATALOG_SOURCE=db \
    SITE_BUSINESS_PERSISTENCE=postgresql SITE_WITHDRAWAL_HOLD_POLICY='{"max_withdrawals_without_release":null,"released_expected_withdrawals_digest":null}' \
    node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3367 > $R/server_$1.log 2>&1 &
  SPID=$!
  for i in $(seq 1 60); do curl -s -m 1 -o /dev/null http://127.0.0.1:3367/favicon.ico && break; sleep 0.5; done
  echo "$(date -u +%FT%TZ) START pid=$SPID db=$1" >> $R/pids.log
}
stop() {
  kill $SPID 2>/dev/null; for i in $(seq 1 40); do kill -0 $SPID 2>/dev/null || break; sleep 0.25; done
  kill -0 $SPID 2>/dev/null && kill -9 $SPID
  echo "$(date -u +%FT%TZ) STOP pid=$SPID port3367=$(curl -s -m 1 -o /dev/null -w '%{http_code}' http://127.0.0.1:3367/ || true)" >> $R/pids.log
}
: > $R/pids.log
scripts/db/create-local.sh --recreate prodes_site_bc3c2_smoke prodes_site_bc3c2_limits prodes_site_bc3c2_probe_test > $R/db_setup.txt 2>&1
for db in prodes_site_bc3c2_smoke prodes_site_bc3c2_limits prodes_site_bc3c2_probe_test; do SITE_DATABASE_URL=$PG/$db node scripts/db/migrate.mjs >> $R/db_setup.txt 2>&1; echo "migrate $db exit=$?" >> $R/db_setup.txt; done

start prodes_site_bc3c2_smoke
run http_bc2_smoke env BASE_URL=http://127.0.0.1:3367 SITE_DEV_DATABASE_URL=$PG/prodes_site_bc3c2_smoke SERVER_PID=$SPID node tests/bc2/http-smoke.mjs
stop
start prodes_site_bc3c2_limits
run http_bc2_body_limits env BASE_URL=http://127.0.0.1:3367 SITE_DEV_DATABASE_URL=$PG/prodes_site_bc3c2_limits SERVER_PID=$SPID node tests/bc2/http-body-limits.mjs
stop
start prodes_site_bc3c2_probe_test
run probe_legit_machine_bodies env BASE_URL=http://127.0.0.1:3367 SITE_TEST_DATABASE_URL=$PG/prodes_site_bc3c2_probe_test node tests/http/machine-routes-probe.mjs
{ echo "# lignes « Request body exceeded » dans les journaux serveur de ce rejeu (attendu 0)"; grep -c "Request body exceeded" $R/server_*.log; } > $R/server_logs_truncation_grep.txt 2>&1
stop

for p in 3367 3368; do (curl -s -m 1 -o /dev/null -w "port $p : %{http_code}\n" http://127.0.0.1:$p/ || echo "port $p : libre") ; done > $R/ports_after.txt 2>&1
for f in $R/*.txt; do printf "%-38s %s | %s\n" "$(basename $f)" "$(grep -E '^exit=' $f | tail -1)" "$(grep -E '^# (tests|pass|fail|skipped) |^# (HTTP BC2|LIMITES BC2|SONDE)' $f | tr '\n' ' ')"; done > $R/summary.txt
cat $R/summary.txt
