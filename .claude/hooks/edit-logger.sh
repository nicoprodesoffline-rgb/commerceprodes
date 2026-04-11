#!/usr/bin/env bash
# edit-logger.sh — Log async des fichiers édités/créés dans la session Claude Code
# Scope: projet commerce (.claude/settings.local.json)
# Mode: async (non-bloquant)
# Reçoit le tool input + output via stdin (JSON)

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); inp=d.get('tool_input',{}); print(inp.get('file_path',''))" 2>/dev/null || echo "")

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

LOG_FILE="/Users/nico/Desktop/prodes_newsite_codex/state/session-edits.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Crée le répertoire si besoin (ne devrait pas arriver mais sécurité)
mkdir -p "$(dirname "$LOG_FILE")"

echo "[$TIMESTAMP] $TOOL_NAME → $FILE_PATH" >> "$LOG_FILE"

exit 0
