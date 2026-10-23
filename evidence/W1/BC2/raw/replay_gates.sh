#!/bin/bash
# Rejoue les gates BC2 au commit courant et écrit les sorties brutes dans evidence/W1/BC2/raw/.
#   bash evidence/W1/BC2/raw/replay_gates.sh /Users/nico/Desktop/prodes-w1/commerce-bc2
# PostgreSQL local 18.6 (port 54318, superutilisateur local postgres) ; serveur Next sur 3331 lancé puis tué par PID.
set -o pipefail
C="$1"; R="$C/evidence/W1/BC2/raw"; cd "$C" || exit 2
SHA=$(git rev-parse HEAD); H="# $(date -u +%FT%TZ) commit testé $SHA node $(node -v) npm $(npm -v) $(psql --version)"
DEV_URL=postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_bc2
POLICY='{"max_withdrawals_without_release":null,"released_expected_withdrawals_digest":null}'
rm -rf node_modules .next c0/ts/dist .bc2-build
{ echo "$H"; npm ci --no-fund; echo "npm_ci_exit=$?"; npm ls pg @types/pg next typescript; } > $R/npm_ci.txt 2>&1
{ echo "$H"; npm run c0:check; echo "c0_check_exit=$?"; } > $R/c0_check.txt 2>&1
{ echo "$H"; npm run typecheck; echo "typecheck_exit=$?"; } > $R/typecheck.txt 2>&1
{ echo "$H"; echo "# commande: env -i PATH HOME NEXT_TELEMETRY_DISABLED=1 npm run build (aucune variable SITE_*)"; env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 npm run build; echo "build_exit=$?"; } > $R/build.txt 2>&1
# Base : rôle + bases (idempotent), base de dev recréée vide, migrations, idempotence
{ echo "$H"; scripts/db/create-local.sh prodes_site_bc2_test; scripts/db/create-local.sh --recreate prodes_site_bc2; echo "create_exit=$?";
  SITE_DATABASE_URL=$DEV_URL node scripts/db/migrate.mjs; echo "migrate_exit=$?";
  SITE_DATABASE_URL=$DEV_URL node scripts/db/migrate.mjs; echo "migrate_again_exit=$?";
  scripts/db/create-local.sh prodes_factory; echo "refus_factory_exit=$?";
  SITE_DATABASE_URL=postgres://prodes_factory:x@localhost:54318/prodes_factory node scripts/db/migrate.mjs; echo "migrate_factory_refused_exit=$?";
  SITE_DATABASE_URL=postgres://prodes_site:x@jarvis:5432/prodes_site_prod node scripts/db/migrate.mjs; echo "migrate_jarvis_refused_exit=$?";
  SITE_DATABASE_URL="$DEV_URL?host=jarvis" node scripts/db/migrate.mjs; echo "migrate_host_param_refused_exit=$?";
  psql -X -h localhost -p 54318 -U postgres -d prodes_site_bc2 -c '\d+ site_generation' -c '\d site_active_pointer' -c '\d site_media' -c '\d site_publication_log' -c 'SELECT version, name, sha256 FROM schema_migrations ORDER BY version'; } > $R/db_setup.txt 2>&1
# 13 familles + contrôle data_label, PostgreSQL réel prodes_site_bc2_test
{ echo "$H"; npm run test:bc2; echo "test_bc2_exit=$?"; } > $R/test_bc2.txt 2>&1
{ echo "$H"; npm run c0:build >/dev/null && npm run c0:test; echo "c0_test_exit=$?"; npm run c0:vendor-test; echo "vendor_test_exit=$?"; npm run c0:check; echo "c0_check_after_exit=$?"; } > $R/c0_twin.txt 2>&1
# HTTP réel, port 3331
[ -z "$(lsof -nP -iTCP:3331 -sTCP:LISTEN -t)" ] || { echo "port 3331 occupé" > $R/server_pid.txt; exit 3; }
env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 SITE_ENV=staging SITE_DATABASE_URL=$DEV_URL \
  SITE_KEYRING_PATH="$C/c0/fixtures/keys/test_keyring.json" SITE_ACK_KEY_ID=c0-test-ack-01 SITE_WITHDRAWAL_HOLD_POLICY="$POLICY" \
  node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3331 > $R/start_3331.txt 2>&1 &
PID=$!; echo "$H"$'\n'"commande: node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3331 (SITE_ENV=staging, base prodes_site_bc2, trousseau de test)"$'\n'"server_pid=$PID" > $R/server_pid.txt
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:3331/ && break; sleep 0.5; done
echo "listener_pid: $(lsof -nP -iTCP:3331 -sTCP:LISTEN -t | tr '\n' ' ')" >> $R/server_pid.txt
{ echo "$H BASE_URL=http://127.0.0.1:3331 node tests/bc2/http-smoke.mjs"; BASE_URL=http://127.0.0.1:3331 SITE_TEST_DATABASE_URL=unused node tests/bc2/http-smoke.mjs; echo "http_bc2_exit=$?"; } > $R/http_bc2_3331.txt 2>&1
{ echo "$H BASE_URL=http://127.0.0.1:3331 PHASE=default node spike/http-tests.mjs"; BASE_URL=http://127.0.0.1:3331 PHASE=default node spike/http-tests.mjs; echo "http_tests_exit=$?"; } > $R/http_spike_default_3331.txt 2>&1
{ echo "$H SERVER_PID=$PID BASE_URL=http://127.0.0.1:3331 node tests/bc2/http-body-limits.mjs"; SERVER_PID=$PID BASE_URL=http://127.0.0.1:3331 SITE_DEV_DATABASE_URL=$DEV_URL node tests/bc2/http-body-limits.mjs; echo "http_body_limits_exit=$?"; } > $R/http_body_limits_3331.txt 2>&1
{ echo "$H"; psql -X -h localhost -p 54318 -U postgres -d prodes_site_bc2 -c "SELECT id, operation, publication_id, catalogue_sequence, outcome, error_codes, stage, detail FROM site_publication_log ORDER BY id" -c "SELECT catalogue_sequence, status, activated_at FROM site_generation" -c "SELECT generation_id, catalogue_sequence, payload_sha256 FROM site_active_pointer"; } > $R/http_db_after.txt 2>&1
kill $PID; wait $PID 2>/dev/null; echo "kill $PID -> wait status=$?" >> $R/server_pid.txt; sleep 1
echo "listener_after_kill: [$(lsof -nP -iTCP:3331 -sTCP:LISTEN -t | tr '\n' ' ')]" >> $R/server_pid.txt
{ echo "# diff spike/logs/http-tests-default.log vs run 3331 (lignes PASS/FAIL)"; diff <(grep -E '^(PASS|FAIL) ' spike/logs/http-tests-default.log) <(grep -E '^(PASS|FAIL) ' $R/http_spike_default_3331.txt); echo "diff_exit=$?"; } > $R/http_spike_diff.txt
{ echo "$H"; git status --short; echo "git_diff_c0: [$(git diff --stat 5f69e742 -- c0 | tail -1)]"; } > $R/git_state.txt
grep -hE "_exit=|# (tests|pass|fail) |C0_VENDOR|MIGRATIONS_|listener|PASS, |HTTP BC2|LIMITES BC2" $R/*.txt
