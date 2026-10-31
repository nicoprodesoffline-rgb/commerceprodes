# Lecteur Commerce `site_content.v1`

Travail local du 31 octobre 2026, branche `s1a/vitrine`. Ce document fait foi pour les preuves de cette tâche ; il ne prouve ni déploiement ni réception d'un export réel de la Factory.

## Réconciliation

| Item | Statut | Preuve | Limite |
|---|---|---|---|
| Modèle et validation pure de l'enveloppe, des pages, des quatre sections, bornes, contrôles et références | ✅ vérifié | `lib/site-content/model.ts`, `validate.ts` ; `node --test tests/nav/site-content-validate.test.mjs` | Données de test fictives ; aucune lecture d'export réel |
| Couples document/reçu, identité et SHA-256 des octets, borne de 2 MiB, choix atomique décroissant, refus de régression | ✅ vérifié | `lib/site-content/reader.ts` ; `node --test tests/nav/site-content-reader.test.mjs` | Mémoire isolée par chemin absolu normalisé ; pas d'authenticité cryptographique du reçu |
| Cache idempotent, invalidation par noms, tailles, dates nanosecondes, inode et empreinte du catalogue, expiration à 5 s | ✅ vérifié | Tests lecteur : comptage des diagnostics de relecture et horloge contrôlée | La liste des fichiers et leurs métadonnées sont sondées à chaque appel ; les octets JSON sont mis en cache |
| Source catalogue et refs catégories/familles/médias principaux et d'items, revalidation après changement de catalogue, erreurs sans contenu utilisateur | ✅ vérifié | `lib/site-content/source.ts` ; `node --test tests/nav/site-content-source.test.mjs` | Catalogue remplacé par un objet fictif dans ce test ; accès réel au catalogue non exécuté |
| Même source pour layout, métadonnées et pages | ✅ vérifié | `getEditorialSet = cache(...)` dans `source.ts` ; appels dans `app/layout.tsx`, `app/page.tsx`, `app/p/[...slug]/page.tsx` | Déduplication React par rendu vérifiée par lecture du branchement, pas par serveur Next |
| Barre d'univers : modèle sans kind/order, exclusion de `/`, segments, ordre, doublons, mal formés, plafond de 8 | ✅ vérifié | `node --test tests/nav/universe.test.mjs` ; `components/layout/universe-bar.tsx` | Encodage des segments et `aria-current` vérifiés par lecture ; hydratation non exécutée |
| Quatre rendus serveur, texte brut échappé et retours à la ligne, prix via `familyPrice`, image décorative | ⚠️ partiel | `components/content/sections.tsx` ; `npx tsc --noEmit` ; assertions dans `tests/http/site-content.test.mjs` | Recette HTTP et rendu visuel non exécutés ; aucune preuve d'absence de débordement réel à 390 px |
| Routes dynamiques `/p/...`, accueil éditorial et repli historique, métadonnées, robots hérités | ⚠️ partiel | `app/p/[...slug]/page.tsx`, `app/page.tsx` ; `node --test tests/nav/site-content-metadata.test.mjs` | Segments et métadonnées couverts en unitaire ; vrais statuts 200/404 et accueil sous Next à qualifier en HTTP |
| Indisponibilité catalogue sur `/p/...` multi-segments | ⚠️ partiel | Changement limité à `isStorePage` dans `proxy.ts` ; cas HTTP écrit | Réponse HTML 503 non exécutée |
| TypeScript et suite locale autorisée | ✅ vérifié | `npx tsc --noEmit` : code 0 ; `node --test tests/nav/*.test.mjs` : 73/73 tests réussis, aucun échec ni saut | Ces 73 tests n'incluent aucune recette HTTP ou navigateur ; avertissements Node `MODULE_TYPELESS_PACKAGE_JSON` déjà présents dans la suite |
| Recette HTTP et script de lancement | ⚠️ partiel | `tests/http/site-content.test.mjs` ; `node --check tests/http/site-content.test.mjs` ; script `test:content` de `package.json` | Écrits et syntaxe contrôlée uniquement ; build et exécution interdits dans ce mandat |
| Périmètre des fichiers, absence d'ajout de dépendance, de réseau ou d'écriture catalogue | ✅ vérifié | `git diff --check` ; contrôle de `git status --porcelain --untracked-files=all` contre la liste autorisée ; diff de `package.json` limité au script | `.serena/` préexistant laissé intact ; aucun commit, push ou déploiement |
| CI finale | ⏸️ différé | Absence de `.github/workflows/`, règle du dépôt dans `CLAUDE.md` | Dépôt public : aucun runner self-hosted ni workflow hosted ajouté ; aucun résultat CI revendiqué |
| Journal global des agents | ⏸️ différé | Instruction de sandbox : écritures confinées au worktree et aux dossiers temporaires | `journal-agents` écrit dans `~/.journal-agents/`, hors cible autorisée ; aucune exécution ni écriture de substitution |

## Fichiers touchés

