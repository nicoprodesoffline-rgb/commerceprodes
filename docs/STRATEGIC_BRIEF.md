# PRODES Commerce — Strategic Brief

_Rédigé par Claude · 10 mars 2026_

---

## 0. Contexte de ce document

Ce brief est produit après :

- Audit complet du code (tsc, qualité, fichiers Codex sessions 12→18)
- Analyse de compatibilité RETAB vs DB/types actuels
- Relecture de tous les morning reports, puid-spec-v3, rapport-benchmark-retab, rapport-final

**Destinataires :** Claude (sessions futures), Codex (sessions autonomes), toi.

---

## 1. État des lieux — Ce qui existe aujourd'hui

### 1.1 Santé du code

| Indicateur          | Valeur                         | Notes                                     |
| ------------------- | ------------------------------ | ----------------------------------------- |
| TypeScript errors   | **0** (code PRODES)            | 2 erreurs dans lib/shopify (fichier mort) |
| Build               | **✅ 78/78 pages**             | Vérifié session 18                        |
| Migrations fichiers | 016, 017, 018, 019, 021 créées | **Pas confirmées appliquées en Supabase** |
| Tests               | **0**                          | Aucun test unitaire/E2E                   |

### 1.2 Fonctionnalités livrées (sessions 1→18)

**Core e-commerce**

- Catalogue Supabase 983 produits / 6806 variants, filtres URL-persistants
- PBQ prix dégressifs (fixed + percentage), variante sélecteur
- Panier localStorage (CartContext), checkout B2B 4 modes paiement
- Devis groupé, panier partageable, wishlist, comparateur
- Quick Order Bar (SKU), live search autocomplete, breadcrumbs

**Features B2B**

- Devis-express (Chorus Pro, type organisme), timeline suivi devis
- Gamme PRO-INTENS, recently viewed, badges produits
- Pagination catalogue 24/page + Voir plus
- Descriptions IA produits (batch, API en place, ANTHROPIC_API_KEY manquante)

**Backoffice admin**

- Dashboard 6 stats réelles, tableau produits paginé 50/page
- Vue Excel V2 avec detection doublons + search builder + filtre rôle famille
- IA 6 modules (audit SEO, descriptions, doublons, prix masse, CTA thématique, IA familles)
- Import CSV drag-drop + n8n webhook
- Familles produits UI (3 onglets), Variations Workbench inline

**Infrastructure PUID**

- PUID spec v3 : `P-{SUP}-{MODEL}-{PRICE_BRANCH}.{STYLE_BRANCH}`
- lib/admin/puid.ts ~744 lignes (dry-run, backup/restore, collision detection)
- API : preview, apply, backup, restore, assemble-families
- Colonnes puid/puid_root/puid_price_branch/puid_style_branch sur products + variants (migration 021)

**Familles produits**

- Migrations 016-017 : product_families, product_family_members, product_family_candidates
- 10 endpoints API (CRUD, assembly, disassembly, suggest, audit, export CSV)
- SEO front : redirect 301 enfants → parent, exclusion enfants du search
- IA module 6 : analyse automatique + apply suggestions

**Sécurité**

- Rate limiting Edge Middleware (10 req/min admin IA, 120 req/min resto)
- safeError(), sanitisation inputs, anti-fuite d'erreurs en prod

**Orchestration**

- Dashboard localhost:8787 (Scénarios A/B/C/D), terminal WebSocket Claude Code
- Chat IA dans Panel A (Sonnet/Opus/Haiku), Audit 76 items
- relay.sh : init/start/end/auto-pick

### 1.3 Ce qui est en attente / fragile

