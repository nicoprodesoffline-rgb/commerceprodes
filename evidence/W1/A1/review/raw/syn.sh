#!/bin/bash
cd /Users/nico/Desktop/prodes-w1/review-a1
SCR=/private/tmp/claude-501/-Users-nico-Desktop-prodes-data-factory-poc/59d02b74-f20c-445d-87e2-ad7a5f23288d/scratchpad
R=$(mktemp -d $SCR/synrepo.XXXXXX); g() { git -C $R -c user.name=t -c user.email=t@x.invalid -c commit.gpgsign=false -c core.hooksPath=/dev/null "$@"; }
g init -q; for f in c0/python/m.py c0/ts/src/a.ts c0/ts/test/a.test.ts c0/fixtures/V.json c0/ts/package.json c0/ts/tsconfig.json c0/ts/package-lock.json c0/README.md; do mkdir -p $R/$(dirname $f); echo $f > $R/$f; done
g add -A; g commit -qm gel; GEL=$(g rev-parse HEAD)
for f in c0/python/m.py c0/ts/test/a.test.ts c0/fixtures/V.json c0/ts/src/a.ts c0/ts/package.json; do
  g checkout -q $GEL; echo changed >> $R/$f; g commit -qam "chg $f"; C=$(g rev-parse HEAD)
  D=$(mktemp -d $SCR/syn_d.XXXXXX); out=$(node scripts/c0/sync.mjs --factory $R --sha $C --frozen-sha $GEL --dest $D 2>&1); st=$?
  echo "== modif seule de $f -> exit=$st | $(echo "$out" | head -1 | cut -c1-60) | dest=[$(ls -A $D)]"
done
# fichier nouveau dans c0/ts/src au SHA archivé (ajout)
g checkout -q $GEL; echo n > $R/c0/ts/src/new.ts; g add -A; g commit -qm add; C=$(g rev-parse HEAD)
D=$(mktemp -d $SCR/syn_d.XXXXXX); out=$(node scripts/c0/sync.mjs --factory $R --sha $C --frozen-sha $GEL --dest $D 2>&1); echo "== ajout c0/ts/src/new.ts -> exit=$? | $(echo "$out"|head -1|cut -c1-60) | dest=[$(ls -A $D)]"
# lien symbolique et exécutable au SHA archivé
g checkout -q $GEL; ln -s ../../../etc/hosts $R/c0/fixtures/lnk; g add -A; g commit -qm lnk; C=$(g rev-parse HEAD)
D=$(mktemp -d $SCR/syn_d.XXXXXX); out=$(node scripts/c0/sync.mjs --factory $R --sha $C --dest $D 2>&1); echo "== symlink dans c0/fixtures (sans gel distinct) -> exit=$? | $(echo "$out"|head -1|cut -c1-90) | dest=[$(ls -A $D)]"
g checkout -q $GEL; chmod +x $R/c0/fixtures/V.json; g commit -qam exec; C=$(g rev-parse HEAD)
D=$(mktemp -d $SCR/syn_d.XXXXXX); out=$(node scripts/c0/sync.mjs --factory $R --sha $C --dest $D 2>&1); echo "== bit exécutable (100755) -> exit=$? | $(echo "$out"|head -1|cut -c1-90) | dest=[$(ls -A $D)]"
