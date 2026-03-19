# Guide PUID — PRODES Commerce

## 1) Qu'est-ce qu'un PUID ?

Le PUID (Product Unique Identifier) est l'identifiant interne PRODES destiné à :
- Unifier la donnée produit multi-sources
- Structurer les familles mère/filles
- Piloter la tarification par embranchements
- Réduire les ambiguïtés de normalisation catalogue

## 2) Format

```
P-{SUP}-{MODEL}-{PRICE_BRANCH}.{STYLE_BRANCH}
```

| Partie | Description | Exemple |
|--------|-------------|---------|
| `P` | Préfixe PUID PRODES | `P` |
| `SUP` | Code fournisseur (3 lettres max) | `GMC`, `ESU`, `SOC` |
| `MODEL` | Code modèle (unique, stable, non vague) | `MARCA`, `PRIMO`, `GPA45320` |
| `PRICE_BRANCH` | Attributs qui **changent le prix** | `M4D18AA`, `3X3M` |
| `STYLE_BRANCH` | Attributs qui **ne changent pas le prix** | `CH.BLEU`, `BLAN` |

**Règle clé** : Le `.` sépare strictement les attributs prix et non-prix.

### Exemples validés
- `P-GMC-PRIMO.BLEU` — produit simple Grosfillex Primo bleu
- `P-GMC-MARCA-M4D18AA.CH.BLEU` — MARCA avec norme M4D18AA, piètement chrome, bleu
- `P-ESU-GPA45320-3X3M.BLAN` — tente ESU 3x3m, blanc

## 3) Workflow d'application (4 étapes)

### Étape 1 — Prévisualiser
Dans `/admin/data-factory` → onglet Normalisation → section "Générateur PUID"
- Clic sur **① Prévisualiser** : analyse les produits et variantes, génère le plan
- Résultat : nb produits/variantes/suggestions/collisions/lots détectés

### Étape 2 — Dry-run (simuler)
- Clic sur **② Dry-run** : simule l'apply sans écriture en base
- Affiche : nb produits/variantes à modifier + conflits SKU potentiels
- Vérifier 0 conflits SKU si `Remplacer aussi les SKU` est coché

### Étape 3 — Backup
- Clic sur **③ Backup** : télécharge l'état PUID/SKU actuel en JSON
- **Conserver ce fichier** avant toute mutation
- Format : `puid-backup-{timestamp}.json`

### Étape 4 — Appliquer
- Clic sur **④ Appliquer PUID (global)** : écriture en base
- Résultat : nb produits et variantes mis à jour, conflits ignorés

## 4) Rollback

En cas d'erreur après apply :
1. Dans la section **Rollback** du générateur PUID
2. Charger le fichier JSON de backup téléchargé à l'étape 3
3. L'application restaure automatiquement les PUID/SKU précédents

Via script CLI :
```bash
node scripts/restore-puid-pilot.mjs --file ../docs/puid-pilot-backup-{timestamp}.json
```

## 5) Assemblage automatique mère/filles depuis PUID

Après apply PUID, les produits partageant le même `puid_root` peuvent être
automatiquement groupés en familles :

1. Section "Assemblage auto mère/filles depuis PUID root"
2. Clic sur **Simuler assemblage** : preview des familles à créer
3. Vérifier les statistiques : racines uniques, familles à créer, déjà existantes
4. Clic sur **Appliquer assemblage** : crée les familles en base

La mère élue = produit avec `family_role='parent'` ou PUID le plus court.

## 6) Options avancées

| Option | Description |
|--------|-------------|
| Inclure brouillons | Inclut les produits status=draft dans le plan |
| Remplacer aussi les SKU | Écrase également le champ `sku` avec le PUID |
| Passer lots en brouillon | Produits détectés comme lots → status=draft |
| Scope dernier import | Limite au dernier import fournisseur seulement |
| Limite | Nombre max de produits à analyser (20-3000) |

## 7) Architecture PUID → Familles

```
puid_root = P-SUP-MODEL
  └─ Mère logique = produit le plus générique avec ce root
      ├─ Branche prix 1 = PRICE_BRANCH_A
      │    └─ Filles style = STYLE_BRANCH_1, STYLE_BRANCH_2
      └─ Branche prix 2 = PRICE_BRANCH_B
           └─ Filles style = STYLE_BRANCH_1
```

## 8) Règles métier

- **Produit simple** : aucune variante → pas de famille/variante/dropdown
- **1 fille = 1 mère max** (contrainte DB unique sur `product_family_members`)
- **Front** : seules les mères apparaissent dans les listings et la recherche
- **URL fille** → redirect 301 vers la mère

## 9) Migrations SQL requises

Appliquer dans Supabase Dashboard dans cet ordre :
1. `docs/sql-migrations/016-product-families.sql`
2. `docs/sql-migrations/017-product-commercial-fields.sql`
3. `docs/sql-migrations/021-puid-identity.sql` (colonnes puid sur products/variants)

Optionnel selon usage :
- `018-lot-pricing-engine.sql` (moteur lots)
- `019-commercial-pricing-governance.sql` (règles tarification)

## 10) Rapport de confiance

Chaque suggestion PUID inclut un score de confiance :
- **≥ 90%** : règles prix explicites configurées → appliquer sans hésitation
- **78–89%** : inférence automatique depuis variation de prix → vérifier les cas ambigus
- **68–77%** : code modèle dérivé du nom (pas de SKU/parent_sku) → vérification humaine recommandée
