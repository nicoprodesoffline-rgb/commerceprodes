#!/bin/bash
cd /Users/nico/Desktop/prodes-w1/review-a1
SCR=/private/tmp/claude-501/-Users-nico-Desktop-prodes-data-factory-poc/59d02b74-f20c-445d-87e2-ad7a5f23288d/scratchpad
F=/Users/nico/Desktop/prodes-data-factory-poc/.claude/worktrees/w1-candidate
S() { node scripts/c0/sync.mjs "$@"; }
echo "##### S1 re-sync indépendant (7a5ac012, gel b88f5cdf) vers dest temporaire, comparé à l'arbre commité"
D=$(mktemp -d $SCR/sync1.XXXXXX); S --factory $F --sha 7a5ac0120d808c2f08d3be7d6f935eb8388afba8 --frozen-sha b88f5cdf2ca64eca8de4d19c077262e11f9e7e54 --dest $D; echo exit=$?
cmp $D/c0/C0_SOURCE.json c0/C0_SOURCE.json && echo "MANIFESTE IDENTIQUE octet pour octet"
diff -r -q -x dist -x node_modules $D/c0 c0 && echo "ARBRE IDENTIQUE"
node scripts/c0/check.mjs --root $D | cut -c1-110; ls -A $D
echo; echo "##### S2 --sha dont c0/ts/src diffère du gel"
OLD=$(git -C $F log --format=%H -n 1 b88f5cdf~1 -- c0/ts/src); echo "old=${OLD} src_tree=$(git -C $F rev-parse ${OLD}:c0/ts/src) gel_src_tree=$(git -C $F rev-parse b88f5cdf:c0/ts/src)"
D=$(mktemp -d $SCR/sync2.XXXXXX); S --factory $F --sha $OLD --frozen-sha b88f5cdf2ca64eca8de4d19c077262e11f9e7e54 --dest $D; echo exit=$?; echo "dest après refus:"; ls -A $D
echo; echo "##### S2b HEAD du worktree Factory (970588da) vs gel"
D=$(mktemp -d $SCR/sync2b.XXXXXX); S --factory $F --sha $(git -C $F rev-parse HEAD) --frozen-sha b88f5cdf2ca64eca8de4d19c077262e11f9e7e54 --dest $D 2>&1 | cut -c1-160; echo "exit=${PIPESTATUS[0]}"
echo; echo "##### S3 SHA abrégé"; S --factory $F --sha 7a5ac012 --dest $SCR/nonexist; echo exit=$?
echo; echo "##### S4 SHA gelé inexistant"; D=$(mktemp -d $SCR/sync4.XXXXXX); S --factory $F --sha 7a5ac0120d808c2f08d3be7d6f935eb8388afba8 --frozen-sha 1111111111111111111111111111111111111111 --dest $D; echo exit=$?; ls -A $D
echo; echo "##### S5 --sha inexistant"; S --factory $F --sha 2222222222222222222222222222222222222222 --dest $D; echo exit=$?
echo; echo "##### S6 --factory pas un dépôt"; S --factory /tmp --sha 7a5ac0120d808c2f08d3be7d6f935eb8388afba8 --dest $D 2>&1 | head -3; echo "exit=${PIPESTATUS[0]}"
echo; echo "##### S7 option inconnue / valeur manquante"; S --factory $F --sha; echo exit=$?; S --bogus x; echo exit=$?
echo; echo "##### S8 SHA majuscules (b88f5cdf, valide)"; D=$(mktemp -d $SCR/sync8.XXXXXX); S --factory $F --sha B88F5CDF2CA64EC40F1D6BFB6B3E16E5C4D3F5A6 --dest $D 2>&1 | head -2
echo; echo "##### S9 dest avec c0 préexistant (dist/ + parasite) : remplacement complet"
D=$(mktemp -d $SCR/sync9.XXXXXX); mkdir -p $D/c0/ts/dist $D/c0/zz; echo x > $D/c0/zz/parasite.txt; echo y > $D/c0/ts/dist/old.js
S --factory $F --sha b88f5cdf2ca64eca8de4d19c077262e11f9e7e54 --dest $D | cut -c1-150; echo exit=$?; ls $D/c0 $D/c0/ts; node scripts/c0/check.mjs --root $D | cut -c1-100
echo; echo "##### S10 couple python-only: sha dont c0/python diffère mais ts identique"
for c in $(git -C $F log --format=%H -n 40 b88f5cdf~1 -- c0/python); do if [ "$(git -C $F rev-parse $c:c0/ts/src)" = "$(git -C $F rev-parse b88f5cdf:c0/ts/src)" ] && [ "$(git -C $F rev-parse $c:c0/fixtures)" = "$(git -C $F rev-parse b88f5cdf:c0/fixtures)" ] && [ "$(git -C $F rev-parse $c:c0/ts/test)" = "$(git -C $F rev-parse b88f5cdf:c0/ts/test)" ]; then echo "python-only candidate $c"; D=$(mktemp -d $SCR/sync10.XXXXXX); S --factory $F --sha $c --frozen-sha b88f5cdf2ca64eca8de4d19c077262e11f9e7e54 --dest $D; echo exit=$?; break; fi; done
echo "(fin S10)"
