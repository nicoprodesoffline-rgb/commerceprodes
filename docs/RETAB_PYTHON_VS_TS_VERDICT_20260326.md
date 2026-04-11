# RETAB Python vs TS — Verdict d'Architecture — 2026-03-26

## Contexte

Deux stacks coexistent pour le traitement des données fournisseur :

1. **Python pipeline** : `extract.py → expand.py → puid_generator.py → supabase_import.py`
2. **TypeScript** : `lib/retab/adapter.ts` + route `app/api/admin/data-factory/retab/ingest/route.ts` + `lib/admin/puid.ts`

Ce document acte le verdict d'architecture suite à l'analyse du run overnight 2026-03-26.

---

## 1. adapter.ts — Statut : VIVANT (utile mais limité)

**Que fait-il exactement :**

- Transformation pure `expanded JSON → objets Supabase typés`
- Gère les 2 formats d'entrée : expanded (products/variants) et raw (familles/lignes)
- Produit : families, products, variants, pricing_profiles, lot_offers, attribute_registry
- Calcule `attributs_prix JSONB`, `_price_branch`, `_style_branch` par variante
- Détecte les profils de tarification en groupant par price_branch
- Ne gère PAS : PUID, insertions DB, images/SEO

**Verdict : VIVANT, non redondant avec Python**

La logique TypeScript de `buildAttributsJson` et `partitionAttrs` est différente du `_build_computed_attrs` Python ajouté ce run. Les deux peuvent coexister sans conflit :

- L'adapter TS sert la route API Next.js (preview/dry-run UI)
- Le pipeline Python est le chemin canonique pour les imports batch

**Ce qui est safe à garder :**

- Toute la logique de transformation
- Les types TypeScript (interfaces RetabExpandedProduct, etc.)
- La méthode `adaptRetabToSupabase()` — elle est testée et propre

---

## 2. retab/ingest route — Statut : VIVANTE (dry-run UI uniquement)

**Que fait-elle exactement :**

- Route POST `/api/admin/data-factory/retab/ingest`
- Accepte les 3 formats : expanded, raw familles, extracted wrapped
- Valide l'input, vérifie les limites (10MB, 500 produits, 10k variantes)
- Appelle `adaptRetabToSupabase()` et retourne un JSON de preview
- Ne supporte que `dry_run=true` (écriture bloquée hardcodée)

**Verdict : VIVANTE, rôle clair = UI preview**

Cette route est utile pour un outil d'audit dans l'admin. Elle ne concurrence pas le pipeline Python.

**Risque identifié :**

- Elle ne produit pas de PUID (c'est normal pour son rôle)
- Si un jour on veut un import via UI, il faudra brancher `puid_generator.py` en Python ou le re-implémenter en TS — décision à prendre en session interactive

---

## 3. puid.ts — Statut : LEGACY/AUDIT

**Que fait-il exactement :**

- Lit les produits/variantes depuis Supabase (via SupabaseClient)
- Génère des suggestions PUID basées sur les données legacy WooCommerce
- Logique de compactage MODEL différente de la spec v4 (noise words différents)
- Ne lit PAS les expanded JSONs — il travaille sur les données déjà en base
- Utilisé par l'outil d'audit admin `/admin/produits` pour suggérer des PUIDs sur les produits existants

**Verdict : LEGACY/AUDIT — ne pas modifier, ne pas remplacer pour l'instant**

Il sert un rôle différent : rétrospectif sur les données déjà en base.
Le pipeline Python (`puid_generator.py`) sert le flux prospectif (nouveaux imports).

**Ce qui peut être déprécié sans risque :**

- Rien pour l'instant — attendre que les données legacy soient migrées vers le nouveau modèle

---

## 4. Verdict global : Coexistence bornée

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUX PROSPECTIF (nouveaux imports)        │
│                                                             │
│  extract.py → expand.py → puid_generator.py →              │
│  supabase_import.py                                         │
│  (Python, batch, offline)                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    FLUX UI (preview admin)                   │
│                                                             │
│  retab/ingest route → adapter.ts                            │
│  (TypeScript, Next.js, dry-run uniquement)                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    AUDIT LEGACY                              │
│                                                             │
│  puid.ts → audit des produits déjà en base                  │
│  (TypeScript, Supabase-connected, read-only)                │
└─────────────────────────────────────────────────────────────┘
```

**Règles de gouvernance :**

| Décision                   | Responsable                                        |
| -------------------------- | -------------------------------------------------- |
| Logique métier d'expansion | Python (expand.py)                                 |
| Génération PUID batch      | Python (puid_generator.py)                         |
| Import Supabase            | Python (supabase_import.py) — après migration 022  |
| Preview UI admin           | TypeScript (adapter.ts + ingest route)             |
| Audit PUID legacy          | TypeScript (puid.ts)                               |
| Synchronisation des types  | Le fichier adapter.ts fait foi pour les interfaces |

**Ce qui est safe à faire sans session interactive :**

- Modifier expand.py (additif, régression verte)
- Améliorer puid_generator.py (nouveau fichier)
- Améliorer supabase_import.py (dry-run forcé)
- Ajouter des tests Python

**Ce qui requiert validation humaine :**

- Modifier adapter.ts (contrats TS à ne pas casser)
- Activer le mode write dans supabase_import.py
- Toucher à puid.ts (données legacy en base)
- Déprécier la route retab/ingest

---

_Rédigé par Claude (run overnight 2026-03-26) — à valider en session interactive avec Nico._
