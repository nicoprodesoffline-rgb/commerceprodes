# CLAUDE.md

## Workspace

<!-- commerce/ est le repo git du nouveau site Prodes (Next.js).
     Le niveau parent prodes_newsite_codex/ n'est PAS un repo git —
     c'est la couche d'orchestration Codex/Claude : state/, docs/, configs.
     retab-extraction/ est désormais un repo indépendant (splitté).
     Claude est lancé depuis commerce/ mais lit/écrit dans state/ pour
     le handoff, le roadmap et les décisions partagées. -->

- Projet applicatif: `/Users/nico/Desktop/prodes_newsite_codex/commerce`
- Racine d'orchestration partagée: `/Users/nico/Desktop/prodes_newsite_codex`
- État partagé: `/Users/nico/Desktop/prodes_newsite_codex/state`

## Démarrage Serena

<!-- Serena est le serveur MCP de contexte projet : il maintient ses propres
     mémoires sur le codebase et fournit les instructions initiales à Claude.
     Sans ce rituel, Claude démarre sans le contexte Serena et risque de
     redécouvrir ce qui est déjà documenté dans ses mémoires.
     Point critique : Serena utilise --project-from-cwd, donc Claude DOIT
     être lancé depuis commerce/ — pas depuis le parent. Sinon Serena
     s'active sur le mauvais projet silencieusement. -->

Si le serveur MCP `serena` est disponible dans la session, commencer par:

1. Vérifier que `serena` est connecté via `/mcp` ou `claude mcp list`
2. Appeler `activate_project` avec `/Users/nico/Desktop/prodes_newsite_codex`
3. Appeler `initial_instructions`
4. Appeler `check_onboarding_performed`
5. Si l'onboarding n'existe pas encore, appeler `onboarding`

Rappel:

- La config MCP projet est dans [`.mcp.json`](/Users/nico/Desktop/prodes_newsite_codex/commerce/.mcp.json)
- Serena est configuré avec `--project-from-cwd`, donc Claude doit être lancé depuis `commerce/`
- Le dashboard Serena reste disponible, mais ne doit plus s'ouvrir automatiquement

## Ordre de lecture projet

<!-- Ordre intentionnel : orchestrator (qui fait quoi à l'instant T, quel agent
     est actif sur quelle tâche) → roadmap (todo list du projet, statuts,
     priorités) → handoff (dernière session : ce qui a été fait, ce qui reste).
     Ces trois fichiers ensemble reconstituent le contexte sans explorer le repo.
     CODEX_RULES.md est réservé aux tâches qui impliquent Codex directement. -->

Après le rituel Serena:

1. Lire `/Users/nico/Desktop/prodes_newsite_codex/state/orchestrator.json`
2. Lire `/Users/nico/Desktop/prodes_newsite_codex/state/roadmap.json`
3. Lire `/Users/nico/Desktop/prodes_newsite_codex/state/handoff.json`
4. Si nécessaire, lire `/Users/nico/Desktop/prodes_newsite_codex/docs/CODEX_RULES.md`

## Détection emergency-close

<!-- Une session (Codex ou Claude) peut se terminer sans passer par la clôture
     normale : timeout, erreur bloquante, validation qui échoue, terminal fermé.
     Dans ce cas le repo peut être dans un état intermédiaire : branche non
     mergée, commits manquants, handoff non écrit.
     Signaler AVANT toute autre chose pour éviter de travailler sur un état
     corrompu. Reprendre depuis next_step indiqué dans le handoff. -->

Lors de la lecture de `handoff.json`, vérifier si `last_session.emergency === true`.

Si c'est le cas, **signaler immédiatement à l'utilisateur** avant toute autre chose :

> ⚠️ La dernière session Codex s'est terminée en emergency-close.
> Branche : `<last_session.branch>`
> Raison : `<last_session.validation>`
> Reprendre depuis : `<last_session.next_step>`

## Clôture de session

<!-- Le handoff n'est pas juste une écriture de fichier — c'est une méthodologie
     complète : produire les assets qui documentent la session (décisions, fichiers
     touchés, proof), et transmettre au prochain LLM tout ce dont il a besoin pour
     reprendre sans ambiguïté.
     C'est aussi un checkpoint : vérifier que la session n'a pas dérivé de son
     objectif initial avant de la considérer terminée.
     relay.sh end est le seul écrivain autorisé sur handoff.json — passer par
     autre chose risque un format incomplet ou un écrasement du handoff précédent.
     Ne pas utiliser le Skill tool pour /session-handoff : exécuter les étapes
     de SKILL.md directement via Bash. -->

Quand l'utilisateur dit "tu peux clore la session" ou équivalent, utiliser **uniquement** le skill `/session-handoff`.

Ce skill :

1. Lit `state/lock.json` pour récupérer les métadonnées (agent, task, branch, started_at)
2. Génère le contenu riche (fichiers changés, décisions, next steps, proof)
3. Appelle `relay.sh end` en interne — seul écrivain autorisé sur `handoff.json`

Ne jamais appeler `relay.sh end` directement ni écrire dans `handoff.json` manuellement.

## Règles engineering

Voir `AGENTS.md` (auto-chargé par Codex) et `.claude/rules/tooling.md` (auto-chargé par Claude Code) pour les règles complètes.

Règles critiques à ne pas oublier :

- Accès DB : toujours via `lib/supabase/index.ts`, jamais raw client dans les composants
- Images produit : depuis `product_images` table, pas `featured_image_url`
- B2B : pas de "Add to Cart" — trois actions : "Demander un devis" / "Mandat administratif" / "Payer en ligne"
- Prix : `Intl.NumberFormat('fr-FR', {minimumFractionDigits:2})` + " € HT"
- Erreurs Supabase : wrapper via `safeError` avant d'envoyer au client
- Rate-limit : toutes les routes publiques POST via `lib/rate-limit.ts`
- TypeScript : pas de `any` sans justification ; types centralisés dans `lib/supabase/types.ts`

**Proof-of-work** : `npx tsc --noEmit && npm run build` — les deux doivent passer (exit 0). TSC seul est insuffisant.

**Lint** : `npm run lint` — ESLint sur `app/`, `lib/`, `components/`. Pas requis pour le proof-of-work, mais utile pour détecter les `any` et violations React Hooks.

## Recommandations d'exécution

<!-- Ce système évite de décider du mode/modèle en début de session.
     Chaque tâche roadmap embarque un poids W1-W4. Claude lit le poids
     et annonce immédiatement la recommandation avant de commencer. -->

### Échelle de poids

| Poids | Nature de la tâche                                    |
| ----- | ----------------------------------------------------- |
| W1    | Mécanique / lecture / script simple                   |
| W2    | Implémentation standard / session interactive normale |
| W3    | Implémentation complexe / debug / refactoring large   |
| W4    | Architecture / décision critique / migration risquée  |

### Table d'équivalence

| Poids | Claude             | Codex (GPT-5.4) |
| ----- | ------------------ | --------------- |
| W1    | Sonnet + Low       | Low             |
| W2    | Sonnet + Medium    | Medium          |
| W3    | Sonnet + High      | High            |
| W4    | Opus + Medium/High | Extra High      |

### Comportement au démarrage

Après lecture du roadmap, annoncer immédiatement les recommandations pour les tâches prioritaires de la session :

> **Recommandations d'exécution :**
>
> - `[task-id]` (W2) → Sonnet medium **ou** Codex medium
> - `[task-id]` (W4) → Opus medium/high **ou** Codex extra-high

## Note

Si Serena n'est pas disponible ou échoue au démarrage, continuer avec une exploration classique du repo sans bloquer la session.
