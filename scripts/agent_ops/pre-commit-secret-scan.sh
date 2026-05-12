#!/usr/bin/env bash
set -euo pipefail

patterns=(
  'sk-[a-z]{3}-'
  'sk[_-]live[_-]'
  'gh[pousr]_'
  'AKIA[0-9A-Z]{16}'
  'xox[baprs]-'
  'SG[.]'
  'BEGIN .*PRIVATE KEY'
)

blocked_files=(
  '(^|/)\.env($|[.])'
  '(^|/)\.vercel/'
  '(^|/)credentials\.json$'
  '(^|/)id_rsa$'
  '\.pem$'
  '\.key$'
)

staged_names="$(git diff --cached --name-only --diff-filter=ACM || true)"
staged_diff="$(git diff --cached --diff-filter=ACM -- . ':(exclude)scripts/agent_ops/pre-commit-secret-scan.sh' || true)"

for pattern in "${patterns[@]}"; do
  if printf '%s\n' "$staged_diff" | grep -Eq "$pattern"; then
    printf 'BLOCKED: staged diff contains potential secret pattern: %s\n' "$pattern" >&2
    exit 1
  fi
done

for pattern in "${blocked_files[@]}"; do
  if printf '%s\n' "$staged_names" | grep -Eq "$pattern"; then
    printf 'BLOCKED: staged sensitive file path matches: %s\n' "$pattern" >&2
    exit 1
  fi
done

printf 'Pre-commit secret scan passed.\n'
