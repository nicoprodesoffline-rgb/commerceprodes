#!/bin/bash
cd /Users/nico/Desktop/prodes-w1/review-a1
SCR=/private/tmp/claude-501/-Users-nico-Desktop-prodes-data-factory-poc/59d02b74-f20c-445d-87e2-ad7a5f23288d/scratchpad
F=/Users/nico/Desktop/prodes-data-factory-poc/.claude/worktrees/w1-candidate
GEL=b88f5cdf2ca64eca8de4d19c077262e11f9e7e54
tr() { git -C $F rev-parse -q --verify "${1}:${2}" 2>/dev/null; }
OLD=""; for c in $(git -C $F log --format=%H -- c0/ts/src c0/fixtures c0/ts/test | head -40); do
  t=$(tr $c c0/ts/src); [ -n "$t" ] && [ "$t" != "$(tr $GEL c0/ts/src)" ] && { OLD=$c; break; }; done
echo "OLD=$OLD src_tree=$(tr $OLD c0/ts/src) gel_src_tree=$(tr $GEL c0/ts/src)"
D=$(mktemp -d $SCR/sync_mm.XXXXXX); node scripts/c0/sync.mjs --factory $F --sha $OLD --frozen-sha $GEL --dest $D; echo "exit=$?"; echo "dest après refus: [$(ls -A $D)]"
PY=""; for c in $(git -C $F log --format=%H -n 120 -- c0/python); do
 p=$(tr $c c0/python); [ -n "$p" ] && [ "$p" != "$(tr $GEL c0/python)" ] && [ "$(tr $c c0/ts/src)" = "$(tr $GEL c0/ts/src)" ] && [ "$(tr $c c0/fixtures)" = "$(tr $GEL c0/fixtures)" ] && [ "$(tr $c c0/ts/test)" = "$(tr $GEL c0/ts/test)" ] && { PY=$c; break; }; done
echo "PY(python seul diffère)=${PY:-aucun}"; if [ -n "$PY" ]; then D3=$(mktemp -d $SCR/sync_py.XXXXXX); node scripts/c0/sync.mjs --factory $F --sha $PY --frozen-sha $GEL --dest $D3; echo "exit=$?"; echo "dest: [$(ls -A $D3)]"; fi
