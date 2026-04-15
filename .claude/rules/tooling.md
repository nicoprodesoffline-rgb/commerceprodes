---
description: Inventaire complet des skills, hooks, MCP et règles d'usage configurés dans ce workspace. Chargé automatiquement dans toutes les sessions Claude Code.
---

# Tooling Reference

## Skills (invocables via `/skill-name`)

### Prodes (`.claude/skills/prodes/`)

| Skill              | Usage                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/session-handoff` | **Clôture de session obligatoire.** Lit `state/lock.json`, génère le handoff packet, appelle `relay.sh end`. Ne jamais écrire dans `handoff.json` directement. Ne pas utiliser le Skill tool — exécuter les étapes SKILL.md via Bash. |
| `/route-audit`     | Audit des routes API — couverture, sécurité, validation des entrées                                                                                                                                                                   |
| `/roadmap-triage`  | Triage du fichier `state/roadmap.json` — priorisation, statuts, dépendances                                                                                                                                                           |
| `/packet-review`   | Revue d'un task packet Codex avant lancement                                                                                                                                                                                          |
| `/verify`          | Proof-of-work : `npx tsc --noEmit && npm run build`. Les deux doivent passer.                                                                                                                                                         |
| `/session-status`  | Résumé rapide de l'état : dernier handoff + snapshot roadmap en-cours/bloqués/next                                                                                                                                                    |

### Superpowers (`.claude/skills/superpowers/`)

| Skill                             | Usage                                                          |
| --------------------------------- | -------------------------------------------------------------- |
| `/systematic-debugging`           | Débogage structuré avec hypothèses et tests                    |
| `/verification-before-completion` | Checklist de vérification avant de déclarer une tâche terminée |
| `/test-driven-development`        | Workflow TDD — écrire les tests avant le code                  |
| `/receiving-code-review`          | Recevoir et intégrer une code review                           |

---

## Hooks (automatiques — configurés dans `.claude/settings.local.json`)

### PreToolUse

| Matcher       | Hook            | Effet                                                                                              |
| ------------- | --------------- | -------------------------------------------------------------------------------------------------- |
| `Edit\|Write` | `file-guard.sh` | Bloque les éditions sur les paths interdits (state/, .env\*, migrations/, docs/agentic/)           |
| `Bash`        | inline grep     | Bloque les commandes destructives : `rm -rf`, `DROP TABLE`, `git reset --hard`, `git push --force` |

### PostToolUse

| Matcher       | Hook                           | Effet                                                                     |
| ------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `Edit\|Write` | `edit-logger.sh` (async)       | Log le fichier modifié dans `state/session-edits.log` pour le commit gate |
| `Edit\|Write` | `npx prettier --write` (async) | Auto-format du fichier édité                                              |

### Stop

| Hook                       | Effet                                                |
| -------------------------- | ---------------------------------------------------- |
| `stop-reminder.sh` (async) | Rappel de clôture de session si handoff non effectué |

---

## MCP Servers (configurés dans `.mcp.json`)

### serena

Navigation sémantique du code + mémoires projet.

- Lancé avec `--project-from-cwd` — Claude **doit** être démarré depuis `commerce/` (pas le parent)
- Outils clés : `find_symbol`, `get_symbols_overview`, `replace_symbol_body`, `safe_delete_symbol`, `find_referencing_symbols`
- Mémoires dans `.serena/memories/` — tech stack, code style, structure codebase
- Dashboard disponible via `open_dashboard` (ne pas ouvrir automatiquement)

### tavily

Recherche web et extraction de contenu.

- Outils : `tavily_search`, `tavily_extract`, `tavily_crawl`, `tavily_research`, `tavily_map`
- Utiliser pour veille, documentation externe, pages fournisseurs

### retab

API d'extraction de catalogues PDF/Excel.

- Endpoint HTTP : `https://mcp.retab.com/mcp` — clé : `$RETAB_API_KEY`
- Outils : `workflows_*`, `experiments_*`, `files_*`, `jobs_get`
- **Règle critique** : ne jamais lancer une extraction Retab de façon autonome. Toujours demander à Nico le consensus + les crédits max autorisés avant de déclencher.

---

## Paths interdits (ne jamais modifier sans autorisation explicite)

- `state/` — fichiers d'orchestration partagés (handoff.json, roadmap.json, lock.json, orchestrator.json)
- `.env*` — variables d'environnement
- `supabase/migrations/` — migrations de base de données (validation humaine obligatoire)
- `docs/agentic/` — doctrine agentique

---

## Règles engineering critiques

Ces règles viennent de `AGENTS.md` — les deux fichiers font autorité.

| Règle             | Détail                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Accès DB          | Toujours via `lib/supabase/index.ts`. Jamais raw Supabase client dans les composants ou routes.                  |
| Images produit    | Depuis la table `product_images`, pas la colonne `featured_image_url`                                            |
| `select("*")`     | Interdit sans justification explicite                                                                            |
| UI B2B            | Pas de "Add to Cart". Trois actions uniquement : "Demander un devis" / "Mandat administratif" / "Payer en ligne" |
| Pricing           | `Intl.NumberFormat('fr-FR', {minimumFractionDigits:2})` + " € HT"                                                |
| TypeScript        | Pas de `any`. Types dans `lib/supabase/types.ts`. `ProductVariant` requiert `sku`.                               |
| Erreurs Supabase  | Wrapper systématique via `safeError` avant d'exposer au client                                                   |
| Rate-limit        | Toutes les routes publiques POST via `lib/rate-limit.ts`                                                         |
| Client/Server     | `"use client"` uniquement si interactivité ou hooks nécessaires. Server components par défaut.                   |
| Cart              | localStorage + CartContext. Jamais server-side.                                                                  |
| Champ nom         | `eco_contribution` (pas `eco_participation`)                                                                     |
| Preuve de travail | `npx tsc --noEmit && npm run build` — les deux doivent passer. TSC seul = insuffisant.                           |
| Lint              | `npm run lint` — ESLint sur app/, lib/, components/. Détecte les `any` et violations React Hooks.                |
