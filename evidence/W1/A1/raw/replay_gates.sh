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
