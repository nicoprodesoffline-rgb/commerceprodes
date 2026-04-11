# Contexte RETAB — PRODES Commerce

_Configuration extraction catalogues fournisseurs_

---

## Principe fondamental

**Extraction groupée par famille, pas ligne à ligne.**

Le schéma RETAB doit produire :

```json
{
  "fournisseur": "...",
  "familles": [
    {
      "nom_gamme": "...",
      "variantes": [...],
      "plus_values": [...],
      "options": [...]
    }
  ]
}
```

Pas :

```json
[
  { "reference_sku": "...", "nom_produit": "...", "prix_ht": "..." },
  ...
]
```

**Pourquoi :** le LLM doit voir toutes les variantes d'une famille en même temps pour classer axes_prix vs axes_style (comparaison de prix intra-groupe).

---

## Schéma JSON universel (à coller dans Retab)

```json
{
  "type": "object",
  "X-SystemPrompt": "Tu extrais un catalogue fournisseur B2B au format JSON hiérarchique.\n\nRÈGLES GÉNÉRALES:\n1. Groupe les produits par FAMILLE (gamme). Une famille = un nom commercial distinct.\n2. Dans chaque famille, chaque ligne avec SKU et prix ferme = une VARIANTE.\n3. Les lignes 'NOUS CONSULTER' = OPTIONS (jamais dans variantes).\n4. Les lignes sans SKU avec un delta de prix = PLUS-VALEURS (jamais dans variantes).\n5. SKU absent ou 'X' → génère un SKU: 3 premières lettres nom_gamme + attributs distinctifs (max 10 chars), marque sku_genere: true.\n6. 'X OU Y' dans une désignation = même SKU, même prix, coloris cosmétiques → axes_style uniquement.\n7. 'Par palette de N' = tier de lot pour le SKU précédent → prix_lot + quantite_lot, pas une variante séparée.\n8. type_produit: 'simple' si 1 seule variante avec SKU réel. Sinon 'variable'.\n9. Conserve la designation_brute telle quelle (ne reformule pas).\n10. Règle d'or axes: un attribut est axes_prix si sa valeur varie ET le prix change entre deux variantes de la famille. Sinon axes_style.",
  "properties": {
    "fournisseur": { "type": "string", "description": "Nom du fournisseur" },
    "catalogue_nom": { "type": "string", "description": "Titre du catalogue" },
    "annee": { "type": "integer", "description": "Année du catalogue" },
    "remise_globale_pct": {
      "type": ["number", "null"],
      "description": "Remise globale fournisseur si mentionnée (ex: 50 pour 50%)"
    },
    "familles": {
      "type": "array",
      "description": "Liste des familles de produits",
      "items": {
        "type": "object",
        "properties": {
          "nom_gamme": {
            "type": "string",
            "description": "Nom commercial de la famille/gamme produit",
            "X-SourceQuote": true
          },
          "ref_catalogue": {
            "type": ["string", "null"],
            "description": "Référence catalogue de la famille (ex: N°1, N°12)"
          },
          "categorie": {
            "type": ["string", "null"],
            "description": "Catégorie produit (ex: Chaises, Miroirs routiers, Crochets)"
          },
          "type_produit": {
            "type": "string",
            "enum": ["simple", "variable"],
            "description": "simple si 1 seule variante avec SKU réel, variable sinon"
          },
          "variantes": {
            "type": "array",
            "description": "Variantes de la famille (lignes avec SKU + prix ferme)",
            "items": {
              "type": "object",
              "properties": {
                "sku": {
                  "type": "string",
                  "description": "Référence produit / SKU",
                  "X-SourceQuote": true
                },
                "sku_genere": {
                  "type": "boolean",
                  "description": "true si le SKU a été généré car absent dans le catalogue"
                },
                "designation_brute": {
                  "type": "string",
                  "description": "Désignation exacte copiée du catalogue, sans reformulation",
                  "X-SourceQuote": true
                },
                "prix_ht": {
                  "type": ["number", "null"],
                  "description": "Prix HT en euros",
                  "X-SourceQuote": true,
                  "X-ReasoningPrompt": "Identifie le prix unitaire HT. Si une remise est indiquée, calcule le prix net. Si 'NOUS CONSULTER' → null."
                },
                "prix_public_ht": {
                  "type": ["number", "null"],
                  "description": "Prix public HT avant remise, si distinct"
                },
                "remise_pct": {
                  "type": ["number", "null"],
                  "description": "Remise en % si indiquée sur la ligne"
                },
                "eco_taxe": {
                  "type": ["number", "null"],
                  "description": "Éco-participation en euros HT"
                },
                "prix_lot": {
                  "type": ["number", "null"],
                  "description": "Prix unitaire HT en achetant un lot/palette"
                },
                "quantite_lot": {
                  "type": ["integer", "null"],
                  "description": "Quantité minimum pour le prix lot"
                },
                "unite_lot": {
                  "type": ["string", "null"],
                  "description": "Unité du lot (palette, carton, pièces)"
                },
                "poids_kg": {
                  "type": ["number", "null"],
                  "description": "Poids en kg"
                },
                "axes_prix": {
                  "type": "object",
                  "description": "Attributs qui changent le prix entre les variantes de cette famille",
                  "X-ReasoningPrompt": "Compare les prix de TOUTES les variantes de la famille. Pour chaque attribut qui diffère entre deux variantes, vérifie si le prix est différent. Si oui → inclure dans axes_prix. Exemples: norme M2 vs M4 (prix différent), dimension 600mm vs 450mm (prix différent), finition vernie vs gainée (prix différent).",
                  "additionalProperties": {
                    "type": ["string", "number", "null"]
                  }
                },
                "axes_style": {
                  "type": "object",
                  "description": "Attributs qui ne changent pas le prix (cosmétiques)",
                  "X-ReasoningPrompt": "Un attribut est de style si: (1) le prix reste identique entre les variantes qui diffèrent sur cet attribut, OU (2) il apparaît sous la forme 'X OU Y' dans une même désignation (ex: 'CHROMES OU NOIRS' → même SKU, même prix). Exemples: coloris, piètement décoratif.",
                  "additionalProperties": {
                    "type": ["string", "array", "null"]
                  }
                },
                "disponibilite": {
                  "type": ["string", "null"],
                  "enum": [
                    "disponible",
                    "nous_consulter",
                    "sur_commande",
                    null
                  ],
                  "description": "Disponibilité si mentionnée"
                }
              },
              "required": [
                "sku",
                "sku_genere",
                "designation_brute",
                "axes_prix",
                "axes_style"
              ]
            }
          },
          "plus_values": {
            "type": "array",
            "description": "Plus-values (lignes sans SKU avec delta de prix, pas des produits)",
            "items": {
              "type": "object",
              "properties": {
                "designation": { "type": "string" },
                "delta_prix_ht": { "type": ["number", "null"] },
                "eco_taxe": { "type": ["number", "null"] },
                "axe_modifie": {
                  "type": ["string", "null"],
                  "description": "Attribut concerné (ex: diametre_tube, longueur)"
                },
                "valeur": { "type": ["string", "null"] }
              },
              "required": ["designation"]
            }
          },
          "options": {
            "type": "array",
            "description": "Options NOUS CONSULTER (ne pas créer comme produits)",
            "items": {
              "type": "object",
              "properties": {
                "sku": { "type": ["string", "null"] },
                "designation": { "type": "string" },
                "disponibilite": {
                  "type": "string",
                  "enum": ["nous_consulter"]
                }
              },
              "required": ["designation", "disponibilite"]
            }
          }
        },
        "required": ["nom_gamme", "type_produit", "variantes"]
      }
    }
  },
  "required": ["fournisseur", "familles"]
}
```

