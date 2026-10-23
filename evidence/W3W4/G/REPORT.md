# W3W4 / Lot G — miroir Commerce (durcissement transport, préalables BC6)

Branche `build/w4-g-transport-doc`, base `6907582c` (candidat `build/w3w4-site-candidate`). Rapport principal :
Factory `build/w4-g-projection-hardening`, `evidence/W3W4/G/REPORT.md` (campagne adversariale, DF-0105…0108, 0089, 0093).
Statut maximal : `TESTED_SYNTHETIC` (base SITE locale `prodes_site_w4g_test`, fixtures C0, secrets de test).

| Item | Statut | Preuve | Caveat |
|---|---|---|---|
| DF-0090 : `max_withdrawals_without_release = null` hors `SITE_ENV=staging` refuse le **démarrage** (message `DÉMARRAGE REFUSÉ`, code 1) | ✅ | `lib/site-publish/config.ts` (`startupPolicyRefusal`, `enforceStartupPolicy`), `instrumentation.ts` (`register`) ; `tests/bc2/18_startup_policy.test.mjs` ; démarrage réel `next start` 127.0.0.1:3384 : Factory `evidence/W3W4/G/raw/campaign/df0090_startup.txt` (production/prod refusés exit 1, staging et entier démarrent ; sonde 3 × : 0 réponse HTTP avant l'arrêt) | « Ready » est journalisé ~0,1 s avant le refus (fenêtre sondée, non prouvée nulle) ; politique absente/mal formée : inchangé (503 par requête) ; **seuil réel = `REQUIRES_OWNER_DECISION`** |
| DF-0130 : règle « routes machine hors proxy, aucun tampon < 32 MiB » écrite dans la doc de transport | ✅ | `docs/SITE_TRANSPORT_STAGING.md` § « Routes machine hors proxy » ; `docs/DEPLOY_CHECKLIST_SITE.md` (nouveau) ; runbook Factory BC5 aligné ; `tests/http/storefront.test.mjs` section 4 rejouée (21/21) | check-list préparatoire : aucun frontal réel vérifié |
| `npm run test:bc2` (base `prodes_site_w4g_test`) | ✅ 60/60 | `evidence/W3W4/G/raw/test_bc2_40231952.txt` | 58 avant + 2 nouveaux (famille 18) |
| `npm run test:http` (port 3384) | ✅ 88/88 | `evidence/W3W4/G/raw/test_http_40231952.txt` | — |
| `npm run test:storefront` (base `prodes_site_w4g_test`, port 3384) | ✅ 21/21 | `evidence/W3W4/G/raw/test_storefront_40231952.txt` | rejoué en plus du mandat (test cité par DF-0130) |
| `tsc --noEmit` | ✅ | exit 0 (journal de session) | — |

Fichiers : `lib/site-publish/config.ts`, `instrumentation.ts`, `tests/bc2/18_startup_policy.test.mjs`,
`docs/SITE_TRANSPORT_STAGING.md`, `docs/DEPLOY_CHECKLIST_SITE.md` (nouveau), `evidence/W3W4/G/**`. `proxy.ts` non touché.
`instrumentation.ts` n'est pas nommé dans l'ownership du mandat : c'est le point de démarrage du receiver demandé par
« démarrage refusé » (4 lignes, appel d'une fonction de `config.ts`).

Non livré : seuil réel de retraits ; vérification d'un frontal réel ; HTTPS ; Ed25519 (DF-0093, Factory
`docs/operations/SITE_ACK_SECRET_ISOLATION.md`).
