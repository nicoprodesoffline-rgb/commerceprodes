# Guide Data Factory — PRODES Commerce

## Vue d'ensemble

La Data Factory est le pipeline centralisé de traitement catalogue. Elle
couvre l'intégralité du flux : import brut → normalisation → mères/filles → validation.

Accès : `/admin/data-factory`

## 1) Onglet Import brut

### Démarrer un import

1. Renseigner les métadonnées :
   - **Fournisseur** : ex. Grosfillex, E-Sunny, Socomix
   - **Nom catalogue** : ex. "TARIFS REVENDEURS 2026"
   - **Année** : 2026
   - **Source** : Upload manuel / Extraction Retab / Flux API fournisseur

2. Sélectionner le fichier (`.xlsx`, `.xls`, `.csv`, `.ods`, max 35 MB)
3. Clic sur **Démarrer import**

L'import crée un `import_log` avec batch_key unique, déclenche le webhook n8n
si configuré, et stocke le fichier en Supabase Storage (bucket `imports`).

### Historique des imports

Le tableau affiche pour chaque import :
- Date, Fournisseur, Nom catalogue, Année
- Statut : `pending` → `processing` → `done` / `error`
- Lignes : total / ok / erreurs
- Batch key, Stage (ex: `puid_normalised`, `families_assembled`)
- Notes + lien vers le fichier source

### Workflow complet

```
Upload fichier brut → Parsing (Retab/n8n) → Normalisation PUID → Mère/Filles → Validation
```

## 2) Onglet Normalisation

### Règles de normalisation

| Paramètre | Description | Valeur recommandée |
|-----------|-------------|-------------------|
| Stratégie de groupement | Comment détecter les familles | `parent_sku` |
| Politique publication | Statut par défaut après import | `draft` (safe) |
| Seuil confiance | Score minimum pour auto-publication | 75 |
| Séparateur SKU | Séparateur prix/non-prix | `.` |
| Axes prix-impact | Attributs qui changent le prix | `dimension,norme,finition` |

### Centre de contrôle IA

Configure les modèles IA et prompts d'extraction/normalisation :
- **Modèle extraction** : `claude-haiku-4-5-20251001` (rapide, économique)
- **Modèle normalisation** : `claude-sonnet-4-6` (qualité supérieure)

Le **calculateur de coût** estime le prix d'un batch IA selon les tokens configurés.

### Générateur PUID — Workflow 4 étapes

Voir guide complet : `docs/guide-puid.md`

1. ① **Prévisualiser** : analyse sans écriture
2. ② **Dry-run** : simule l'apply, détecte les conflits SKU
3. ③ **Backup** : télécharge l'état actuel avant mutation
4. ④ **Appliquer** : écriture en base

### Assemblage mère/filles depuis PUID

Après apply PUID, regroupe les produits par `puid_root` en familles.

## 3) Onglet Mères / Filles

Affiche l'audit temps réel des familles :
- Familles actives, candidats en attente, suggestions potentielles, issues
- Parents sans enfants (familles orphelines)
- Orphelins parent_sku (enfants sans parent trouvé en base)
- Familles volumineuses (> seuil)

Bouton **Ouvrir module mères/filles** → `/admin/familles` pour gestion complète.

## 4) Onglet Tarification

Vue macro du pricing sur l'ensemble du catalogue :
- Total, publiés, promo active, PBQ activé, dégressif, lots, prix manquants

Liens rapides vers Vue Excel et gestion Produits.

## 5) Onglet Validation & Publication

**Queue need_check** : produits avec anomalies détectées automatiquement :
- SKU manquant
- Prix invalide pour un produit publié
- Description courte faible (< 20 caractères)
- Produit enfant sans parent_sku
- Variantes présentes sans famille explicite
- Aucune catégorie assignée

Chaque produit listé est un lien direct vers sa fiche d'édition.

## 6) Scope "Dernier import"

La case à cocher **Scope mères/filles: dernier import** restreint l'analyse
et l'assemblage aux produits modifiés depuis le dernier import.
Utiliser pour traiter incrémentalement après chaque import fournisseur.

## 7) Processus complet recommandé

```
1. Upload catalogue fournisseur (onglet Import brut)
2. Attendre traitement n8n / vérifier statut
3. Activer scope "dernier import"
4. Onglet Normalisation → Simuler regroupement → Vérifier suggestions
5. ① Prévisualiser PUID → ② Dry-run → ③ Backup → ④ Appliquer
6. Simuler assemblage familles → Vérifier plan → Appliquer
7. Onglet Familles → Vérifier audit (0 orphelins, 0 parents sans enfants)
8. Onglet Validation → Traiter la queue need_check
9. Publication des produits validés
```