---

## Configuration projet Retab

```
Modèle : retab-small (1 crédit/page) pour catalogues < 50 pages
         retab-large (3 crédits/page) pour catalogues denses > 50 pages
chunking_keys : {"familles": "nom_gamme"}
n_consensus : 2 (pour catalogues principaux, 1 pour veille prix rapide)
```

---

## Prompts système par fournisseur

### GMCE (chaises, mobilier scolaire)

```
DÉTECTEUR DE MÈRE : La colonne "PRODUITS" regroupe plusieurs lignes → c'est le nom de famille.
PARTICULARITÉS :
- "OU" dans désignation = même SKU, même prix → axes_style
- "EXISTE EN..." = variante supplémentaire (créer ligne séparée)
- "POSSIBILITE..." = option NOUS CONSULTER
- Tableau ref interne/prix : chaque ligne ref interne = une variante
```

### BENITO (mobilier urbain)

```
DÉTECTEUR DE MÈRE : Préfixe SKU commun (UM301 → UM301, UM301G, UM301L = même famille).
PARTICULARITÉS :
- Remise globale ~35% (vérifier ligne d'en-tête ou note bas de page)
- Codes BP0/BP1/BP2/BP3 = disponibilité (non bloquant, noter dans disponibilite)
- Suffix G = anti-graffiti (axes_prix : traitement)
- Suffix L = longueur différente (axes_prix : dimension)
```

