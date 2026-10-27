#!/bin/zsh
# usage: run from review-a1. Each case copies c0 (sans dist/node_modules) and runs check with --root.
cd /Users/nico/Desktop/prodes-w1/review-a1
SCR=/private/tmp/claude-501/-Users-nico-Desktop-prodes-data-factory-poc/59d02b74-f20c-445d-87e2-ad7a5f23288d/scratchpad
mk() { T=$(mktemp -d $SCR/case.XXXXXX); rsync -a --exclude dist --exclude node_modules c0 $T/; echo $T; }
run() { node scripts/c0/check.mjs --root "$1" 2>&1; echo "exit=$?"; }
t() { echo; echo "##### $1"; }

t "A1 témoin intact"; T=$(mk); run $T | head -3
t "A2 un octet altéré dans une fixture PNG"; T=$(mk); printf '\x00' | dd of=$T/c0/fixtures/media/simple_family.png bs=1 seek=20 conv=notrunc 2>/dev/null; run $T | head -4
t "A3 un octet altéré dans ts/src/signing.ts"; T=$(mk); sed -i '' '1s/^/ /' $T/c0/ts/src/signing.ts; run $T | head -4
t "A4 fichier ajouté c0/ts/src/extra.ts"; T=$(mk); echo 'export const x=1' > $T/c0/ts/src/extra.ts; run $T | head -4
t "A5 fichier supprimé du dossier"; T=$(mk); rm $T/c0/fixtures/identity_vectors.json; run $T | head -4
t "A6 clé supprimée du manifeste (files)"; T=$(mk); node -e '
const fs=require("fs");const p=process.argv[1]+"/c0/C0_SOURCE.json";const m=JSON.parse(fs.readFileSync(p));delete m.files["c0/fixtures/identity_vectors.json"];fs.writeFileSync(p,JSON.stringify(m,null,2));' $T; run $T | head -4
t "A7 manifeste forgé de façon cohérente (fixture modifiée + files + tree_digest recalculés)"; T=$(mk); node -e '
const fs=require("fs"),c=require("crypto");const root=process.argv[1];
const f=root+"/c0/fixtures/VERDICTS.json";fs.appendFileSync(f," ");
const p=root+"/c0/C0_SOURCE.json";const m=JSON.parse(fs.readFileSync(p));
m.files["c0/fixtures/VERDICTS.json"]=c.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const keys=Object.keys(m.files).sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
m.tree_digest=c.createHash("sha256").update(keys.map(k=>k+"\t"+m.files[k]+"\n").join("")).digest("hex");
fs.writeFileSync(p,JSON.stringify(m,null,2));' $T; run $T | head -4
t "A8 frozen_code_sha réécrit dans le manifeste (autre SHA valide)"; T=$(mk); sed -i '' 's/"frozen_code_sha": "[0-9a-f]*"/"frozen_code_sha": "0000000000000000000000000000000000000001"/' $T/c0/C0_SOURCE.json; run $T | head -3
t "A9 fichier caché dans c0/ts/src/node_modules/ (exclusion à toute profondeur)"; T=$(mk); mkdir -p $T/c0/ts/src/node_modules/evil; echo 'export const evil=1' > $T/c0/ts/src/node_modules/evil/index.ts; run $T | head -3
t "A10 fichier caché dans c0/fixtures/dist/"; T=$(mk); mkdir -p $T/c0/fixtures/dist; echo '{"forged":true}' > $T/c0/fixtures/dist/forged.json; run $T | head -3
t "A11 lien symbolique ajouté"; T=$(mk); ln -s /etc/hosts $T/c0/fixtures/link.json; run $T | head -4
t "A12 lien symbolique nommé dist"; T=$(mk); ln -s /tmp $T/c0/ts/src/dist; run $T | head -4
t "A13 dossier vide ajouté"; T=$(mk); mkdir $T/c0/fixtures/empty_dir; run $T | head -3
t "A14 bit exécutable changé (chmod +x)"; T=$(mk); chmod +x $T/c0/fixtures/VERDICTS.json; run $T | head -3
t "A15 manifeste supprimé"; T=$(mk); rm $T/c0/C0_SOURCE.json; run $T | head -3
t "A16 manifeste JSON invalide"; T=$(mk); echo '{' > $T/c0/C0_SOURCE.json; run $T | head -3
t "A17 c0 entier est un lien symbolique vers une copie"; T=$(mk); T2=$(mk); mv $T/c0 $T/c0_real; ln -s c0_real $T/c0; run $T | head -3
t "A18 manifeste: frozen_code_identity.trees falsifié (40 hex quelconque)"; T=$(mk); sed -i '' -E 's/("c0\/ts\/src": ")[0-9a-f]{40}/\1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/' $T/c0/C0_SOURCE.json; run $T | head -3
t "A19 fichier ajouté nommé C0_SOURCE.json en sous-dossier"; T=$(mk); echo '{}' > $T/c0/fixtures/C0_SOURCE.json; run $T | head -3
t "A20 CRLF: fin de ligne convertie sur un fichier"; T=$(mk); sed -i '' 's/$/\r/' $T/c0/ts/src/errors.ts; run $T | head -3
