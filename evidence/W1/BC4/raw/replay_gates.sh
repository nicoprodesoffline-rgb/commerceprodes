#!/bin/bash
# Rejeu des gates BC4 sur le SHA courant (Mac local, PostgreSQL 18 port 54318, bases prodes_site_bc4*).
# Base : SITE_TEST_DATABASE_URL (défaut prodes_site_bc4_test) ; port HTTP : SITE_TEST_PORT (défaut 3351) (les tests HTTP A2 sont rejoués sur une copie temporaire dont seul PORT change).
set -uo pipefail
cd "$(dirname "$0")/../../../.."
OUT=evidence/W1/BC4/raw
DB=${SITE_TEST_DATABASE_URL:-postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_bc4_test}
{ echo "sha=$(git rev-parse HEAD)"; echo "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; echo "node=$(node --version)"; psql -X -At "${SITE_TEST_DATABASE_URL:-postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_bc4_test}" -c "select version()"; } > $OUT/env.txt 2>&1
scripts/db/create-local.sh prodes_site_bc4 prodes_site_bc4_test > $OUT/create_local.txt 2>&1
SITE_DATABASE_URL=postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_bc4 node scripts/db/migrate.mjs > $OUT/migrate_dev.txt 2>&1
# Idempotence : second passage → tout « skip », applied=0.
SITE_DATABASE_URL=postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_bc4 node scripts/db/migrate.mjs > $OUT/migrate_dev_again.txt 2>&1; echo "exit=$?" >> $OUT/migrate_dev_again.txt
npm run c0:check > $OUT/c0_check.txt 2>&1; echo "exit=$?" >> $OUT/c0_check.txt
npm run typecheck > $OUT/typecheck.txt 2>&1; echo "exit=$?" >> $OUT/typecheck.txt
env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 npm run build > $OUT/build.txt 2>&1; echo "exit=$?" >> $OUT/build.txt
npm run test:bc4 > $OUT/test_bc4.txt 2>&1; echo "exit=$?" >> $OUT/test_bc4.txt
npm run test:bc4:http > $OUT/test_bc4_http.txt 2>&1; echo "exit=$?" >> $OUT/test_bc4_http.txt
# Suite BC2 inchangée, rejouée sur la base BC4 de test (jamais prodes_site_bc2_test : aucune base partagée).
npm run bc2:build > /dev/null 2>&1
SITE_TEST_DATABASE_URL=$DB node --test --test-concurrency=1 tests/bc2/*.test.mjs > $OUT/test_bc2_on_bc4_db.txt 2>&1; echo "exit=$?" >> $OUT/test_bc2_on_bc4_db.txt
# Tests HTTP A2 inchangés, port 3341 → 3351 sur une copie temporaire (même dossier pour les chemins relatifs).
COPY=tests/http/.site.port3351.tmp.test.mjs
sed "s/^const PORT = 3341;\$/const PORT = ${SITE_TEST_PORT:-3351};/" tests/http/site.test.mjs > $COPY
diff tests/http/site.test.mjs $COPY > $OUT/test_http_a2_port_diff.txt
node --test $COPY > $OUT/test_http_a2_port3351.txt 2>&1; echo "exit=$?" >> $OUT/test_http_a2_port3351.txt
rm -f $COPY
npm run c0:vendor-test > $OUT/c0_vendor_test.txt 2>&1; echo "exit=$?" >> $OUT/c0_vendor_test.txt
(npm run c0:build && npm run c0:test) > $OUT/c0_ts_test.txt 2>&1; echo "exit=$?" >> $OUT/c0_ts_test.txt
for f in migrate_dev_again c0_check typecheck build test_bc4 test_bc4_http test_bc2_on_bc4_db test_http_a2_port3351 c0_vendor_test c0_ts_test; do
  printf '%-24s %s %s\n' "$f" "$(tail -1 $OUT/$f.txt)" "$(grep -E '^# (pass|fail) ' $OUT/$f.txt | tr '\n' ' ')"
done | tee $OUT/summary.txt
