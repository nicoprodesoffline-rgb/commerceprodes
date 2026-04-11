# PUID Spec V4 (PRODES)

_Consolidé le 2026-03-24 — session Claude + Nico_
_Remplace puid-spec-v3.md pour les nouveaux imports pipeline Retab._

---

## 1) But

Le PUID est l'identifiant produit interne PRODES destiné à :

- unifier la donnée produit multi-sources,
- structurer mère/filles,
- piloter la tarification par embranchements,
- permettre la réconciliation inter-catalogues (2026 → 2027).

## 2) Format

```
P-{SUP}-{MODEL}[-{PRICE_TOKENS}][.{STYLE_TOKENS}]
```

### Parties :

- `P` : préfixe système PUID PRODES.
- `SUP` : code fournisseur (3 lettres, stable). Ex: GRO, GMC, MOT, SOC.
- `MODEL` : code modèle produit compacté (8 chars max, déterministe). Voir §3.2.
- `PRICE_TOKENS` : tous les axes prix encodés, séparés par `-`.
- `STYLE_TOKENS` : axes style encodés, séparés par `.` entre axes, collés à l'intérieur d'un axe.

### Séparateurs :

- `-` sépare SUP, MODEL et les tokens prix entre eux.
- `.` sépare la partie prix de la partie style, et les tokens style entre eux.
- Pas de tiret ni de point à l'intérieur d'un token (valeurs composites collées).

## 3) Principes de codification

### 3.1 SUP

3 premières lettres du champ `fournisseur` dans le expanded JSON.

### 3.2 MODEL — règle de compactage 8 chars

Source : `product.ref` strippée du préfixe fournisseur, noise words filtrés.

Distribution des caractères sur les tokens restants (8 au total) :

- 1 token → 8 chars
- 2 tokens → 4+4
- 3 tokens → 4+2+2
- 4 tokens → 2+2+2+2
- 5 tokens → 2+2+2+1+1
- ...jusqu'à 1+1+1+1+1+1+1+1

Si collision dans le même batch → suffixe `-2`, `-3`.

**Immuable** : une fois la mère créée dans Supabase, son MODEL ne change plus. Les catalogues suivants remappent via `(supplier_code, ref_fournisseur)`.

Noise words filtrés avant compactage : DE, DU, DES, LA, LE, LES, UN, UNE, A, AU, AUX, ET, AVEC, SANS, VERSION, COLORIS, COULEUR, STRUCTURE, DIMENSION, DIMENSIONS, NORME.

### 3.3 PRICE_TOKENS (avant le premier `.`)

- **Tous les axes prix sont TOUJOURS encodés**, y compris la valeur par défaut (ex: `NA` pour "non assemblable").
- Source de vérité : `axes_prix_effectif` du produit + `attributs_prix_computed` de la variante.
- Ordre : **alphabétique** sur le nom d'axe canonique.
- Chaque valeur encodée en token 2-4 chars (couleur, dimension, norme, option → mêmes heuristiques que puid.ts v3).

### 3.4 STYLE_TOKENS (après le premier `.`)

- Séparés par `.` entre axes style distincts.
- Valeurs composites d'un même axe **collées sans séparateur**.
  - Ex: `BLANC GLACIER / T28 BLANC` → `BLGLT28BL`
- Source de vérité : `axes_style_effectif` du produit + `attributs_style_computed` de la variante.
- Ordre : alphabétique sur le nom d'axe canonique.

## 4) Exemples concrets (GROSFILLEX)

### Produit avec axes prix + style (Denver Empilable)

```
Mère :  P-GRO-DENVEMPI
Filles :
  P-GRO-DENVEMPI-M4-NA.ANTR       (55 001 002, norme M4, non assemblable, anthracite)
  P-GRO-DENVEMPI-M4-NA.FRGR       (55 001 818, norme M4, non assemblable, forest green)
  P-GRO-DENVEMPI-M2-NA.ANTR       (33 600 002, norme M2, non assemblable, anthracite)
  P-GRO-DENVEMPI-M2-AS.ANTR       (39 201 002, norme M2, assemblable, anthracite)
```

