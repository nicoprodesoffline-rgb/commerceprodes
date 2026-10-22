#!/bin/bash
set -o pipefail
C="$1"; F="$2"; R="$C/evidence/W1/A1/raw"; cd "$C" || exit 2
SHA=$(git rev-parse HEAD); H="# $(date -u +%FT%TZ) commit testé $SHA node $(node -v) npm $(npm -v)"
rm -rf node_modules .next c0/ts/dist
{ echo "$H"; npm ci --no-fund; echo "npm_ci_exit=$?"; } > $R/npm_ci.txt 2>&1
{ echo "$H"; npm ls next react react-dom typescript @types/react @types/react-dom; echo "npm_ls_exit=$?"; } > $R/npm_ls.txt 2>&1
npm audit --json > $R/npm_audit.json; echo "audit_exit=$? commit=$SHA" > $R/npm_audit_exit.txt
{ echo "$H"; npm audit; } > $R/npm_audit.txt 2>&1
{ echo "$H"; echo "# commande: env -i PATH HOME NEXT_TELEMETRY_DISABLED=1 npm run build ; fichiers .env* présents: $(ls -a | grep -c '^\.env')"; echo "# variables transmises: $(env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 env | cut -d= -f1 | tr '\n' ' ')"; env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 npm run build; echo "build_exit=$?"; } > $R/build.txt 2>&1
{ echo "$H"; npm run typecheck; echo "typecheck_exit=$?"; } > $R/typecheck.txt 2>&1
# HTTP 3321
[ -z "$(lsof -nP -iTCP:3321 -sTCP:LISTEN -t)" ] || { echo "port 3321 occupé" > $R/server_pid.txt; exit 3; }
env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3321 > $R/start_3321.txt 2>&1 &
PID=$!; echo "$H"$'\n'"commande: node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3321 (= npx next start, sans enveloppe npx pour tenir le PID)"$'\n'"server_pid=$PID" > $R/server_pid.txt
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:3321/ && break; sleep 0.5; done
echo "listener_pid: $(lsof -nP -iTCP:3321 -sTCP:LISTEN -t | tr '\n' ' ')" >> $R/server_pid.txt
{ echo "$H BASE_URL=http://127.0.0.1:3321 PHASE=default node spike/http-tests.mjs"; BASE_URL=http://127.0.0.1:3321 PHASE=default node spike/http-tests.mjs; echo "http_tests_exit=$?"; } > $R/http_tests_default_3321.txt 2>&1
kill $PID; wait $PID 2>/dev/null; echo "kill $PID -> wait status=$?" >> $R/server_pid.txt; sleep 1
echo "listener_after_kill: [$(lsof -nP -iTCP:3321 -sTCP:LISTEN -t | tr '\n' ' ')]" >> $R/server_pid.txt
norm(){ grep -E '^(PASS|FAIL) ' "$1"; }
{ echo "# diff spike/logs/http-tests-default.log (16.4.0, port 3311) vs run 3321"; diff <(norm spike/logs/http-tests-default.log) <(norm $R/http_tests_default_3321.txt); echo "diff_exit=$?"; } > $R/http_tests_diff_vs_spike.txt
# C0
{ echo "$H"; npm run c0:check; echo "c0_check_exit=$?"; } > $R/c0_check.txt 2>&1
{ echo "$H tsc $(npx tsc -v)"; npm run c0:build; echo "c0_build_exit=$?"; } > $R/c0_build.txt 2>&1
{ echo "$H"; npm run c0:test; echo "c0_test_exit=$?"; } > $R/c0_test.txt 2>&1
{ echo "$H"; npm run c0:vendor-test; echo "vendor_test_exit=$?"; } > $R/vendor_test.txt 2>&1
{ echo "$H"; npm run c0:check; echo "c0_check_after_build_exit=$?"; } >> $R/c0_check.txt 2>&1
{ echo "$H"; echo "Factory HEAD $(git -C "$F" rev-parse HEAD) (registre régénéré par npm run build && npm test dans c0/ts, dist/ ignoré)"; shasum -a 256 c0/ts/dist/verdicts.ts.json "$F/c0/ts/dist/verdicts.ts.json"; cmp c0/ts/dist/verdicts.ts.json "$F/c0/ts/dist/verdicts.ts.json" && echo "REGISTRES_IDENTIQUES_OCTET_POUR_OCTET"; echo "cmp_exit=$?"; echo "chemins absolus dans le registre Commerce: $(grep -c '/Users/' c0/ts/dist/verdicts.ts.json)"; echo "taille: $(wc -c < c0/ts/dist/verdicts.ts.json) octets"; } > $R/verdicts_parity.txt 2>&1
grep -hE "_exit=|exit=|PASS, |# (tests|pass|fail) |REGISTRES|C0_VENDOR|listener|found|sha256|^[0-9a-f]{64}" $R/*.txt
# --- ajouts correctif orchestrateur (archived_from 7a5ac012 / frozen b88f5cdf)
FROZEN=b88f5cdf2ca64eca8de4d19c077262e11f9e7e54; ARCH=7a5ac0120d808c2f08d3be7d6f935eb8388afba8
{ echo "$H refus attendu : --sha 84a49dcb (sans c0/) --frozen-sha $FROZEN"; node scripts/c0/sync.mjs --factory "$F" --sha $(git -C "$F" rev-parse 84a49dcb) --frozen-sha $FROZEN; echo "sync_exit=$?"; echo "git status --short c0 après (vide = rien écrit) : [$(git status --short c0)]"; } > $R/c0_sync_mismatch_84a49dcb.txt 2>&1
X=$(mktemp -d); git -C "$F" archive $ARCH c0/README.md c0/fixtures c0/ts/package-lock.json c0/ts/package.json c0/ts/src c0/ts/test c0/ts/tsconfig.json | tar -x -C $X
{ echo "$H contrôle indépendant : git archive brut $ARCH vs c0/ vendu (manifeste et dist exclus)"; diff -r -x C0_SOURCE.json -x dist "$X/c0" c0; echo "diff_exit=$?"; echo "fichiers: $(find $X/c0 -type f | wc -l | tr -d ' ')"; echo "## trees code aux deux SHA"; for p in c0/fixtures c0/python c0/ts/src c0/ts/test; do echo "$p archived=$(git -C "$F" rev-parse $ARCH:$p) frozen=$(git -C "$F" rev-parse $FROZEN:$p)"; done; } > $R/c0_independent_archive_diff.txt 2>&1; rm -rf $X
cp c0/C0_SOURCE.json $R/.m1; node scripts/c0/sync.mjs --factory "$F" --sha $ARCH --frozen-sha $FROZEN > $R/c0_sync_7a5ac012.txt 2>&1
{ echo "$H re-sync identique ?"; cmp $R/.m1 c0/C0_SOURCE.json && echo "manifeste identique"; echo "git status --short c0: [$(git status --short c0)]"; } > $R/c0_sync_idempotence.txt 2>&1; rm -f $R/.m1
{ echo "$H (après re-sync)"; npm run c0:check; echo "c0_check_after_resync_exit=$?"; } >> $R/c0_check.txt 2>&1
grep -hE "sync_exit|MISMATCH|diff_exit|archived=|identique|status --short" $R/c0_sync_mismatch_84a49dcb.txt $R/c0_independent_archive_diff.txt $R/c0_sync_idempotence.txt
