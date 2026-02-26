# Éléments bloqués — à compléter par Nicolas

## Session 6 — Deploy Vercel (Étape 7)

**Statut** : Bloqué — authentification requise

**Problème** : `vercel --yes` échoue avec "The specified token is not valid"

**Action requise** :
1. Ouvrir un terminal dans `~/Desktop/commerce`
2. Exécuter : `npx vercel login`
3. S'authentifier (GitHub / email)
4. Ensuite : `npx vercel --yes` pour deploy preview
5. Ou configurer un token dans `.env.local` : `VERCEL_TOKEN=xxx`

**Variables d'environnement à vérifier sur Vercel** :
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ADMIN_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## Table abandoned_carts — SQL à exécuter manuellement

**Statut** : SQL prêt, à exécuter dans Supabase

**Action requise** :
1. Ouvrir https://supabase.com/dashboard/project/mvnaeddtvyaqkdliivdk/sql
2. Copier-coller le contenu de `docs/sql-migrations/001-abandoned-carts.sql`
3. Exécuter

**Optionnel** : `docs/sql-migrations/002-category-cover.sql` pour les images catégories

---

## RESEND_API_KEY manquante — email devis inactif

**Statut** : Mode dégradé actif (console.log uniquement)

**Action requise** :
1. Créer un compte sur https://resend.com
2. Générer une API Key
3. Vérifier le domaine `prodes.fr` (ou utiliser un domaine sandbox Resend)
4. Ajouter dans `.env.local` :
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxx
   ```
5. Relancer `npm run dev` ou redéployer

**Ce qui fonctionne sans la clé** :
- Le formulaire de devis s'envoie (HTTP 200)
- La demande est loggée en console serveur
- L'utilisateur voit "Demande envoyée !"

**Ce qui nécessite la clé** :
- Email envoyé à contact@prodes.fr
- Email de confirmation automatique au client

**Note** : Le `from:` de l'email est `noreply@prodes.fr` — Resend requiert
que ce domaine soit vérifié dans le dashboard Resend.