### Produit avec style seul (X2.0 Pied SIMPLE)

```
Mère :  P-GRO-X20PDSIM
Filles :
  P-GRO-X20PDSIM.LICH             (U3 901 852, LICHEN)
  P-GRO-X20PDSIM.ANTR             (U3 901 002, ANTHRACITE)
```

### Produit avec coloris composite (Sunset Fauteuil)

```
Mère :  P-GRO-SUNSFAUT
Filles :
  P-GRO-SUNSFAUT.BLGLT28BL        (49 015 096, BLANC GLACIER / T28 BLANC)
  P-GRO-SUNSFAUT.GRPLT30GR        (49 021 289, GRIS PLATINIUM / T30 GRIS)
```

### Produit avec 2 axes style (hypothétique : coloris + finition)

```
  P-GRO-XXXXX-M2.BLEU.MAT         (norme M2 prix / coloris BLEU style / finition MAT style)
```

### Produit simple (1 variante)

```
  P-GRO-CHARMANU                   (36 110 231, Chariot manutention)
```

Pas de mère/fille. PUID unique et direct.

## 5) Règles d'unicité

- Un PUID pointe vers une seule entité commerciale.
- Collision → suffixe contrôlé `-2`, `-3`.
- Journaliser toute collision et décision de résolution.

## 6) Lots legacy

Inchangé par rapport à v3 : les lots historiques WooCommerce ne polluent pas la structure PUID. Les lots sont une couche tarifaire (product_lot_offers).

## 7) PUID et mères/filles

- `root` = `P-SUP-MODEL` → mère logique.
- Branches filles = `PRICE_TOKENS`.
- Sous-filles style = `STYLE_TOKENS`.
- Produit simple = PUID complet sans branches.

On doit pouvoir appliquer une règle tarifaire sur :

- tout le root,
- une branche prix,
- un sous-ensemble style.

## 8) Produits liés

Le PUID generator résout les `produits_lies` de l'expanded JSON :

- Construit un index `ref_fournisseur → PUID mère` et `ref_engine → PUID mère`.
- Remplace chaque ref dans `produits_lies` par le PUID mère (ou PUID simple) correspondant.
- Si une ref ne se résout pas → garder en clair avec flag `unresolved`.

## 9) Réconciliation inter-catalogues

Quand un catalogue 2027 est ingéré pour un fournisseur déjà présent :

| Clé de match                        | `(supplier_code, ref_fournisseur)`                                      |
| ----------------------------------- | ----------------------------------------------------------------------- |
| Match trouvé                        | **UPDATE** : prix, description, attributs. **Garder le PUID existant.** |
| Pas de match                        | **INSERT** : nouveau produit/variante avec nouveau PUID.                |
| Produit absent du nouveau catalogue | **FLAG** : marquer comme potentiellement retiré, ne pas supprimer.      |

Filet de sécurité pour les refs générées par Retab :

- Fingerprint `(supplier_code, product_ref, hash des attributs structurés)`.

**Règle fondamentale :** une mère déjà créée garde son MODEL immuable. Seules les variantes peuvent se créer/mettre à jour sous une mère existante.

## 10) Pipeline

```
extract.py → expand.py → puid_generator.py → supabase_import.py
                              ↑
                         ce script (Python)
```

Le générateur TS (`lib/admin/puid.ts`) reste comme outil d'audit sur les données legacy.

## 11) Axes prix vs style — règle source de vérité

- Ce qui est dans `axes_prix_effectif` → avant le point (PRICE_TOKENS).
- Ce qui est dans `axes_style_effectif` → après le point (STYLE_TOKENS).
- **Faire confiance aux axes déclarés par l'engine.** Ne pas re-deviner depuis les prix.

---

_Historique : v3 (2026-03-04) → v4 (2026-03-24). Décisions prises en session Claude + Nico._
