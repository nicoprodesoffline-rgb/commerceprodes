#!/bin/sh
# Rejeu des gates BC3. Usage : sh evidence/W1/BC3/raw/replay_gates.sh   (depuis la racine du worktree)
# Bases : prodes_site_bc3_test ; ports : 3361 (boutique), 3362 (A2), 3363 (BC4 HTTP). Aucune base ni port d'un autre lot.
R=evidence/W1/BC3/raw
TDB=postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_bc3_test
{ git rev-parse HEAD; git status --short; node -v; } > $R/git_state.txt
ls -a | grep -E '^\.env' > $R/env_files.txt; echo "exit=$? (1 = aucun .env*)" >> $R/env_files.txt
env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 npm run build > $R/build.txt 2>&1; echo "exit=$?" >> $R/build.txt
npm run typecheck > $R/typecheck.txt 2>&1; echo "exit=$?" >> $R/typecheck.txt
npm run c0:check > $R/c0_check.txt 2>&1; echo "exit=$?" >> $R/c0_check.txt
npm run c0:build > $R/c0_build.txt 2>&1 && npm run c0:test > $R/c0_test.txt 2>&1; echo "exit=$?" >> $R/c0_test.txt
npm run c0:check > $R/c0_check_after_build.txt 2>&1; echo "exit=$?" >> $R/c0_check_after_build.txt
npm run c0:vendor-test > $R/c0_vendor_test.txt 2>&1; echo "exit=$?" >> $R/c0_vendor_test.txt
npm run agent-ops:test > $R/agent_ops_test.txt 2>&1; echo "exit=$?" >> $R/agent_ops_test.txt
SITE_TEST_DATABASE_URL=$TDB SITE_TEST_PORT=3361 npm run test:storefront > $R/test_storefront_3361.txt 2>&1; echo "exit=$?" >> $R/test_storefront_3361.txt
SITE_TEST_PORT=3362 npm run test:http > $R/http_a2_site_test_3362.txt 2>&1; echo "exit=$?" >> $R/http_a2_site_test_3362.txt
npm run bc2:build > /dev/null 2>&1 && SITE_TEST_DATABASE_URL=$TDB node --test --test-concurrency=1 "tests/bc2/*.test.mjs" > $R/test_bc2_on_bc3_db.txt 2>&1; echo "exit=$?" >> $R/test_bc2_on_bc3_db.txt
SITE_TEST_DATABASE_URL=$TDB npm run test:bc4 > $R/test_bc4_on_bc3_db.txt 2>&1; echo "exit=$?" >> $R/test_bc4_on_bc3_db.txt
SITE_TEST_DATABASE_URL=$TDB SITE_TEST_PORT=3363 npm run test:bc4:http > $R/test_bc4_http_3363.txt 2>&1; echo "exit=$?" >> $R/test_bc4_http_3363.txt
for p in 3361 3362 3363; do (curl -s -m 1 -o /dev/null -w "port $p : %{http_code}\n" http://127.0.0.1:$p/ || echo "port $p : libre") ; done > $R/ports_after.txt 2>&1
for f in $R/*.txt; do printf "%-45s %s | %s\n" "$(basename $f)" "$(grep -E '^exit=' $f | tail -1)" "$(grep -E '^# (pass|fail|skipped) ' $f | tr '\n' ' ')"; done > $R/summary.txt