| Item                           | Statut              | Risque                                             |
| ------------------------------ | ------------------- | -------------------------------------------------- |
| Migrations 016-021 en Supabase | ❓ non confirmé     | **BLOQUANT** pour toute la stack familles/PUID     |
| RETAB → PRODES adapter         | 🔴 inexistant       | Aucun code lib/retab/ ni route /api/admin/retab    |
| lib/email/sender.ts adoption   | 🟡 partielle        | Routes /contact, /devis, /devis-express en attente |
| RESEND_API_KEY                 | 🔴 non configurée   | Emails silencieusement dégradés                    |
| ANTHROPIC_API_KEY              | 🔴 non configurée   | Module IA descriptions inactif                     |
| N8N webhooks                   | 🔴 non configurés   | Import pipeline externe non opérationnel           |
| Tests                          | 🔴 0 tests          | Régressions invisibles                             |
| data-factory/page.tsx          | 🟡 86 KB monolithic | Maintenance difficile                              |

---

## 2. Analyse critique RETAB → PRODES

### 2.1 Ce que Codex a déjà fait (session 16)

Codex a produit :

- `docs/rapport-benchmark-retab.md` — 4 kits d'extraction (A/B/C/D), tests sur Grosfillex
- `docs/retab_extraction.json` — schéma **plat** 40+ champs (une ligne = un produit)

