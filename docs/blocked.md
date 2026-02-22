# Éléments bloqués — à compléter par Nicolas

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
