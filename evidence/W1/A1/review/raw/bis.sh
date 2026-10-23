#!/bin/bash
cd /Users/nico/Desktop/prodes-w1/review-a1
SCR=/private/tmp/claude-501/-Users-nico-Desktop-prodes-data-factory-poc/59d02b74-f20c-445d-87e2-ad7a5f23288d/scratchpad
mk() { T=$(mktemp -d $SCR/bis.XXXXXX); rsync -a --exclude dist --exclude node_modules c0 $T/; echo $T; }
flip() { node -e 'const fs=require("fs");const f=process.argv[1];const b=fs.readFileSync(f);b[b.length-5]^=1;fs.writeFileSync(f,b)' "$1"; }
echo "##### A2bis (remplace A2, dd no-op) : un bit inversé dans c0/fixtures/media/simple_family.png"; T=$(mk); flip $T/c0/fixtures/media/simple_family.png; node scripts/c0/check.mjs --root $T 2>&1 | cut -c1-150; echo "exit=${PIPESTATUS[0]}"
echo "##### A21 : un bit inversé dans documents/F_SIMPLE_READY/snapshot_s1.json"; T=$(mk); flip $T/c0/fixtures/documents/F_SIMPLE_READY/snapshot_s1.json; node scripts/c0/check.mjs --root $T 2>&1 | cut -c1-150; echo "exit=${PIPESTATUS[0]}"
echo "##### A22 : copie d'un cas dans c0/fixtures/cases/dist/ (consommée par le runner TS, invisible pour check.mjs)"; T=$(mk); mkdir -p $T/c0/fixtures/cases/dist; cp c0/fixtures/cases/C_CANONICAL/astral_key_order.json $T/c0/fixtures/cases/dist/hidden_copy.json
node scripts/c0/check.mjs --root $T | cut -c1-110; echo "check_exit=${PIPESTATUS[0]}"
node_modules/.bin/tsc -p $T/c0/ts/tsconfig.json && (cd $T && node --test "c0/ts/dist/test/*.test.js" 2>&1 | grep -E "^# (tests|pass|fail)|^not ok")