**Problème du schéma plat actuel :** il extrait chaque ligne indépendamment, sans contexte de famille. Résultat : axes_prix vs axes_style doivent être inférés après coup (c'est ce que fait buildPuidPlan() par heuristique), ce qui réduit la fiabilité.

### 2.2 Ce qu'il faut construire (approche hiérarchique)

**Principe :** extraire une famille entière comme un objet, pas ligne par ligne.

```json
{
  "fournisseur": "GMCE",
  "familles": [
    {
      "nom_gamme": "HELENE",
      "type_produit": "variable",
      "variantes": [
        {
          "sku": "AR00003",
          "sku_genere": false,
          "designation_brute": "M4 SANS ACCROCHES CHROMES OU NOIRS",
          "prix_ht": 18.08,
          "eco_taxe": 0.57,
          "axes_prix": { "norme_pietement": "M4", "accroches": "SANS" },
          "axes_style": { "coloris_pietement": ["CHROMES", "NOIRS"] }
        }
      ],
      "plus_values": [
        {
          "sku": null,
          "designation": "plus value diametre 22",
          "delta_prix_ht": 0.4
        }
      ],
      "options": []
    }
  ]
}
```

**Pourquoi ça marche :** `chunking_keys: {"familles": "nom_gamme"}` dans Retab traite chaque famille en contexte isolé. Le LLM compare les prix **dans le groupe** → classe axes_prix vs axes_style sans heuristique.

### 2.3 Compatibilité avec la DB actuelle

Le schéma hiérarchique RETAB mappe directement sur la stack existante :

```
RETAB familles.nom_gamme     → product_families.name
RETAB familles.variantes[]   → products + variants
RETAB variantes.axes_prix    → pricing_attribute_rules (impacts_price: true)
RETAB variantes.axes_style   → pricing_attribute_rules (impacts_price: false)
RETAB plus_values[]          → product_lot_offers ou pricing_attribute_rules
RETAB variantes.puid_root    → puid_root (migration 021, calculable depuis nom_gamme+fournisseur)
```

**Ce qu'il manque :** un adapter `lib/retab/adapter.ts` + une route `POST /api/admin/data-factory/retab/ingest`.

### 2.4 Pipeline cible RETAB → PRODES

```
[Catalogue PDF/Excel fournisseur]
        ↓
[Retab : schéma hiérarchique + chunking_keys + n_consensus=2]
        ↓
[JSON familles[]{variantes, axes_prix, axes_style, plus_values}]
        ↓
[POST /api/admin/data-factory/retab/ingest]
    → Validate schema (lib/retab/schema.ts)
    → Build PUID (buildPuidPlan() existant, nourri par axes_prix)
    → Create product_families + products + variants
    → Create pricing_attribute_rules
    → Return preview (dry_run) ou apply
        ↓
[Dashboard admin → Data Factory → onglet "Extraction Retab"]
```

---

## 3. Roadmap 4 semaines

### Semaine 1 (10-17 mars) — STABILISATION & FONDATIONS

**Objectif :** base stable, migrations appliquées, RETAB adapter créé.

| Priorité | Tâche                                                               | Qui    | Effort    |
| -------- | ------------------------------------------------------------------- | ------ | --------- |
| 🔴 P0    | Appliquer migrations 016-021 en Supabase + vérifier                 | Toi    | 30 min    |
| 🔴 P0    | Créer `lib/retab/schema.ts` + `lib/retab/adapter.ts`                | Codex  | 1 session |
| 🔴 P0    | Route `POST /api/admin/data-factory/retab/ingest` (dry_run + apply) | Codex  | 1 session |
| 🟡 P1    | Configurer RESEND_API_KEY + tester emails                           | Toi    | 15 min    |
| 🟡 P1    | Configurer ANTHROPIC_API_KEY                                        | Toi    | 10 min    |
| 🟡 P1    | Adopter lib/email/sender.ts dans /contact, /devis, /devis-express   | Codex  | 30 min    |
| 🟢 P2    | Runbook migrations (doc comment appliquer 018-021 en ordre)         | Claude | 30 min    |

**Gate de fin de S1 :** `POST /api/admin/data-factory/retab/ingest` accepte un JSON RETAB et crée correctement familles + produits + PUID en dry-run.

---

### Semaine 2 (17-24 mars) — PIPELINE RETAB OPÉRATIONNEL

**Objectif :** premier vrai catalogue extrait → importé en DB → visible sur le site.

| Priorité | Tâche                                                                          | Qui          | Effort    |
| -------- | ------------------------------------------------------------------------------ | ------------ | --------- |
| 🔴 P0    | Créer projet Retab "PRODES-Universal" avec schéma hiérarchique                 | Toi + Claude | 2h        |
| 🔴 P0    | Test extraction catalogue GMCE (PDF) avec chunking + n_consensus=2             | Toi          | 1h        |
| 🔴 P0    | Ingestion résultat extraction → dry-run → review doublons PUID                 | Toi          | 1h        |
| 🟡 P1    | Onglet "Extraction Retab" dans Data Factory UI (upload JSON + preview)         | Codex        | 1 session |
| 🟡 P1    | Webhook Retab → PRODES (automatisation end-to-end sans upload manuel)          | Codex        | 1 session |
| 🟡 P1    | MCP Retab installé dans Claude Desktop (generate_schema nouveaux fournisseurs) | Toi          | 30 min    |
| 🟢 P2    | Écrire prompt système fournisseur GMCE (détecteur de mère = colonne PRODUITS)  | Claude       | 30 min    |
| 🟢 P2    | Écrire prompt système fournisseur BENITO (préfixe SKU)                         | Claude       | 30 min    |

**Gate de fin de S2 :** un catalogue GMCE réel → extraction Retab → ingestion → 20+ produits créés en DB avec PUID correct, familles assemblées, axes prix/style renseignés.

---

### Semaine 3 (24-31 mars) — CONSOLIDATION DATA & QUALITÉ

**Objectif :** données propres, PUID appliqués aux produits existants, premiers tests.

| Priorité | Tâche                                                                                  | Qui    | Effort    |
| -------- | -------------------------------------------------------------------------------------- | ------ | --------- |
| 🔴 P0    | PUID appliqués aux 983 produits existants (finaliser session Codex en cours)           | Codex  | en cours  |
| 🔴 P0    | Audit PUID consistency post-application (doublons, collisions, orphelins)              | Claude | 1h        |
| 🟡 P1    | Assembler familles mère/filles depuis PUID root (assemble-families route)              | Toi    | 30 min    |
| 🟡 P1    | Backfill parent_sku, eco_contribution, supplier sur variants (script Codex session 18) | Codex  | 1 session |
| 🟡 P1    | Filtres avancés catalogue (slider double-thumb prix + fournisseur)                     | Codex  | 1 session |
| 🟢 P2    | Tests HTTP critiques : 20 routes prioritaires (checkout, devis, search, admin)         | Codex  | 1 session |
| 🟢 P2    | Pagination côté API (cursor-based vs offset, benchmark)                                | Claude | 30 min    |

**Gate de fin de S3 :** 983 produits avec PUID, familles assemblées, 0 collision PUID, filtres avancés en prod.

---

### Semaine 4 (31 mars - 7 avril) — FONCTIONNALITÉS AVANCÉES & AGENTS

**Objectif :** première boucle complète fournisseur → catalogue → B2B client.

| Priorité | Tâche                                                                      | Qui            | Effort     |
| -------- | -------------------------------------------------------------------------- | -------------- | ---------- |
| 🔴 P0    | Deploy preview Vercel documenté + testé                                    | Toi + Claude   | 1h         |
| 🟡 P1    | Admin /devis : actions rapides (accepter/refuser/relancer)                 | Codex          | 1 session  |
| 🟡 P1    | Checkout : création compte B2B (migration users table)                     | Codex          | 1 session  |
| 🟡 P1    | Descriptions IA produits en batch (ANTHROPIC_API_KEY configurée)           | Toi            | 1h         |
| 🟢 P2    | Pagination catalogue (24/page déjà livré — optimiser load)                 | Codex          | 1 session  |
| 🟢 P2    | N8N webhooks configurés (COMPETITIVE + IMPORT + DESCRIPTIONS + WEEKLY)     | Toi            | 2h         |
| 🟢 P2    | IA enrichissement produits depuis fiches extractées (Retab → descriptions) | Claude + Codex | 2 sessions |

**Gate de fin de S4 :** pipeline complet opérationnel — catalogue fournisseur → extraction Retab → produits PRODES → visible sur site → commande B2B possible.

---

## 4. Architecture agents IA

### 4.1 Rôles actuels (clarifiés)

```
┌─────────────────────────────────────────────────────────────┐
│  TOI (humain)                                               │
│  • Valider les décisions architecturales                    │
│  • Configurer les env vars, appliquer les migrations SQL    │
│  • Tester manuellement les flux B2B critiques               │
│  • Lancer les sessions Retab (upload catalogue, review)     │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ↓                         ↓
┌─────────────────┐       ┌─────────────────────┐
│  CLAUDE         │       │  CODEX              │
│  (stratégie)    │       │  (implémentation)   │
│  • Architecture │       │  • API routes       │
│  • Schémas RETAB│       │  • Migrations SQL   │
│  • Code review  │       │  • Components React │
│  • Idéation     │       │  • Scripts batch    │
│  • Roadmap      │       │  • Tests HTTP       │
│  • Prompts      │       │  • Build/tsc check  │
└─────────────────┘       └─────────────────────┘
          │                         │
          └────────────┬────────────┘
                       ↓
              ┌─────────────────┐
              │  RETAB          │
              │  (extraction)   │
              │  • PDF → JSON   │
              │  • Excel → JSON │
              │  • Chunking     │
              │  • Consensus    │
              └─────────────────┘
```

### 4.2 Sous-agents à créer (court terme — dans le workflow dev)

**1. `puid-validator` (Codex ou script)**

```
Input: liste produits/variants de Supabase
Output: rapport collisions, orphelins, PUID malformés, familles incomplètes
Trigger: après chaque session PUID ou import catalogue
Intégration: /api/admin/data-factory/puid → rapport automatique
```

**2. `retab-ingester` (route API + lib)**

```
Input: JSON RETAB (familles hiérarchiques)
Output: preview dry-run OU application en DB avec stats
Trigger: webhook Retab OU upload manuel dans Data Factory
Intégration: lib/retab/adapter.ts → buildPuidPlan() → Supabase
```

**3. `quality-gate` (Claude Code skill)**

```
Trigger: fin de chaque session Codex avant merge
Actions: tsc --noEmit, next build, tests HTTP critiques (20 routes)
Output: rapport pass/fail, liste erreurs bloquantes
Intégration: relay.sh end → auto-gate avant close
```

**4. `catalog-enricher` (sous-agent IA)**

```
Input: produits sans description_complete
Output: descriptions enrichies via ANTHROPIC_API_KEY
Modèle: Haiku (batch économique)
Trigger: post-import catalogue OU planifié hebdomadaire
Intégration: /api/admin/ia/generate-descriptions (déjà en place)
```

### 4.3 Agents futurs (usage du site par les clients B2B)

**5. `devis-assistant` (agent B2B)**

```
Rôle: répondre aux demandes de devis complexes (multi-produits, négociation)
Input: formulaire devis + contexte client (collectivité, budget, délai)
Output: devis pré-rempli avec pricing PRODES (PBQ + lots)
Tech: Claude API + QuoteContext + product data
Déclencheur: formulaire devis-express OU chat client
```

**6. `catalog-chat` (RAG produits)**

```
Rôle: "Je cherche un banc extérieur anti-graffiti 1800mm inox, budget 400€ HT"
Tech: embeddings Supabase pgvector + Claude Haiku
Input: requête client NL → matching familles PUID
Output: 3-5 produits + comparaison + lien vers fiche
Intégration: widget site OU chat admin
```

**7. `price-watch-agent` (veille concurrentielle)**

```
Rôle: surveiller les prix concurrents, alerter sur les écarts
Input: competitor_prices table (déjà en place)
Output: suggestions ajustements prix + rapport hebdomadaire
Tech: n8n + Claude analyse + webhook PRODES
Trigger: webhook WEEKLY
```

**8. `import-orchestrator` (pipeline autonome)**

```
Rôle: pipeline complet sans intervention humaine
Flow: détection nouveau catalogue → Retab extraction → validation → dry-run → alerte humain si anomalie → apply si clean
Tech: n8n workflow + Retab webhook + PRODES /api/admin/data-factory/retab
Trigger: n8n IMPORT webhook ou CRON
```

### 4.4 Skills Claude Code à créer

```bash
# /retab-schema — Générer/mettre à jour le schéma Retab pour un fournisseur
# Usage: /retab-schema [fournisseur] [fichier_exemple]
# Action: appelle MCP generate_schema sur le fichier, affine avec les règles PUID

# /puid-plan — Prévisualiser le plan PUID sans appliquer
# Usage: /puid-plan [scope: all|latest_import]
# Action: GET /api/admin/data-factory/puid?dry_run=true → tableau preview

# /migration-check — Vérifier quelles migrations sont appliquées en Supabase
# Usage: /migration-check
# Action: interroge Supabase information_schema pour chaque migration attendue

# /quality-gate — Lancer le gate complet avant clôture de session
# Usage: /quality-gate
# Action: tsc --noEmit + build check + 20 HTTP tests critiques → rapport pass/fail

# /catalog-import — Pipeline complet import catalogue
# Usage: /catalog-import [fichier PDF/Excel] [fournisseur]
# Action: Retab extraction → dry-run → preview → confirmation → apply
```

---

## 5. Restructuration de la connaissance partagée Claude/Codex

### 5.1 Fichiers de contexte à créer/maintenir

**`docs/CONTEXT_CODEX.md`** — ce que Codex doit savoir avant chaque session

```
- Stack technique (Next.js 15, Supabase, TypeScript strict)
- Règles impératives (jamais modifier lib/shopify/, toujours dry_run=true d'abord)
- DB state (colonnes qui existent, migrations appliquées)
- Patterns interdits (as any, parseInt sans radix, fetch sans .ok check)
- Patterns attendus (adminFetch, checkAdminAuth, safeError, checkFamiliesDb)
```

**`docs/CONTEXT_RETAB.md`** — configuration extraction par fournisseur

```
- Schéma universel hiérarchique
- Prompt système par fournisseur (GMCE/BENITO/Socomix/MOTTEZ)
- Kits A/B/C/D et quand les utiliser
- Règle axes_prix vs axes_style
```

**`docs/DB_STATE.md`** — état réel de la DB Supabase

```
- Liste colonnes existantes (vs ce qu'on pense qui existe)
- Migrations appliquées vs en attente
- Contraintes importantes (unicité familles, etc.)
```

### 5.2 Prompts Codex à standardiser

**Prompt ouverture session standard :**

```
Contexte: PRODES Commerce, Next.js 15 + Supabase, TypeScript strict.
Repo: /Users/nico/Desktop/prodes_newsite_codex/commerce
Build actuel: 78/78 pages ✅, tsc clean ✅

Règles impératives:
- TOUJOURS dry_run=true pour les opérations DB avant apply
- TOUJOURS checkAdminAuth() sur les routes admin
- JAMAIS as any (utiliser les types appropriés)
- JAMAIS parseInt(x) sans radix parseInt(x, 10)
- TOUJOURS vérifier response.ok dans adminFetch
- Finir par: tsc --noEmit + next build avant de clore

Tâche: [DESCRIPTION TÂCHE]

Livrable attendu: [CODE + morning-report-XX.md mis à jour]
```

**Prompt session RETAB :**

```
Contexte RETAB:
- Schéma cible: familles[]{nom_gamme, variantes[]{sku, axes_prix, axes_style}, plus_values, options}
- Règle clé: si prix change avec attribut → axes_prix. Sinon → axes_style.
- chunking_keys: {"familles": "nom_gamme"} (obligatoire)
- n_consensus: 2 pour les catalogues critiques

Adapter cible: lib/retab/adapter.ts → PuidVariantAttr[] → buildPuidPlan()
Route cible: POST /api/admin/data-factory/retab/ingest
```

---

## 6. Priorités immédiates (cette semaine)

**Toi maintenant :**

1. Vérifier et appliquer les migrations 016-021 dans Supabase SQL Editor
2. Configurer RESEND_API_KEY + ANTHROPIC_API_KEY dans Vercel/env
3. Installer le MCP Retab dans Claude Desktop

**Codex (session en cours) :** finir l'application PUID sur les 983 produits

**Claude (cette session) :**

1. Créer `docs/CONTEXT_CODEX.md` (contexte Codex standard)
2. Créer `docs/CONTEXT_RETAB.md` (specs RETAB + prompts fournisseurs)
3. Écrire le schéma JSON Retab hiérarchique (fichier prêt à coller dans Retab dashboard)

---

## 7. Questions ouvertes à trancher

| Question                                               | Enjeu                    | Ma recommandation                                                         |
| ------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------- |
| Schéma RETAB plat (actuel) vs hiérarchique (nouveau) ? | Qualité axes prix/style  | **Hiérarchique** — chunking_keys change tout                              |
| Un projet Retab unique vs un par fournisseur ?         | Maintenabilité           | **Projet unique** avec prompt fournisseur-spécifique dans System Prompt   |
| PUID sur variants ou sur products ?                    | Architecture mère/filles | **Les deux** — product PUID = root (mère), variant PUID = complet (fille) |
| Tests : Jest ou Playwright ?                           | Coverage                 | **Playwright** pour E2E checkout/devis, Jest pour lib/admin/puid.ts       |
| Déploiement : Vercel Preview Branches ?                | CI/CD                    | **Oui** — une branche Codex = une preview automatique                     |

---

_Ce document est la référence stratégique partagée. À mettre à jour à chaque reconsolidation (toutes les 2-3 semaines)._
