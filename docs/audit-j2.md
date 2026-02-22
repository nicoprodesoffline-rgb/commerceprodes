# Audit jour 2 — PRODES 2026-02-22

## Pages testées

| URL | HTTP | Statut |
|-----|------|--------|
| http://localhost:3000/ | 200 | ✅ Homepage charge produits |
| http://localhost:3000/search?q=chaise | 200 | ✅ 109 résultats |
| http://localhost:3000/search/mobilier-urbain | 200 | ✅ Catégorie fonctionnelle |
| http://localhost:3000/search/affichage-et-signalisation | 200 | ✅ Catégorie fonctionnelle |
| http://localhost:3000/search/sport-et-loisirs | 200 | ✅ Catégorie fonctionnelle |
| http://localhost:3000/product/panneau-electoral-1-candidat | 200 | ✅ Produit simple |

## Problèmes identifiés

1. **Header** : Logo ACME (SVG générique Vercel), fond blanc mais pas PRODES
2. **Footer** : Liens Vercel ("View the source", "Created by ▲ Vercel"), copyright générique, pas de contacts PRODES
3. **SEO** : generateMetadata produit ne met pas "– PRODES" dans le title, description tronquée à 160 car manquante
4. **Email devis** : console.log seulement, pas d'envoi réel (Resend non configuré)

## Ce qui fonctionne (depuis hier)

- ✅ Prix en format fr-FR "X,XX € HT" partout
- ✅ 3 boutons B2B (devis modal / mandat modal / payer en ligne)
- ✅ PBQ tableau sur les fiches produit
- ✅ SKU visible
- ✅ Menu navbar = catégories racines (fallback depuis Supabase)
- ✅ Cartes produit = plage de prix variants + nom catégorie
- ✅ "Produits similaires" (était "Related Products")
- ✅ Sous-catégories incluses dans getCollectionProducts
