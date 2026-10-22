# BC1-B — Rapport du candidat B (réemploi sélectif de Commerce)

Builder : BC1-B (Claude Opus 5.5, session `session_01BZpR2bhyTiRS9q2fSNUjKQ`). Date : 2026-10-22.
Ce rapport **mesure** ; il ne prononce aucun PASS de gate et ne compare pas avec D.

## 1. Références

| Élément | Valeur |
|---|---|
| HEAD de départ | `a985aca23df49b66658ef06ce5878ef4bdd84834` (commerceprodes/main) |
| Branche | `spike/bc1-b-selective-reuse` (worktree `/Users/nico/Desktop/prodes-wave0/commerce-b`) |
| HEAD livré | voir `git log -1` de la branche poussée (le SHA final figure dans la réponse à l'orchestrateur ; le code `app/ components/ lib/` est figé depuis `bc7177a0`, les commits suivants ne touchent que `spike/`) |
| Fixture | `fixtures/provisional-v0/` copiée telle quelle ; `shasum -a 256 -c MANIFEST.sha256` : 8/8 OK (`spike/logs/fixture-shasum.log`) ; l'adaptateur revérifie le SHA du snapshot et de chaque média au chargement |

## 2. Versions retenues et pourquoi

| Paquet | Avant | Après | Justification |
|---|---|---|---|
| next | 15.6.0-canary.60 | **16.4.0** | Dernière 16.x stable publiée avant le 2026-10-08 : 16.4.0 publiée le **2026-10-06T18:35:31Z** ; 16.4.1 (2026-10-14) et 16.4.2 (`latest`, 2026-10-15) sont postérieures donc exclues (`spike/logs/npm-view-next-time.json`, `npm-view-next-dist-tags.json`) |
| react / react-dom | 19.0.0 | **19.3.0** | Peer de next 16.4.0 : `^18.2.0 \|\| ^19.0.0` ; 19.3.0 est la version épinglée par `create-next-app@16.4.0` (lue dans son `dist/index.js`), publiée le 2026-09-09 |
| typescript | 5.8.2 | **5.9.3** | `create-next-app@16.4.0` déclare `typescript: ^5` ; 5.9.3 = dernière 5.x (2025-09-30). TS 6/7 non retenus (hors plage du gabarit) |
| @types/react, @types/react-dom | 19.0.12 / 19.0.4 | 19.3.0 / 19.3.0 | alignés sur React 19.3.0, publiés avant le 2026-10-08 |

### ⚠️ Escalade sécurité (fait mesuré, non résolu)

`npm audit` (`spike/logs/npm-audit.json`) : **next 16.0.0–16.4.0 est concernée par 3 avis** — GHSA-2464-fhr4-w9xw (RCE non authentifiée, API d'optimisation d'images avec SVG, *critical*), GHSA-673q-mjm6-r5xr (RCE, fonctions `use cache` renvoyant des typed arrays, *critical*), GHSA-p3m5-59mp-jv5r (DoS App Router / Server Actions, *high*). Correctif annoncé : 16.4.2 (16.4.1+), **postérieure à la date butoir** imposée. Je n'ai pas changé la version (imposée identique pour B et D) et je n'ai **pas** exécuté la commande `next upgrade --agent=security …` que l'outil propose.
Atténuations appliquées dans B : `images.unoptimized: true` (supprime `/_next/image`, vecteur de GHSA-2464) ; aucun `use cache` ; aucune Server Action (`"use server"` : 0). Le DoS GHSA-p3m5 n'est **pas** atténué (une requête `Next-Action` forgée sur `/cart` renvoie 400, testée ; l'exposition DoS n'est pas mesurée). Décision de version = orchestrateur.

Autres avis `npm audit` restants : @tailwindcss/typography / postcss-selector-parser (moderate), source-map-js (high, outillage). Total : 4 (2 moderate, 1 high, 1 critical) contre 15 au baseline.

## 3. Environnement

macOS 26.6.2 (arm64), node v22.23.1, npm 10.9.8, Google Chrome 155.0.8059.85 (headless). Aucune variable d'environnement Supabase présente (`env | grep -ci supabase` = 0). Réseau : registre npm uniquement.

## 4. Commandes exécutées, durées, résultats (E7)

| Commande | Durée (wall) | Résultat | Log |
|---|---|---|---|
| `npm ci` (strict, sans `--legacy-peer-deps`) | 5,08 s | **PASS** rc=0 | `spike/logs/npm-ci.log` |
| `npx tsc --noEmit` | 1,20 s | **0 erreur** | `spike/logs/tsc.log` |
| `npm run build` (aucune variable Supabase), essai 1 après `rm -rf .next` | 5,46 s | **FAIL rc=1** : compilation OK puis `SecurityFatalError` (rappel d'upgrade Next déclenché parce qu'un agent est détecté, `node_modules/next/dist/lib/upgrade/nudge.js`) | `spike/logs/build-attempt1-agent-nudge.log` |
| `npm run build`, essai 2 (même commande) | 3,16 s (cache `.next` de l'essai 1) | **PASS rc=0**, avertissement sécurité ; 15 routes émises | `spike/logs/build.log` |
| `npm start -- -p 4730` | Ready in 119 ms | `GET /` → 200 | `spike/logs/npm-start.log` |
| `node spike/http-tests.mjs 4710` | — | **98/98 PASS** | `spike/logs/http-tests.log`, `.json` |
| `node spike/capture.mjs` | 51 s | 31 captures | `spike/logs/capture.log`, `capture.json` |
| `npm ls --depth=0` | — | 20 paquets de premier niveau (2 « extraneous » optionnels de sharp : `@emnapi/runtime`, `@img/sharp-wasm32`, présents dans le lockfile) | `spike/logs/npm-ls.log` |
| `npm audit --json` | — | 4 avis (voir §2) | `spike/logs/npm-audit.json` |
| `npx prettier --check app components lib` | — | 35 fichiers non formatés (5 KEEP inchangés, 22 modifiés, 8 nouveaux) — informatif, non corrigé | `spike/logs/prettier-check.log` |
| `node --test tests/agent-ops/*.test.mjs` | — | 15 pass / 0 fail | `spike/logs/agent-ops-test.log` |

Le blocage de l'essai 1 dépend de la détection d'agent : un build humain ou CI sans agent n'a **pas** été testé (`NOT_TESTED`). Conséquence pratique : dans une session agent, tout build sur `.next` vierge échoue une fois.

Routes émises par le build (15) : `/`, `/_not-found`, `/api/site/order`, `/api/site/quote`, `/cart`, `/contact`, `/faq`, `/media/[sha]`, `/mentions-legales`, `/opengraph-image` (statique), `/product/[handle]`, `/robots.txt` (statique), `/search`, `/search/[collection]`, `/sitemap.xml`. Pas de Proxy/Middleware. Baseline : 34 pages + 36 route.ts + 1 proxy.

### Journal des ruptures canary → stable (B)

1. `experimental.ppr`, `inlineCss`, `useCache` retirés de `next.config.ts` ; build legacy aussitôt en échec : *« To use "use cache", please enable the feature flag `cacheComponents` »* sur 8 fonctions de `lib/supabase/index.ts` (+ 8 dans `lib/shopify`, mort) — `spike/logs/migration-step1-build-legacy-dummyenv.log`. Non corrigé : couche remplacée par le DTO.
2. `tsc` legacy sous TS 5.9 : 1 erreur (`Buffer` non assignable à `BodyInit`, `app/api/product-pdf/[handle]/route.ts:39`) — route supprimée.
3. `npm ci` strict passe dès le passage en stable (le conflit `geist` ↔ canary disparaît) — `spike/logs/migration-step1-npm-ci-strict.log`.
4. `next build` réécrit `tsconfig.json` : `moduleResolution: "node"` → `"bundler"` (changement obligatoire, commité).
5. `next dev --turbopack` → `next dev` (Turbopack par défaut en 16).
6. `generateStaticParams` : absent du code au HEAD, aucune rupture. Cache : `"use cache"` / `cacheLife` n'existent plus (supprimés avec `lib/supabase`) ; toutes les pages sont dynamiques (`export const dynamic = "force-dynamic"` dans `app/layout.tsx`) pour lire `SPIKE_NOW_UTC` à chaque requête.
7. Rappel de sécurité bloquant en session agent (§2, §4).

## 5. Résultats HTTP (`spike/http-tests.mjs`)

Le script lance lui-même trois `next start` : **A** `SPIKE_NOW_UTC=2026-10-22T20:00:00Z`, **B** `2026-11-15T12:00:00Z` (PROMO GMCE active), **C** `2025-12-01T00:00:00Z` (avant toute fenêtre SELL, seule façon d'obtenir `PRICE_WINDOW_UNAVAILABLE` avec cette fixture : toutes les fenêtres ont `quantity_min=1` et un dernier palier ouvert). Les assertions vérifient la valeur métier (rate_id, montant, code, attendu renvoyé), pas seulement le statut.

| Cas | Attendu | Obtenu | Verdict |
|---|---|---|---|
| S05-qty1 | 200, RATE-PI-SIMPLE001-BASE-1, unit 189.00, ligne 189.00, total 189.00 | 200, RATE-PI-SIMPLE001-BASE-1, unit 189.00, ligne 189.00, total 189.00 | PASS |
| S05-qty10 | 200, RATE-PI-SIMPLE001-BASE-2, unit 179.50, ligne 1795.00, total 1795.00 | 200, RATE-PI-SIMPLE001-BASE-2, unit 179.50, ligne 1795.00, total 1795.00 | PASS |
| S05-qty20 | 200, RATE-PI-SIMPLE001-BASE-3, unit 169.90, ligne 3398.00, total 3398.00 | 200, RATE-PI-SIMPLE001-BASE-3, unit 169.90, ligne 3398.00, total 3398.00 | PASS |
| S05-frontiere-q10 | 409 PRICE_CHANGED, attendu RATE-PI-SIMPLE001-BASE-2 | 409 PRICE_CHANGED, attendu RATE-PI-SIMPLE001-BASE-2 | PASS |
| S05-frontiere-q9 | 409 PRICE_CHANGED, attendu RATE-PI-SIMPLE001-BASE-1 | 409 PRICE_CHANGED, attendu RATE-PI-SIMPLE001-BASE-1 | PASS |
| S05-frontiere-q20 | 409 PRICE_CHANGED, attendu RATE-PI-SIMPLE001-BASE-3 | 409 PRICE_CHANGED, attendu RATE-PI-SIMPLE001-BASE-3 | PASS |
| S05-frontiere-q19 | 409 PRICE_CHANGED, attendu RATE-PI-SIMPLE001-BASE-2 | 409 PRICE_CHANGED, attendu RATE-PI-SIMPLE001-BASE-2 | PASS |
| S05-somme-exacte | 200, total 2132.70 | 200, total 2132.70 | PASS |
| S06-ligne-sans-prix-affiche | 400 INVALID_REQUEST (rate_id + unit_amount affichés obligatoires) | 400 INVALID_REQUEST | PASS |
| S06-panier-vide | 400 INVALID_REQUEST | 400 INVALID_REQUEST | PASS |
| S06-ligne-dupliquee | 400 DUPLICATE_LINE | 400 DUPLICATE_LINE | PASS |
| S06-pas-de-cookie / | 200, aucun Set-Cookie, aucune mention cartId | 200, set-cookie=absent, cartId=false | PASS |
| S06-pas-de-cookie /cart | 200, aucun Set-Cookie, aucune mention cartId | 200, set-cookie=absent, cartId=false | PASS |
| S06-pas-de-cookie /product/etabli-atelier-simple | 200, aucun Set-Cookie, aucune mention cartId | 200, set-cookie=absent, cartId=false | PASS |
| S06-reponse-sans-cookie | 200, aucun Set-Cookie | 200, set-cookie=absent | PASS |
| S06-next-action-forgee | pas de 200 / pas de success:true | 400, success:true=false | PASS |
| S07-devis-recu | 200, simulation:true, persistence NONE_CONTRACTUAL_SIMULATION, kind QUOTE | 200, simulation:true, NONE_CONTRACTUAL_SIMULATION, QUOTE | PASS |
| S07-meme-cle-meme-payload | 200, même receipt_id SIM-QUOTE-19b11626-65df-495f-bf5e-1623309ee14f | 200, SIM-QUOTE-19b11626-65df-495f-bf5e-1623309ee14f, replay=true | PASS |
| S07-meme-cle-payload-different | 409 DUPLICATE_KEY_DIFFERENT_PAYLOAD | 409 DUPLICATE_KEY_DIFFERENT_PAYLOAD | PASS |
| S07-autre-cle-nouveau-recu | 200, receipt_id différent | 200, SIM-QUOTE-74ef81e5-0605-46dd-a372-94ac1727bbff | PASS |
| S07-cle-absente | 400 MISSING_IDEMPOTENCY_KEY | 400 MISSING_IDEMPOTENCY_KEY | PASS |
| S07-json-invalide | 400 INVALID_REQUEST | 400 INVALID_REQUEST | PASS |
| S08-commande-acceptee | 200 ORDER, ligne 62.00, simulation | 200 ORDER, ligne 62.00, sim=true | PASS |
| S08-montant-falsifie | 409 PRICE_CHANGED, attendu 12.40 | 409 PRICE_CHANGED, attendu 12.40 | PASS |
| S08-meme-montant-autre-ecriture | 200 (12.4 == 12.40 en centimes) | 200 | PASS |
| S08-interdit-acrylique-400 | 400 INVALID_VARIANT | 400 INVALID_VARIANT | PASS |
| S08-absent-bleu-L | 400 INVALID_VARIANT | 400 INVALID_VARIANT | PASS |
| S08-item-inconnu | 400 INVALID_VARIANT | 400 INVALID_VARIANT | PASS |
| S08-axes-manquants | 400 INVALID_VARIANT | 400 INVALID_VARIANT | PASS |
| S08-hors-fenetre (instance C 2025-12-01) | 409 PRICE_WINDOW_UNAVAILABLE | 409 PRICE_WINDOW_UNAVAILABLE | PASS |
| S08-quantite-zero | 400 INVALID_QUANTITY | 400 INVALID_QUANTITY | PASS |
| S08-une-ligne-invalide-pas-de-recu | 400, aucun receipt_id | 400, receipt_id=absent | PASS |
| S03-promo-future-refusee (A) | 409 PRICE_CHANGED, attendu BASE-1 | 409 PRICE_CHANGED, RATE-PI-GMCE0001-BASE-1 | PASS |
| S03-promo-active-acceptee (B) | 200, PROMO-1 9.99 | 200, RATE-PI-GMCE0001-PROMO-1 9.99 | PASS |
| S03-base-perimee-pendant-promo (B) | 409 PRICE_CHANGED, attendu PROMO-1 | 409 PRICE_CHANGED, RATE-PI-GMCE0001-PROMO-1 | PASS |

S09 (63 cas) : 31 chemins legacy × GET/POST avec `Cookie: admin_session=forged` et `Authorization: Bearer x` → **62 × 404** sans `success:true` ; `GET /api/site/quote` → 405. Chemins : `/admin`, `/admin/login`, `/admin/produits`, `/admin/devis`, `/admin/catalogue`, `/api/admin/{auth, products-list, export-products, ia/categories-list, paniers-abandonnes/1/recover, products/1, devis/1, site-config}`, `/api/checkout`, `/checkout`, `/checkout/confirmation`, `/api/devis`, `/api/devis-express`, `/devis-express`, `/api/revalidate`, `/api/track`, `/mes-commandes`, `/mon-devis/PRODES-1`, `/panier/abc`, `/api/cart/{share, abandon}`, `/api/contact`, `/api/search`, `/api/product-pdf/x`, `/api/products-by-handles`, `/api/devis-status/1`.

Totaux par scénario : S03 3/3, S05 8/8, S06 8/8, S07 6/6, S08 10/10, S09 63/63. Ce que ces tests **ne mesurent pas** : la concurrence (deux requêtes simultanées même clé), la persistance après redémarrage (volontairement nulle), la charge, le DoS GHSA-p3m5.

## 6. Captures (E7) — `spike/screenshots/`

Chrome 155 headless. Pages statiques : commande CLI du mandat (`--headless=new --screenshot --window-size=…`, profil temporaire). Panier et reçu : le panier vit dans `localStorage`, inaccessible au mode `--screenshot` ; pilotage par CDP via le `WebSocket` natif de Node 22 (`spike/capture.mjs`, aucune dépendance) : injection du brouillon, rechargement, saisie du formulaire, clic.

- S01 : `S01-accueil-{d,t,m}`, `S01-catalogue-d`
- S02 : `S02-simple-{d,t,m}`
- S03 : `S03-gmce-rougeM-promo-future-{d,t,m,long}` (instant A, ligne « PROMO à venir » visible sur `-long`), `S03-gmce-rougeM-promo-active-{d,t,m,long}` (instant B, 9,99 € HT, tarif PROMO-1), `S03-gmce-bleuM-L-non-proposee-d`, `S03-gmce-url-bleuL-forcee-d` (URL forcée : « Cette combinaison n'est pas proposée », ajout désactivé)
- S04 : `S04-esunny-acrylique300-{d,m}` (400 barré « combinaison interdite », désactivé), `S04-esunny-url-acrylique400-forcee-d`
- S05 : `S05-panier-qty{1,10,20}-{d,t,m}` (189,00 / 1 795,00 / 3 398,00 € HT, rate_id affiché)
- S07 : `S07-avant-envoi-d`, `S07-recu-simulation-d` ; texte UI relevé (`capture.json`) : premier envoi → `SIM-QUOTE-…`, second clic → même reçu « (rejeu idempotent : même reçu) ».

Suffixes : d = 1440×900, t = 1024×768, m = 390×844. Clavier et zoom 200 % : **NOT_TESTED** (réservés à l'orchestrateur). Captures relues visuellement pour S01, S03 (A, B, long, URL forcée), S04, S05 m, S07 ; les autres sont produites mais pas relues une à une.

## 7. Grep résiduel E2 et dépendances

`spike/logs/grep-residual-e2.log` :
- imports `lib/supabase` / `lib/shopify` / `@supabase` dans `app/ components/ lib/` : **0** ;
- occurrences textuelles `supabase|shopify` : 2, toutes dans des **commentaires** (`app/contact/page.tsx:9`, `components/layout/navbar/index.tsx:10`) ;
- `"use server"` : 0 ; `cartId` : 1 (commentaire « Aucun cookie cartId ») ;
- bundle `.next/server` + `.next/static` : 0 fichier JS contenant « supabase » (2 `.js.map` le contiennent, via les commentaires ci-dessus) ;
- `node_modules/@supabase` absent ; build passé sans aucune variable Supabase.

Dépendances restantes (`spike/logs/package-json.diff`) — runtime : `next`, `react`, `react-dom`, `@headlessui/react` (Dialog du panier et du menu mobile), `@heroicons/react`, `clsx`, `geist` (police) ; dev : `tailwindcss`, `@tailwindcss/postcss`, `@tailwindcss/typography`, `@tailwindcss/container-queries`, `postcss`, `prettier`, `prettier-plugin-tailwindcss`, `typescript`, `@types/*`. Retirées : `@supabase/supabase-js`, `@anthropic-ai/sdk`, `resend`, `jspdf`, `csv-parse`, `embla-carousel-react`, `sonner`. **Aucune dépendance nouvelle.** `pnpm-lock.yaml` supprimé, `package-lock.json` unique.

## 8. Architecture livrée

- **Adaptateur DTO unique** `lib/site-dto/` : `index.ts` est le **seul** module qui lit la fixture (vérifie SHA du snapshot et des médias) et expose `getCategories`, `getFamilies`, `getFamilyBySlug`, `getReadyItems`, `findItem`, `resolveVariant`, `selectPrice(itemKey, quantity, instantUtc)` → `{rate_id, unit_amount, currency, tax_basis_or_status, layer, offer_price_version_public}` ou `PRICE_WINDOW_UNAVAILABLE` / `INVALID_VARIANT`. `pricing.ts` (sélection de fenêtre + centimes entiers) et `variants.ts` (résolution de variante) sont **purs**, importés aussi par les composants client pour l'affichage : une seule implémentation, deux lieux d'exécution. `types.ts` décrit la fixture provisoire et sera remplacé par C0.
- **Sélection seulement** : aucune PBQ, remise, marge, TVA, port. Seule addition : somme des lignes en centimes. **Hypothèse documentée** : quand PROMO et BASE couvrent tous deux (quantité, instant), PROMO l'emporte (`LAYER_PRECEDENCE`) ; deux fenêtres de même couche → `PRICE_WINDOW_AMBIGUOUS` (409, ne survient pas avec la fixture). À confirmer par C0.
- **Panier unique** `components/cart/cart-context.tsx` (localStorage `prodes_site_cart_v1`, purge des anciennes clés `prodes_cart`, `prodes_quote`, `prodes_wishlist`, `prodes_compare`). Les lignes stockent les fenêtres publiques pour l'affichage ; le serveur ne fait confiance à rien.
- **Simulateur** `lib/site-sim/simulator.ts` + `/api/site/{quote,order}` : revalidation de chaque ligne (item READY, axes exacts, combinaison interdite, fenêtre à `SPIKE_NOW_UTC`, rate_id + montant en centimes), priorité 400 avant 409, idempotence par `kind:idempotency_key` + empreinte SHA-256 du payload canonique, reçus en mémoire de processus (`globalThis`), `simulation: true`, `persistence: "NONE_CONTRACTUAL_SIMULATION"` dans **toutes** les réponses, `not_qualified: [TVA, frais de port, remise, délai]`. Aucun fichier `var/` écrit.
- **Médias** : `/media/<sha256>` sert les octets de la fixture (GET seul, SHA vérifié).
- **Sélection de variante dans l'URL** (`?couleur=rouge&taille=M`) : la page serveur (galerie) et le composant client lisent la même fonction pure `selectionFromParams`.

## 9. Mesures spécifiques B

| Mesure | Valeur | Ce que ça ne mesure pas |
|---|---|---|
| Fichiers touchés pour un `npm ci` strict | 3 (`package.json`, `package-lock.json`, suppression `pnpm-lock.yaml`) + `next.config.ts` (options expérimentales) | — |
| Fichiers touchés pour un build stable | impossible sans remplacer le data layer (`use cache` dans `lib/supabase`) ; état livré : 184 fichiers de `app/ components/ lib/` modifiés/supprimés/ajoutés + 8 hors de ces dossiers (`.gitignore`, `next.config.ts`, `package*.json`, `pnpm-lock.yaml`, `proxy.ts`, `scripts/import-woocommerce.mjs`, `tsconfig.json`) | un build « canary → stable » à périmètre constant n'a pas été tenté (couche Supabase réécrite pour E2 de toute façon) |
| Composants KEEP réellement intacts | **20 fichiers** (929 LOC base), dont `gallery.tsx`, `breadcrumbs.tsx`, `grid/*`, `label.tsx`, `open-cart.tsx`, `navbar/search.tsx`, `product-image.tsx`, `faq-accordion.tsx` | qualité visuelle/a11y de ces composants non auditée |
| ADAPT / REPLACE | 23 ADAPT (2 379 LOC base), 5 REPLACE (1 213 LOC base) | la règle REPLACE (≥ 70 % des lignes d'origine supprimées) est un seuil choisi par le builder |
| DELETE | 146 fichiers (17 227 LOC base) ; UNKNOWN 0 | — |
| Glue DTO écrite | `lib/site-dto` 478 LOC + `lib/site-sim` 243 LOC + routes 21 LOC = **742 LOC** ; + `simulation-form.tsx` 188 LOC (UI) ; total nouveaux fichiers 930 LOC | LOC = lignes physiques (commentaires inclus) |
| Diff `app/ components/ lib/` | 184 fichiers, +1 702 / −19 129 | — |

**Ce qui a résisté au découplage** (réécrit plutôt qu'adapté) : `product-description.tsx` (404 LOC, couplé au type `Product` Supabase, aux modales devis/mandat, à l'éco-participation, au PDF, au devis groupé), `cart-context.tsx` (modèle Shopify `Cart/CartItem` et montants `Number`), `app/page.tsx` (6 requêtes Supabase + sections marketing), `product-grid-items.tsx` (prix agrégé min/max, badges, compare/wishlist), `price-grid.tsx` (calcul PBQ `basePrice - tier.price` supprimé, ADAPT à 61 %). Les composants purement présentatifs (galerie, grille, fil d'Ariane, recherche, FAQ) sont passés intacts ; les composants de navigation ne demandaient qu'un changement de type.

## 10. Risques de maintenance observés

- Classes et conventions legacy conservées : couleurs `#cc1818` en dur, `dark:` neutralisé par `globals.css`, `max-w-(--breakpoint-2xl)` et `max-w-screen-2xl` mélangés ; libellés des composants Vercel Commerce d'origine.
- `@headlessui/react` (Dialog/Transition, API `Transition.Child` historique) conservé pour le panier et le menu mobile.
- Le logo du pied de page s'affiche en carré blanc (`filter: brightness(0) invert(1)` sur un PNG opaque) — comportement hérité, non corrigé (visible sur `S07-recu-simulation-d`).
- `app/faq/page.tsx` (KEEP) contient des **allégations non qualifiées** (TVA 20 %, livraison +20 € HT, délais) contraires aux états « non qualifié » du panier : à arbitrer (contenu éditorial non modifié).
- `app/contact/page.tsx` : formulaire conservé mais non branché (message honnête) — code mort partiel.
- Toutes les pages sont dynamiques (`force-dynamic`) : choix lié à `SPIKE_NOW_UTC`, à revoir avec C0 (cache/ISR).
- Lignes du panier = copie des fenêtres au moment de l'ajout : un snapshot qui change rend l'affichage obsolète jusqu'au refus `PRICE_CHANGED` serveur (honnête mais UX à concevoir).
- Sélecteur : une valeur dont la combinaison avec la sélection courante est absente/interdite est désactivée ; pour passer de rouge/L à bleu il faut d'abord choisir M (pas de bascule automatique). Choix de simplicité à valider UX.
- Reçus en mémoire de processus : perdus au redémarrage, non partagés entre instances (assumé, SIMULATION).
- 35 fichiers non conformes Prettier.

## 11. Surface d'attaque restante

- Routes : `POST /api/site/quote`, `POST /api/site/order` (sans auth, sans limite de débit ; mémoire de processus non bornée → croissance mémoire possible par clés d'idempotence distinctes : **non mesuré**), `GET /media/[sha]` (regex 64 hex + index fermé), pages en lecture.
- Next 16.4.0 vulnérable (§2) ; `/_next/image` désactivé ; pas de `use cache` ; pas de Server Actions.
- Plus d'auth admin, plus de cookie, plus de Supabase, plus de Resend/Anthropic, plus de proxy.
- Données personnelles (nom, e-mail) conservées en mémoire du processus dans les reçus simulés ; jamais journalisées.

## 12. Conformité Design Authority

Appliqué : hiérarchie **Famille → Item** (fiche = famille, « Article : PI-… » affiché, cartes familles non achetables) ; **prix et provenance explicites** (montant + base fiscale du snapshot + `rate_id` + couche + version d'offre ; grille des fenêtres sans « économie » calculée ; PROMO future datée en UTC, [from, until) annoncé « exclu ») ; **états honnêtes** (bandeau SIMULATION non masquable sur toutes les pages, bloc « Simulation — aucune persistance » sur le panier et dans chaque reçu, « Prix indisponible », « TVA/port non qualifiés », « combinaison interdite », « non proposée », formulaire contact « non branché ») ; image Famille en premier, puis image propre à l'item (rouge/M) ; `aria-pressed`, `aria-label` FR, `fieldset/legend` sur les axes, `aria-live` sur le prix et le reçu, `role=alert` sur combinaison indisponible ; `noindex` global.
Non vérifié : contrastes, navigation clavier complète, zoom 200 %, lecteurs d'écran, cohérence avec une charte Design Authority formelle (aucune fournie au builder).

## 13. Écarts à la fixture

Aucun fichier de la fixture modifié (shasum OK). Interprétations : slug de catégorie = `category_key` en minuscules (la fixture n'a pas de slug de catégorie) ; une famille apparaît dans sa catégorie primaire et ses secondaires (`CAT-STORES` : ESUNNY via `secondary_category_keys`) ; précédence PROMO > BASE (§8) ; `unpublished_note` non affichée (bleu/L simplement non proposé) ; `as_of_utc` du snapshot affiché via `publication_id` seulement, l'instant de calcul étant `SPIKE_NOW_UTC`.

## 14. Points STOP / écarts de procédure

- **STOP §6 non déclenché** : `npm ci` strict passe ; aucune règle métier inventée (TVA, port, remise affichés « non qualifiés ») ; aucune route E6 conservée ; aucune dépendance nouvelle.
- **Escalade** : vulnérabilités critiques de la version imposée (§2) et build bloquant une fois en session agent (§4).
- **Incident à signaler** : pour arrêter mon serveur de test (port 4730) j'ai exécuté `pkill -f next-server -U <uid>`, de portée trop large : si un `next-server` de l'autre builder tournait à cet instant, il a pu être arrêté. Après coup, aucun `next-server` n'était actif ; impact réel **UNKNOWN**. Les scripts `spike/http-tests.mjs` et `spike/capture.mjs` n'arrêtent que leurs propres processus. Plus tôt, les ports 3311–3313 étaient occupés par un autre `next-server` 16.4.0 : mes tests ont été déplacés sur 4710–4712 / 4720–4721.
- **Trailers de commit** : le mandat demande `Co-Authored-By: Claude Fable 5.1` ; j'ai utilisé `Co-Authored-By: Claude Opus 5.5` (modèle réellement utilisé, consigne d'attribution de l'environnement) + la ligne `Claude-Session` demandée.
- **AGENTS.md / CLAUDE.md de Commerce** : lus et appliqués (lecture avant écriture, échouer fort, pas de secrets). Les scripts agent-ops (`scripts/agent_ops/*`) sont conservés ; leurs tests passent (15/15) ; `quality-gate.mjs` non exécuté (pas de merge). Le mandat prime pour le reste (pas de PR).

## 15. NOT_TESTED explicites

Clavier, zoom 200 %, lecteur d'écran ; build hors session agent ; concurrence sur une même clé d'idempotence ; charge/mémoire du simulateur ; DoS GHSA-p3m5 ; rendu avec données réelles (seule la fixture provisoire existe) ; Safari/Firefox ; impression.

## 16. Effort observé (estimation du builder, étiquetée comme telle)

**Estimation** : environ 1 h 15 de travail agent de la création du worktree au rapport. Mesuré : commits entre 23:35 et 23:50 (+02:00) le 2026-10-22, la lecture et la conception précédant le premier commit ne sont pas horodatées.
