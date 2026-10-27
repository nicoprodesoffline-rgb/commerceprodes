#!/bin/sh
# Rejeu des gates W1/A2 depuis un état propre (node_modules, .next, c0/ts/dist supprimés).
# Usage : sh evidence/W1/A2/raw/replay_gates.sh  (depuis la racine du worktree)
set -u
R=evidence/W1/A2/raw
{ echo "HEAD $(git rev-parse HEAD)"; git status --short; node -v; npm -v; date -u +%Y-%m-%dT%H:%M:%SZ; } > $R/env.txt 2>&1
rm -rf node_modules .next c0/ts/dist
npm ci --no-audit --no-fund > $R/npm_ci.txt 2>&1; echo "exit=$?" >> $R/npm_ci.txt
env -i "PATH=$PATH" "HOME=$HOME" NEXT_TELEMETRY_DISABLED=1 npm run build > $R/build.txt 2>&1; echo "exit=$?" >> $R/build.txt
ls -a | grep '^\.env' > $R/env_files.txt 2>&1; echo "fichiers .env* : $(ls -a | grep -c '^\.env')" >> $R/env_files.txt
npm run typecheck > $R/typecheck.txt 2>&1; echo "exit=$?" >> $R/typecheck.txt
npm run c0:check > $R/c0_check.txt 2>&1; echo "exit=$?" >> $R/c0_check.txt
npm run c0:build > $R/c0_build.txt 2>&1; echo "exit=$?" >> $R/c0_build.txt
npm run c0:test > $R/c0_test.txt 2>&1; echo "exit=$?" >> $R/c0_test.txt
npm run c0:check >> $R/c0_check.txt 2>&1; echo "exit(après c0:build)=$?" >> $R/c0_check.txt
npm run c0:vendor-test > $R/c0_vendor_test.txt 2>&1; echo "exit=$?" >> $R/c0_vendor_test.txt
npm run agent-ops:test > $R/agent_ops_test.txt 2>&1; echo "exit=$?" >> $R/agent_ops_test.txt
npm run test:http > $R/http_site_test.txt 2>&1; echo "exit=$?" >> $R/http_site_test.txt
lsof -nP -iTCP:3341 -sTCP:LISTEN > $R/port_3341_after.txt 2>&1; echo "lsof exit=$? (1 = port libre)" >> $R/port_3341_after.txt
git diff --stat 918e5437 HEAD -- c0 > $R/c0_diff_vs_base.txt; echo "lignes de diff c0/ : $(wc -l < $R/c0_diff_vs_base.txt)" >> $R/c0_diff_vs_base.txt
