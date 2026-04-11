#!/usr/bin/env bash
# file-guard.sh — Protège les fichiers sensibles contre modification dans Claude Code
# Scope: projet commerce (.claude/settings.local.json)
# Reçoit le tool input via stdin (JSON)

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('file_path',''))" 2>/dev/null || echo "")

block() {
  echo "$1" >&2
  exit 2
}

# --- Fichiers .env ---
BASENAME=$(basename "$FILE_PATH")
if echo "$BASENAME" | grep -qE '^\.env(\.local|\.production|\.staging|\.test)?$'; then
  block "🚫 FILE GUARD: Modification de '$FILE_PATH' bloquée.
Raison: fichier de secrets d'environnement — ne jamais modifier via Claude Code.
Pour changer une variable: édite le fichier manuellement ou via ton gestionnaire de secrets."
fi

# --- Migrations Supabase existantes ---
if echo "$FILE_PATH" | grep -qE 'supabase/migrations/.*\.sql$'; then
  block "🚫 FILE GUARD: Modification de '$FILE_PATH' bloquée.
Raison: les migrations SQL existantes ne doivent jamais être modifiées après création.
Pour corriger: crée une nouvelle migration avec 'supabase migration new <nom>'."
fi

exit 0
