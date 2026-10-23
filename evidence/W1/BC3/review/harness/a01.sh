#!/bin/bash
B=http://127.0.0.1:3364
echo "## A01 catalogue absent (base vide, aucune génération) — code d2e4a6ca"
M=$(printf 'a%.0s' $(seq 64))
for p in / /panier /devis /commande "/recherche?q=x" /categorie/signaletique /famille/gmce-demo /article/PI-000000358 /recu /media/$M; do echo "GET $p -> $(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$B$p")"; done
echo "HEAD / -> $(curl -s -I -o /dev/null -w '%{http_code}' $B/)"
echo "--- en-têtes + corps de / (nonce masqué)"
curl -s -D - $B/ | sed -E "s/nonce-[A-Za-z0-9+\/=]+/nonce-XXX/g; s/nonce=\"[^\"]+\"/nonce=\"XXX\"/g"
echo; echo "--- balises <script> dans le 503 : $(curl -s $B/ | grep -c '<script')"
echo "--- preview"; curl -s -w ' HTTP %{http_code}\n' -X POST -H 'content-type: application/json' -d '{"lines":[{"public_item_key":"PI-000000358","variant_axes":{},"quantity":1}]}' $B/api/site/cart/preview
