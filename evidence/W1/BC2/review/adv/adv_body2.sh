#!/bin/bash
# Reviewer re-review F-01 : RSS du serveur (ps toutes les 50 ms) pendant des envois de gros corps ; journal avant/après.
PID=$1; S=$2; B=http://127.0.0.1:3332/api/site/publish
FAKE=$(printf 'ab%.0s' $(seq 1 32)); K="x-c0-key-id: c0-test-publish-02"; G="x-c0-signature: $FAKE"
logc() { psql -X -h localhost -p 54318 -U postgres -d prodes_site_rv_bc2 -At -c "SELECT count(*) FROM site_publication_log"; }
rss() { ps -o rss= -p $PID | tr -d ' '; }
run() { # label n file -- curl args
  local label=$1 n=$2; shift 2; local before=$(rss) peak=$(rss) l0=$(logc) pids=() i
  for i in $(seq 1 $n); do curl -s -o $S/o_$i.txt -w "%{http_code}" "$@" > $S/c_$i.txt & pids+=($!); done
  while :; do local alive=0; for p in "${pids[@]}"; do kill -0 $p 2>/dev/null && alive=1; done; local r=$(rss); [ "$r" -gt "$peak" ] && peak=$r; [ $alive = 0 ] && break; sleep 0.05; done
  wait; local codes=""; for i in $(seq 1 $n); do codes="$codes$(cat $S/c_$i.txt) "; done
  echo "$label | codes=$codes| rss_avant=$((before/1024))MiB pic=$((peak/1024))MiB (+$(( (peak-before)/1024 )) MiB) après=$(( $(rss)/1024 ))MiB | journal +$(( $(logc) - l0 )) | corps=$(head -c 160 $S/o_1.txt)"
}
echo "rss_initiale=$(( $(rss)/1024 ))MiB journal=$(logc)"
run "STAGE 100 MiB sans en-têtes (Content-Length)" 1 -X POST --data-binary @$S/big100.bin $B/stage
run "STAGE 100 MiB sans en-têtes (chunked)" 1 -X POST -H "Transfer-Encoding: chunked" --data-binary @$S/big100.bin $B/stage
run "STAGE 100 MiB clé connue+signature 64hex, Content-Length" 1 -X POST -H "$K" -H "$G" --data-binary @$S/big100.bin $B/stage
run "STAGE 100 MiB clé connue+signature 64hex, chunked" 1 -X POST -H "$K" -H "$G" -H "Transfer-Encoding: chunked" --data-binary @$S/big100.bin $B/stage
run "STAGE Content-Length menteur (annonce 10, envoie 100 MiB)" 1 -X POST -H "$K" -H "$G" -H "Content-Length: 10" --data-binary @$S/big100.bin $B/stage
run "VERIFY_MEDIA 100 MiB signé-format chunked" 1 -X POST -H "$K" -H "$G" -H "Transfer-Encoding: chunked" --data-binary @$S/big100.bin $B/verify-media
run "ACTIVATE 100 MiB signé-format Content-Length" 1 -X POST -H "$K" -H "$G" --data-binary @$S/big100.bin $B/activate
run "PUT média 100 MiB signé-format chunked" 1 -X PUT -H "$K" -H "$G" -H "Transfer-Encoding: chunked" --data-binary @$S/big100.bin $B/media/$(printf '0%.0s' $(seq 1 64))
run "PUT média 100 MiB sans en-têtes" 1 -X PUT --data-binary @$S/big100.bin $B/media/$(printf '0%.0s' $(seq 1 64))
for k in 1 2 3; do run "4 x STAGE 300 MiB chunked parallèles (signé-format) — tour $k" 4 -X POST -H "$K" -H "$G" -H "Transfer-Encoding: chunked" --data-binary @$S/big300.bin $B/stage; done
for k in 1 2; do run "4 x STAGE 300 MiB sans en-têtes parallèles — tour $k" 4 -X POST --data-binary @$S/big300.bin $B/stage; done
echo "--- résiduel : clé publique connue + signature fausse + corps 30 MiB (< plafond) : lu en entier, refus C0 journalisé ?"
run "STAGE 30 MiB clé connue+signature fausse" 1 -X POST -H "$K" -H "$G" --data-binary @$S/big30.bin $B/stage
run "8 x STAGE 30 MiB clé connue+signature fausse parallèles" 8 -X POST -H "$K" -H "$G" --data-binary @$S/big30.bin $B/stage
sleep 3; echo "rss_finale=$(( $(rss)/1024 ))MiB ; serveur vivant=$(kill -0 $PID && echo oui) ; journal=$(logc)"
psql -X -h localhost -p 54318 -U postgres -d prodes_site_rv_bc2 -At -c "SELECT operation, outcome, error_codes, stage, detail FROM site_publication_log ORDER BY id DESC LIMIT 3"
