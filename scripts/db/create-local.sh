#!/bin/bash
# Crée (idempotent) le rôle de TEST `prodes_site` et des bases SITE locales sur le PostgreSQL du Mac.
#
#   scripts/db/create-local.sh [--recreate] <base> [<base> ...]
#
# - Rôle `prodes_site`, mot de passe `local-dev-only` : identifiant de TEST local, jamais un secret réel.
# - Seules les bases nommées `prodes_site_*` sont acceptées (garde-fou : jamais une base Factory).
# - `--recreate` supprime puis recrée les bases nommées (bases de test seulement).
# - Connexion superutilisateur locale : PGHOST=localhost PGPORT=54318 PGUSER=postgres (surchargeables).
# Aucune action distante (jamais JARVIS).
set -euo pipefail
export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-54318}" PGUSER="${PGUSER:-postgres}"
case "$PGHOST" in localhost|127.0.0.1|::1) ;; *) echo "REFUS: PGHOST=$PGHOST n'est pas local" >&2; exit 2;; esac

RECREATE=0
DBS=()
for arg in "$@"; do
  case "$arg" in
    --recreate) RECREATE=1 ;;
    *) DBS+=("$arg") ;;
  esac
done
[ "${#DBS[@]}" -gt 0 ] || { echo "usage: $0 [--recreate] <prodes_site_...> [...]" >&2; exit 2; }
for db in "${DBS[@]}"; do
  [[ "$db" =~ ^prodes_site_[a-z0-9_]+$ ]] || { echo "REFUS: nom de base '$db' hors préfixe prodes_site_" >&2; exit 2; }
done

psql -X -v ON_ERROR_STOP=1 -d postgres -q <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prodes_site') THEN
    CREATE ROLE prodes_site LOGIN PASSWORD 'local-dev-only' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
COMMENT ON ROLE prodes_site IS 'TEST local SITE (BC2) - mot de passe local-dev-only, jamais un secret reel';
SQL
echo "role prodes_site: OK"

for db in "${DBS[@]}"; do
  if [ "$RECREATE" = 1 ]; then
    psql -X -v ON_ERROR_STOP=1 -d postgres -q -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)"
  fi
  exists=$(psql -X -At -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$db'")
  if [ "$exists" != "1" ]; then
    psql -X -v ON_ERROR_STOP=1 -d postgres -q -c "CREATE DATABASE \"$db\" OWNER prodes_site ENCODING 'UTF8' TEMPLATE template0"
    echo "base $db: créée"
  else
    echo "base $db: déjà présente"
  fi
  psql -X -v ON_ERROR_STOP=1 -d postgres -q -c "COMMENT ON DATABASE \"$db\" IS 'TEST local SITE (BC2), jamais JARVIS'"
done