### Socomix (miroirs routiers)

```
DÉTECTEUR DE MÈRE : Titre de section (ex: "Gamme Classique Inox") + premier mot du SKU (IBIS, FAR, ZEBRIX).
PARTICULARITÉS :
- Remise globale 50% systématique sur prix public
- "Par palette de N pièces" = ligne lot pour le SKU précédent → prix_lot + quantite_lot
- SKU encode les specs : IBIS 6008 AG-JURA = IBIS + 600mm + Inox + antigivre + cadre Mélèze
```

### MOTTEZ (quincaillerie)

```
DÉTECTEUR DE MÈRE : Cellule fusionnée niveau 1 (gamme) + niveau 2 (famille). Structure Excel 3 niveaux.
PARTICULARITÉS :
- Suffix V = verni (axes_prix : finition, prix différent)
- Suffix G = gainé (axes_prix : finition, prix différent)
- PCB = quantite_lot (contenu par boîte)
- Profondeur dans désignation = axes_prix (profondeur 8cm ≠ profondeur 16cm → prix différent)
```

---

## Kits d'extraction

| Kit             | Champs                                    | Usage                                    | Modèle                                 |
| --------------- | ----------------------------------------- | ---------------------------------------- | -------------------------------------- |
| **A — Minimal** | sku, nom, prix_final, famille             | Veille prix, comparaison concurrentielle | retab-small                            |
| **B — Pricing** | Kit A + axes_prix complets, eco_taxe, lot | Import catalogue pricing annuel          | retab-small + chunking                 |
| **C — Complet** | Kit B + axes_style, dimensions, poids     | Import catalogue complet → PUID          | retab-small + chunking + n_consensus=2 |
| **D — Full IA** | Kit C + descriptions IA                   | Enrichissement catalogue (rare)          | retab-large                            |

**Recommandation pour PRODES :** Kit C pour tous les imports principaux.

---

## Pipeline d'intégration RETAB → PRODES

```
1. Upload catalogue dans Retab dashboard (ou appel API)
2. Configuration : schéma universel + prompt fournisseur + chunking + n_consensus=2
3. Extraction → JSON familles[]
4. POST /api/admin/data-factory/retab/ingest?dry_run=true
   → Preview : N familles, M variantes, K collisions PUID
5. Review dans Data Factory UI (onglet "Extraction Retab")
6. POST /api/admin/data-factory/retab/ingest?dry_run=false
   → Création products + variants + product_families + pricing_attribute_rules
7. POST /api/admin/data-factory/puid/assemble-families?dry_run=false
   → Assemblage mère/filles depuis puid_root
```

---

## Mapping RETAB → DB PRODES

| Champ RETAB                           | Table PRODES              | Colonne                |
| ------------------------------------- | ------------------------- | ---------------------- |
| `familles[].nom_gamme`                | `product_families`        | `name`                 |
| `familles[].variantes[].sku`          | `products` ou `variants`  | `sku`                  |
| `familles[].variantes[].prix_ht`      | `products` / `variants`   | `regular_price`        |
| `familles[].variantes[].eco_taxe`     | `products` / `variants`   | `eco_contribution`     |
| `familles[].variantes[].axes_prix`    | `pricing_attribute_rules` | `impacts_price: true`  |
| `familles[].variantes[].axes_style`   | `pricing_attribute_rules` | `impacts_price: false` |
| `familles[].variantes[].prix_lot`     | `product_lot_offers`      | `lot_price`            |
| `familles[].variantes[].quantite_lot` | `product_lot_offers`      | `min_quantity`         |
| `familles[].plus_values[]`            | `pricing_attribute_rules` | `is_addon: true`       |
| `familles[].options[]`                | `products` (JSON field)   | `options_json`         |

---

## Coûts de référence (retab-small)

| Catalogue             | Pages   | Chunking | Consensus | Coût estimé |
| --------------------- | ------- | -------- | --------- | ----------- |
| GMCE Chaises (PDF)    | ~10     | ×2       | ×2        | ~$0,40      |
| Socomix Miroirs (PDF) | ~15     | ×2       | ×2        | ~$0,60      |
| MOTTEZ Excel          | ~50 éq. | ×2       | ×1        | ~$1,00      |
| BENITO Excel          | ~15 éq. | ×2       | ×1        | ~$0,30      |

---

_Document maintenu par Claude. Dernière mise à jour : 2026-03-10_
