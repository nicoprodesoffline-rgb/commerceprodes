# CLAUDE.md

## Workspace

- Projet applicatif: `/Users/nico/Desktop/prodes_newsite_codex/commerce`
- Racine d'orchestration partagée: `/Users/nico/Desktop/prodes_newsite_codex`
- État partagé: `/Users/nico/Desktop/prodes_newsite_codex/state`

## Démarrage Serena

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

Après le rituel Serena:

1. Lire `/Users/nico/Desktop/prodes_newsite_codex/state/orchestrator.json`
2. Lire `/Users/nico/Desktop/prodes_newsite_codex/state/roadmap.json`
3. Lire `/Users/nico/Desktop/prodes_newsite_codex/state/handoff.json`
4. Si nécessaire, lire `/Users/nico/Desktop/prodes_newsite_codex/docs/CODEX_RULES.md`

## Détection emergency-close

Lors de la lecture de `handoff.json`, vérifier si `last_session.emergency === true`.

Si c'est le cas, **signaler immédiatement à l'utilisateur** avant toute autre chose :

> ⚠️ La dernière session Codex s'est terminée en emergency-close.
> Branche : `<last_session.branch>`
> Raison : `<last_session.validation>`
> Reprendre depuis : `<last_session.next_step>`

## Clôture de session

Quand l'utilisateur dit "tu peux clore la session" ou équivalent, utiliser **uniquement** le skill `/session-handoff`.

Ce skill :

1. Lit `state/lock.json` pour récupérer les métadonnées (agent, task, branch, started_at)
2. Génère le contenu riche (fichiers changés, décisions, next steps, proof)
3. Appelle `relay.sh end` en interne — seul écrivain autorisé sur `handoff.json`

Ne jamais appeler `relay.sh end` directement ni écrire dans `handoff.json` manuellement.

## Note

Si Serena n'est pas disponible ou échoue au démarrage, continuer avec une exploration classique du repo sans bloquer la session.
