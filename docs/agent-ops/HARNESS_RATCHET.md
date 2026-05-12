# Harness Ratchet

Every costly repeated agent mistake becomes a durable improvement, and every durable improvement has a clear reason to exist.

## Failure Mode Taxonomy

| Failure | Durable fix |
|---|---|
| Tokenized remote URL | remove credential from remote and add merge checklist item |
| `.env` read or leak risk | deny rule, doc warning, dummy test values |
| Hidden build tooling mismatch | log baseline, improve package scripts or setup docs |
| UI claim without browser proof | browser check requirement |
| SQL applied without review | data-sql quality gate |
| Lost context in long task | memory entry or checkpoint |
| Untracked files missed in review | review pack includes `git ls-files --others` |

## Current Entries

### 2026-05-12 — Token In Commerce Remote URL

Observed: `git remote -v` in the Commerce repo exposed a GitHub token in the origin URL.

Fix: replace origin with `https://github.com/nicoprodesoffline-rgb/commerceprodes.git` and add "no tokenized remote URL" to the merge standard.

Verification: `git remote -v` no longer prints a credential.

### 2026-05-12 — Worktree Location

Observed: `.worktrees` was not ignored in `commerce`.

Fix: create the worktree as sibling `/Users/nico/Desktop/commerce-agent-ops-2026-05-12` and add `.worktrees/` to `.gitignore` for future consistency.

Verification: branch work happened outside the repo root, then `.gitignore` gained the future rule.

### 2026-05-12 — Tooling Baseline

Observed: `pnpm` is unavailable in this shell, `npm test` delegates to `pnpm`, and the sibling worktree has no `node_modules`, so `next` is unavailable there.

Fix: add agent-op tests using built-in `node --test` so harness checks do not depend on package manager setup.

### 2026-05-12 — Secret Scanner Self-Matched

Observed: the staged secret scanner initially matched token-pattern literals in its own source.

Fix: make token patterns less literal and exclude the scanner's own source file from staged-diff content scanning.

Verification: `scripts/agent_ops/pre-commit-secret-scan.sh` passed after the patch.