- `lib/site-content/` : `model.ts`, `validate.ts`, `reader.ts`, `source.ts`, `pages.ts`, `metadata.ts`.
- Rendu et branchement : `components/content/sections.tsx`, `components/layout/universe-bar.tsx`, `app/layout.tsx`, `app/page.tsx`, `app/p/[...slug]/page.tsx`, `proxy.ts`.
- Tests : adaptation de `tests/nav/universe.test.mjs` uniquement parmi les tests préexistants ; nouveaux `tests/nav/site-content-{validate,reader,metadata,source}.test.mjs` et `tests/http/site-content.test.mjs`.
- `package.json` : seul ajout du script ; ce rapport.

## Commandes de qualification restantes

Commande complète demandée, à lancer dans un environnement local autorisant le build et le serveur :

```sh
npm run test:content
```

Elle reprend la forme de `test:nav` : compilation du C0 existant, `next build`, tests unitaires `nav`, puis recette HTTP en source fixture. Aucun dossier C0 de fixture n'est créé ni modifié par la recette éditoriale ; les documents éditoriaux sont écrits dans un dossier temporaire supprimé en fin de test. Port par défaut : 3125 ; surcharge : `CONTENT_PORT=3126 npm run test:content`.

Avec un build déjà préparé :

```sh
node --test --test-concurrency=1 tests/http/site-content.test.mjs
```

Ces deux commandes **n'ont pas été exécutées** ici. Le script complet compile les sorties C0 comme le script `test:nav` existant ; son exécution appartient à la qualification ultérieure. Une vérification navigateur à 390 px puis sur écran large reste nécessaire pour le défilement local, l'absence de débordement global, le clavier et le lien d'univers actif.

## Hypothèses et comportement de repli

`SITE_CONTENT_DIR` désigne un répertoire absolu réel, lisible par le processus Next. Aucun réglage ni fichier `.env` n'est créé ou lu par le travail. Sans catalogue, sans configuration éditoriale ou avec un dossier illisible, la source ne publie rien. Une première lecture sans couple valide rend également `null`. Après une publication valide, une proposition invalide conserve le jeu en mémoire, uniquement si ses références sont encore disponibles dans le catalogue servi ; sinon aucun jeu éditorial n'est exposé. La borne de génération reste conservée même quand ce jeu n'est plus compatible. Un lot valide `pages: []` retire tout.

Les contrôles LF sont autorisés dans les champs `text` des sections ; les identifiants, titres, chemins et métadonnées ne portent aucun caractère de contrôle. Les longueurs de texte comptent les caractères Unicode, comme le producteur Python, y compris les caractères représentés par deux unités UTF-16 en JavaScript. Les champs facultatifs vides des sections sont refusés conformément à leur omission prévue au contrat. Les entiers sont bornés à la représentation exacte des entiers JavaScript. L'origine de canonique doit être une origine HTTP(S) sans identifiants, chemin métier, requête ni fragment ; aucune origine n'est déduite d'une requête entrante.

## Ce que le contrat ne porte pas

- Aucun ordre supplémentaire ni drapeau « dans la barre » pour les pages : ordre reçu, accueil exclu, huit premières entrées valides.
- Aucun libellé de bouton pour `hero.link` : le lecteur utilise « Découvrir ».
- Aucun texte alternatif pour `text_image` : `alt=""`, média décoratif, y compris le remplacement d'image masqué aux lecteurs d'écran.
- Aucun refus de régression persistant entre redémarrages : protection limitée à la durée de vie du processus. Les processus distincts ne partagent pas cette mémoire.
- Aucun transport distant : lire le dossier local de la Factory suppose un système de fichiers partagé. Un changement d'instance ou de provenance doit être qualifié explicitement ; le lecteur ne fusionne pas les dossiers.
- Aucun ACK éditorial, activation du SITE, signature de reçu, prévisualisation Factory qualifiée ou synchronisation automatique de dates.
- Aucun format enrichi exécutable, prix éditorial, base fiscale, média nouveau ou règle de sélection des familles hors du catalogue actif.

## Vérification après écriture (Claude, 31/10)

Le code ci-dessus a été relu puis rejoué hors du bac à sable de Codex : `npm run test:content` (compilation C0, `next build`, tests `nav`, recette HTTP en source fixture) : **76/76**. Deux assertions de test ont été corrigées (ordre des attributs HTML de `aria-current` ; titre de l'accueil éditorial sans gabarit « | PRODES », car le gabarit du layout ne s'applique pas à sa propre page racine : le titre est exactement celui que l'éditeur a publié). Rejeu des autres suites : typecheck propre, `test:nav:ui` 4/4, `test:storefront` 25/25, `test:basis:ui` 5/5, `test:e2e:flow` 8/8.
Non vérifié : un export RÉEL de la Factory (le module producteur est sur la branche `codex/d-site-modules`, non fusionnée ; la forme des fichiers, du reçu et de l'empreinte a été lue dans son code, pas exécutée) ; l'affichage à 390 px des quatre sections au navigateur (la recette HTTP contrôle le HTML, pas le rendu) ; la lecture d'un dossier de la Factory depuis un site hébergé ailleurs (suppose un système de fichiers partagé).
