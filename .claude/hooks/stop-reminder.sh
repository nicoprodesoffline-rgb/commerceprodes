#!/usr/bin/env bash
# stop-reminder.sh — Rappel macOS à la fin d'une session Claude Code
# Scope: projet commerce (.claude/settings.local.json)
# Mode: async (non-bloquant)

osascript -e 'display notification "N'\''oublie pas /session-handoff si session significative" with title "Claude Code — commerce/" sound name "Purr"' 2>/dev/null || true

exit 0
