# BC1-D — Rapport du candidat D (coque Next.js stable propre + transplantation ciblée)

Builder : BC1-D (agent Claude Code, modèle Opus 5.5). Date : 2026-10-22. Mandat : `BC1_MANDATE.md` §0–3, §5–7.
Aucun verdict B/D n'est prononcé ici ; aucun PASS de gate. Chiffres = mesures d'un seul run sur le Mac de Nico.

## 1. Git

| Élément | Valeur |
|---|---|
| HEAD de départ | `a985aca23df49b66658ef06ce5878ef4bdd84834` |
| Branche | `spike/bc1-d-clean-shell` (worktree `/Users/nico/Desktop/prodes-wave0/commerce-d`) |
| HEAD livré | voir `git log -1` de la branche poussée (ce rapport est dans le dernier commit) |
| Diff global | `git diff --stat a985aca2` : 288 fichiers, +4 298 / −56 598 (inclut fixture, logs, PNG) — `spike/logs/git-diff-stat.txt` |
| Diff `app/ components/ lib/` | 210 fichiers, +1 573 / −21 310 |

Écart au mandat E10 : les trailers de commit portent `Co-Authored-By: Claude Opus 5.5` (modèle réellement exécuté, consigne d'attribution de la session) au lieu de `Claude Fable 5.1` ; la ligne `Claude-Session` est celle demandée.

## 2. Versions retenues (E1)

| Paquet | Version | Publication npm | Pourquoi |
|---|---|---|---|
| next | **16.4.0** | 2026-10-06T18:35:31Z | dernière 16.x stable publiée avant le 2026-10-08 (16.4.1 = 10-14, 16.4.2 = 10-15 exclues) |
| react / react-dom | 19.3.0 | 2026-09-09 | peer Next `^18.2.0 \|\| ^19.0.0` ; dernière stable antérieure au 2026-10-08 (19.3.1 = 10-14) |
| typescript | 7.0.2 | 2026-07-08 | `latest` stable ; `next build` l'accepte (« Running TypeScript … Finished in 247ms ») |
| tailwindcss / @tailwindcss/postcss | 4.3.3 | 2026-07-16 | requis par les composants transplantés |
| postcss | 8.5.29 | 2026-10-05 | peer de @tailwindcss/postcss (`^8.5.16`) |
| @types/react, @types/react-dom, @types/node | 19.3.0 / 19.3.0 / 22.20.5 | | types |

Aucune option `experimental` (ppr, useCache, inlineCss retirés). `images.unoptimized: true`. Un seul lockfile `package-lock.json` ; `pnpm-lock.yaml` supprimé.
Diff `package.json` avant/après : `spike/logs/package-json.diff` (dépendances runtime 14 → 3 : next, react, react-dom).

**Risque : `npm audit` signale 1 vulnérabilité critique sur next 16.0.0–16.4.0** (GHSA-2464-fhr4-w9xw RCE via Image Optimization + SVG ; GHSA-p3m5-59mp-jv5r DoS Server Actions ; GHSA-673q-mjm6-r5xr RCE `use cache`), corrigée en 16.4.2, exclue par la règle de date imposée. Le candidat n'utilise ni l'optimiseur d'images (`unoptimized`), ni Server Actions, ni `use cache` — exposition réduite, **non prouvée nulle** (non testé). `spike/logs/npm-audit.log`. Décision de version à reprendre par l'orchestrateur.

## 3. Environnement et commandes (E7)

macOS 26.6 arm64, node v22.23.1, npm 10.9.8, Chrome 155 (headless). Build et serveurs lancés avec `env -i PATH HOME NEXT_TELEMETRY_DISABLED` : **aucune variable Supabase ni autre**.

| Commande | Durée | Résultat | Log |
|---|---|---|---|
| `npm ci` (strict) | 4,12 s réel | PASS rc=0, 50 paquets | `spike/logs/npm-ci.log` |
| `npx tsc --noEmit` | — | 0 erreur | `spike/logs/tsc.log` |
| `npm run build` | 3,1 s réel (compilation 1,5 s) | PASS ; 9 routes, toutes `ƒ` dynamiques | `spike/logs/build.log` |
| `next start -H 127.0.0.1 -p 3311/3312/3313` | prêt < 0,2 s | 3 instants : 2026-10-22T20:00Z, 2026-11-15T12:00Z, 2025-06-01T00:00Z | `spike/logs/start-*.log` |
| `node spike/http-tests.mjs` (PHASE=default/promo/before) | — | 66/66, 4/4, 2/2 PASS | `spike/logs/http-tests-*.log` |
| `node spike/screenshots.mjs` (CDP, aucune dépendance) | — | 21 PNG | `spike/logs/screenshots-*.log` |

Routes émises : `/`, `/_not-found`, `/api/site/cart/preview`, `/api/site/order`, `/api/site/quote`, `/categorie/[key]`, `/famille/[slug]`, `/media/[sha256]`, `/panier`. Pas de middleware/proxy.

`npm ls --depth=0` (`spike/logs/npm-ls.log`) : les 9 paquets déclarés + `@emnapi/runtime` et `@img/sharp-wasm32` marqués « extraneous » — ce sont des dépendances optionnelles de `sharp` (via next) présentes dans le lockfile ; signalement cosmétique de npm, non creusé.

Un premier run PHASE=before a **échoué** (`spike/logs/http-tests-before-run1-FAIL.log`) : à un instant antérieur à toute fenêtre, la fiche listait les paliers futurs sans dire « Prix indisponible ». Corrigé (`price-grid.tsx` : bandeau si aucune fenêtre active, lignes futures marquées « À venir »), puis rebuild et re-run complet des trois phases.

## 4. Résultats HTTP cas par cas

Détail ligne par ligne (attendu / obtenu) dans les logs. Synthèse :

| Scénario | Cas (tous PASS) |
|---|---|
| S05 (7) | qty 1, 9 → BASE-1 189.00 ; qty 10, 19 → BASE-2 179.50 ; qty 20 → BASE-3 169.90 ; somme multi-lignes `1795.00 \| 37.20 \| 349.00 \| 2181.20` (3 × 12.40 vaut 37.1999… en flottant) ; `unit_amount` sérialisé en chaîne |
| S06 (4) | lignes de l'aperçu renvoyées au devis → reçu avec mêmes rate_id/montants ; ligne sans rate_id/unit_amount → 400 INVALID_LINE ; aucun `Set-Cookie` sur preview/quote/panier/fiche ; `/api/cart/share` → 404 |
| S07 (6) | reçu 200 étiqueté `simulation:true` + `NONE_CONTRACTUAL_SIMULATION`, total 141.60 ; rejeu même clé/même payload → corps identique (hors `replayed:true`) ; même clé/payload différent → 409 DUPLICATE_KEY_DIFFERENT_PAYLOAD ; clé absente → 400 ; contact invalide → 400 ; un refus n'enregistre pas la clé |
| S08 (12 + 1 + 1) | 189.00 accepté (200 ORDER) ; montant falsifié → 409 PRICE_CHANGED (current 189.00) ; qty 10 avec le palier 1-9 → 409 PRICE_CHANGED (current 179.50) ; « 189 » ≡ « 189.00 » → 200 ; acrylique×400 → 400 INVALID_VARIANT FORBIDDEN_COMBINATION ; bleu/L → 400 INVALID_VARIANT ABSENT_COMBINATION ; item inconnu → 400 ; qty 0 → 409 PRICE_WINDOW_UNAVAILABLE ; qty 1.5 → 400 INVALID_QUANTITY ; 1 ligne bonne + 1 falsifiée → 409 sans reçu ; corps non JSON → 400 ; aucune réponse ne contient `"success"`. Instant promo : prix BASE affiché avant la promo puis envoyé pendant → 409 PRICE_CHANGED (9.99). Instant 2025-06-01 : 409 PRICE_WINDOW_UNAVAILABLE + « Prix indisponible » à l'écran |
| S03 (1 + 3) | 2026-10-22 : rouge/M qty 1 → BASE 12.40 (promo future). 2026-11-15 : rouge/M qty 1 et qty 25 → PROMO 9.99 ; rouge/L reste BASE 12.40 |
| S09 (36) | 36 chemins legacy (admin, api/admin/*, checkout, devis, devis-express, revalidate, track, mes-commandes, mon-devis, panier/[shareId], cart, search, product-pdf…) : GET **et** POST avec `Cookie: admin_session=forged` + `Authorization: Bearer x` → 404/404, aucun `"success"` |

Codes ajoutés au-delà du mandat (documentés) : `INVALID_LINE`, `INVALID_QUANTITY`, `INVALID_CONTACT`, `IDEMPOTENCY_KEY_REQUIRED`, `EMPTY_CART`, `INVALID_REQUEST`, `AMBIGUOUS_PRICE_WINDOW` (deux fenêtres de même couche applicables), `MIXED_CURRENCY_NOT_QUALIFIED`.

## 5. Captures (E7) — `spike/screenshots/`

Chrome 155 headless piloté par CDP (`spike/screenshots.mjs`, WebSocket natif Node 22) ; pleine page ; mesure `scrollWidth == innerWidth` pour les 21 captures (aucun débordement horizontal, `spike/logs/screenshots-*.log`).
- 1440 / 1024 / 390 : `S01-accueil`, `S02-simple`, `S03-gmce-promo-future` (2026-10-22), `S03-gmce-promo-active` (2026-11-15), `S04-esunny`, `S05-panier` (SIMPLE ×10, GMCE rouge/M ×2, ESUNNY polyester/400 ×1), `S05-panier-recu-simulation` (après « Simuler une commande »).
- Vérification DOM S04 (`spike/logs/s04-dom-check.log`) : depuis acrylique/300, clic « 400 » → bascule sur polyester/400 ; clic « Acrylique » → acrylique/300 ; acrylique×400 n'est jamais atteint ; note « Toile acrylique × Largeur 400 (interdite) » affichée.
- Un premier jeu montrait à 390 px un débordement du tableau panier (largeur 432) et un logo de pied de page en carré blanc : corrigés (panier en liste responsive, filtre CSS du logo retiré), captures refaites.
- **NOT_TESTED** (builder) : navigation clavier, zoom 200 %, lecteur d'écran (S10) — à faire par l'orchestrateur.

## 6. Architecture livrée

- `lib/site-dto/index.ts` : **seul** lecteur de `fixtures/provisional-v0/` ; vérifie sha256 (`413dab48…`) et `contract_version` au chargement (échec fort sinon) ; expose catégories, familles, items READY, `resolveVariant`, `selectPrice(itemKey, quantity, instantUtc)` → `{rate_id, unit_amount, currency, tax_basis_or_status, layer, valid_from/until}` ou `DtoError` (`PRICE_WINDOW_UNAVAILABLE`, `INVALID_VARIANT`…). Montants en chaîne, arithmétique en centimes `BigInt`. `lib/site-dto/view.ts` = projections d'affichage, ne lit pas la fixture.
- `lib/simulator/` : revalidation de chaque ligne contre le snapshot à `SPIKE_NOW_UTC`, reçu déterministe (`SIM-CMD-`/`SIM-DEV-` + sha256 du payload canonique), idempotence en mémoire de processus (`globalThis`), pas de fichier `var/`.
- Panier : **un seul** mécanisme client (`components/cart/cart-provider.tsx`, une clé localStorage, sans prix faisant foi). Les prix affichés viennent de `POST /api/site/cart/preview` ; devis/commande reçoivent les lignes affichées (clé, axes, quantité, rate_id, unit_amount) et les revalident. Aucun cookie, aucune Server Action.
- Médias : `GET /media/[sha256]`, octets indexés par leur empreinte réelle.

## 7. Transplantation (mesure spécifique D)

Matrice complète : `spike/FILE_MATRIX.md` (194 fichiers à a985aca2 : **KEEP 1, ADAPT 6, REPLACE 0, DELETE 187, UNKNOWN 0**).

| Fichier transplanté | Verdict | Lignes −/+ | Ce qui a été changé | Temps (estimation du builder) |
|---|---|---|---|---|
| components/layout/breadcrumbs.tsx | KEEP | 0/0 | rien | ~1 min |
| components/layout/footer.tsx | ADAPT | −35/+5 | liens vers routes supprimées, mention TVA, filtre logo | ~3 min |
| components/home/hero.tsx | ADAPT | −9/+9 | promesses non vérifiables → états honnêtes | ~3 min |
| components/home/category-grid.tsx | ADAPT | −6/+12 | type Supabase → type local, href | ~2 min |
| components/product/variant-selector.tsx | ADAPT | −45/+64 | helpers couleur gardés ; matching réécrit sur items READY | ~10 min |
| components/product/price-grid.tsx | ADAPT (quasi-réécriture) | −76/+71 | calcul PBQ supprimé, lignes = fenêtres SELL | ~8 min |
| app/globals.css | ADAPT | −37/+6 | plugins typography/container-queries, prose, print retirés | ~2 min |

Réinventé (écrit de zéro, 1 434 LOC sous app/components/lib, 20 fichiers) : adaptateur DTO (342), simulateur (215+19), panier (provider 94 + vue 229), bloc Item de la fiche (139), en-tête, carte Famille, pages, routes. **Galerie** : non transplantée (dépendait de heroicons + GridTileImage/Label/Price `parseFloat`) ; remplacée par image Famille en tête + image propre de l'Item quand elle existe (une image par niveau dans la fixture) — pas de carrousel multi-images. **Sélecteur de variantes** et **grille de paliers** : transplantés puis adaptés. **Panier** : réécrit entièrement.

Effort observé (estimation du builder, étiquetée comme telle, agent seul) : de la création du worktree (~23:33 CEST) aux trois phases de tests vertes (~23:46) puis matrice/rapport, ≈ 25–35 min de temps mur agent. Non transposable à un développeur humain ; ne comprend pas de review.

## 8. Parité fonctionnelle S01–S10 (ce que D ne fait pas)

| Scénario | D |
|---|---|
| S01 | ✅ accueil fixe, 5 catégories (avec page catégorie), 3 familles non achetables directement |
| S02 | ✅ image Famille en premier, descriptions courte/longue, 1 item, paliers depuis les fenêtres |
| S03 | ✅ couleur × taille ; bleu/L non proposé (note « non publiée ») ; image propre rouge/M ; promo « à venir » puis « active » (captures et tests aux deux instants) |
| S04 | ✅ acrylique×400 jamais sélectionnable ni vendable (DOM + HTTP) |
| S05 | ✅ paliers 1/9/10/19/20, somme exacte serveur |
| S06 | ✅ panier unique, lignes affichées revalidées, pas de cookie |
| S07 | ✅ simulateur devis idempotent |
| S08 | ✅ commande simulée, refus PRICE_CHANGED / INVALID_VARIANT / PRICE_WINDOW_UNAVAILABLE |
| S09 | ✅ 36 routes legacy 404 (absentes du build), 0 import Supabase |
| S10 | ⚠️ responsive 1440/1024/390 capturé ; clavier, zoom 200 %, a11y : NOT_TESTED |

Non fourni par D (existait à a985aca2, hors scénarios) : recherche, filtres, wishlist, comparateur, pages contenu (FAQ, contact, mentions légales, gamme), PDF produit, e-mails, SEO (sitemap, robots, OpenGraph), favicon, back-office, carrousel d'accueil, témoignages, bandeau promo, menu mobile dédié.

## 9. Dépendances, imports résiduels, surface d'attaque

- Runtime : `next`, `react`, `react-dom` uniquement. Retirés : `@supabase/supabase-js`, `@anthropic-ai/sdk`, `resend`, `jspdf`, `csv-parse`, `embla-carousel-react`, `geist`, `sonner`, `clsx`, `@headlessui/react`, `@heroicons/react`, prettier.
- Grep E2 (`spike/logs/grep-e2.log`) : `supabase|shopify` → **0** dans `app/ components/ lib/` et **0** fichier dans `.next/server` + `.next/static` ; `cartId` / `"success"` → 0 ; `node_modules/@supabase` absent. Variables lues : `SPIKE_NOW_UTC`, `NEXT_PUBLIC_BASE_URL` (breadcrumbs, JSON-LD, défaut `https://prodes.fr`).
- Surface restante : 3 routes POST (preview, quote, order) sans auth ni limite de débit (corps borné à 64 Ko) ; la Map d'idempotence grossit sans borne (mémoire de processus, DoS possible si exposé) ; `/media/[sha256]` (regex hex 64, lecture d'un fichier indexé, pas de chemin libre) ; vulnérabilités next 16.4.0 ci-dessus.

## 10. Risques de maintenance observés

- `lib/site-dto/view.ts` importe le type `PriceGridRow` d'un composant (couplage de type lib → components) ; à inverser si conservé.
- Règle de sélection **PROMO > BASE** = hypothèse du spike, affichée à l'écran comme « règle provisoire » ; à fermer par C0.
- L'adaptateur lit la fixture au premier appel et la met en cache pour la vie du processus ; pas de rechargement (normal pour un snapshot figé, à revoir pour C0).
- Toutes les pages sont `force-dynamic` (lecture de `SPIKE_NOW_UTC` au runtime) : aucun cache/ISR évalué.
- `tsconfig.json` modifié automatiquement par `next build` (ajout de `.next/dev/types`).
- Le commit « adaptateur DTO » ne compile pas seul (`view.ts` dépend de `price-grid.tsx` ajouté deux commits plus loin) ; la branche compile à son HEAD.
- Pas de code mort legacy restant sous app/components/lib (tout DELETE ou neuf). Outillage agent-ops conservé tel quel, non exécuté (`agent-ops:test` NOT_TESTED).

## 11. Design Authority

Appliqué : hiérarchie Famille (image, nom, descriptions, clé PF-) puis Item (clé PI-, axes, image propre, paliers) ; prix toujours avec base (HT), `rate_id`, validité en heure de Paris, provenance (publication, projection, contrat, sha256, instant) ; états honnêtes « STAGING_FIXTURE », « SIMULATION — rien n'est enregistré », « Prix indisponible », « Promo à venir/active », « Combinaison non proposée (interdite / non publiée) », « TVA, port, remise : non qualifiés ».
Non vérifié : contrastes, ordre de tabulation, lecteurs d'écran, zoom 200 %, conformité à une charte PRODES formelle (aucune fournie au builder), rendu des vraies images (la fixture contient des PNG unis 1×n px, affichés en `pixelated`).

## 12. Écarts à la fixture et STOP

- Fixture copiée telle quelle, `shasum -a 256 -c MANIFEST.sha256` OK sur 8 fichiers (`spike/logs/fixture-shasum-check.log`). Aucune donnée dérivée persistée.
- `unpublished_note` et `fixture_status` non affichés tels quels ; bleu/L déduit du produit cartésien du schéma moins les items publiés.
- STOP §6 : aucun déclenché. Aucune règle TVA/port/arrondi inventée (affichées « non qualifiées »). Aucune dépendance hors Next/React/TS/Tailwind(+peers). Point à arbitrer : version Next imposée (16.4.0) porteuse d'un avis critique corrigé en 16.4.2.

## 13. NOT_TESTED explicites

Clavier, zoom 200 %, lecteurs d'écran (S10) ; `agent-ops:test` / `quality-gate` ; comportement sous charge ; plusieurs processus Next (l'idempotence est par processus) ; navigateurs autres que Chrome 155 ; exploitation réelle des CVE next 16.4.0.
