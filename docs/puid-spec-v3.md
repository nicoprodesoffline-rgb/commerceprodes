# PUID Spec V3 (PRODES)

## 1) But

Le PUID est l'identifiant produit interne destiné à:

- unifier la donnée produit multi-sources,
- structurer mère/filles,
- piloter la tarification par embranchements,
- réduire les ambiguïtés de normalisation.

## 2) Format

Format cible:
`P-{SUP}-{MODEL}-{PRICE_BRANCH}.{STYLE_BRANCH}`

Parties:

- `P`: préfixe système PUID PRODES.
- `SUP`: code fournisseur (3 lettres max, stable).
- `MODEL`: code modèle produit (non ambigu, stable, non générique).
- `PRICE_BRANCH`: concat des attributs qui impactent le prix.
- `STYLE_BRANCH`: concat des attributs qui n'impactent pas le prix.

Notes:

- Le point `.` sépare strictement impact-prix et non-impact-prix.
- Si pas d'attribut style, la partie `.STYLE_BRANCH` peut être omise.
- Ne jamais ajouter de tokens "NA" / placeholders inutiles.

## 3) Principes de codification

### 3.1 SUP

- Priorité:
  1. `supplier_code` explicite,
  2. inférence depuis SKU/ref fournisseur,
  3. fallback contrôlé.

### 3.2 MODEL

- Interdit: codes vagues (`GAMME`, `TABLE`, etc.).
- Priorité:
  1. parent_sku/référence racine fiable,
  2. code stable dérivé du nom (filtrage mots bruit),
  3. fallback court unique.

### 3.3 PRICE_BRANCH (avant point)

- Inclure seulement les attributs qui impactent le prix:
  - ex: norme, dimensions, options techniques, finition impactante.
- Ordre recommandé:
  1. norme,
  2. dimension,
  3. option technique,
  4. autres axes prix.

### 3.4 STYLE_BRANCH (après point)

- Inclure attributs non impact prix:
  - ex: coloris, piètement décoratif non-impactant.
- Ordre stable et prédictible.

## 4) Exemples

- `P-GMC-PRIMO.BLEU`
- `P-GMC-MARCA-M4D18AA.CH.BLEU`
- `P-ESU-GPA45320-3X3M.BLAN`

Ces exemples sont indicatifs: la priorité est la stabilité et l'unicité réelle.

## 5) Règles d'unicité

- Un PUID doit pointer vers une seule entité commerciale.
- Collision => suffixe contrôlé ou recalcul MODEL/branches selon heuristique.
- Journaliser toute collision et décision de résolution.

## 6) Lots legacy

- Les lots historiques (faux produits créés pour WooCommerce) ne doivent pas
  polluer la structure PUID produit.
- Les lots deviennent une couche tarifaire (promo/lot-pricing), pas une
  explosion de variantes.

## 7) PUID et mères/filles

- `root` = `P-SUP-MODEL`.
- Mère logique candidate = `root`.
- Branches filles = `PRICE_BRANCH`.
- Sous-filles / options style = `STYLE_BRANCH`.

On doit pouvoir appliquer une règle tarifaire sur:

- tout le root,
- une branche prix,
- un sous-ensemble style.

## 8) Pipeline recommandé

1. Extraction brute catalogue.
2. Normalisation tokens attributs.
3. Détection impact-prix vs style.
4. Génération PUID (preview).
5. Contrôle collisions + confiance + audit humain si ambigu.
6. Apply PUID avec backup.
7. Assemblage mère/filles basé sur root + branches.

## 9) Scripts minimum attendus

- backup pre-apply,
- dry-run détaillé,
- apply pilot,
- apply global,
- rollback complet.
