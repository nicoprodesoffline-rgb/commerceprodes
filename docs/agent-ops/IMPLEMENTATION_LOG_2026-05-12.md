# 2026-05-12 — Commerce Agent Ops Port Log

## Worktree

- Base repo: `/Users/nico/Desktop/commerce`
- Worktree: `/Users/nico/Desktop/commerce-agent-ops-2026-05-12`
- Branch: `codex/0512-shared-agent-ops`
- Base commit: `023c0405 fix(admin): remove redirect() from layout — render login inline instead`
- `.worktrees` was not ignored at start, so this port used a sibling worktree.

## Baseline Notes

Before changes:

```bash
pnpm test
```

failed because `pnpm` is not available in this shell.

```bash
npm test
```

failed because the script delegates to `pnpm prettier:check`.

```bash
npm run build
```

failed in the sibling worktree because `next` is not installed there.

## Implementation Scope

- add root `AGENTS.md` and `CLAUDE.md`
- add `docs/agent-ops/`
- add deterministic Node scripts under `scripts/agent_ops/`
- add `node --test` agent-op tests under `tests/agent-ops/`
- add a secret scan script
- add future `.worktrees/` ignore rule
- update `package.json` so `npm test` no longer delegates to unavailable `pnpm`

## Merge Guidance

Merge after:

- `node --test tests/agent-ops/*.test.mjs` passes
- JSON/settings checks pass
- secret scan passes
- review pack is generated
- Nico accepts the baseline tooling caveat around `pnpm`/worktree dependencies

## Verification In Worktree

Passed:

```bash
node --test tests/agent-ops/*.test.mjs
scripts/agent_ops/pre-commit-secret-scan.sh
node scripts/agent_ops/preflight.mjs --task-type agent-ops
node scripts/agent_ops/quality-gate.mjs
node scripts/agent_ops/review-pack.mjs --baseline-note 'pnpm is unavailable in this shell; npm test delegated to pnpm before this branch'
python3 -m json.tool docs/agent-ops/claude-settings.local.example.json
python3 -m json.tool .claude/settings.local.json
```

Ratchet during implementation:

- initial secret scan blocked on its own token-pattern literals
- scanner now excludes its own file from staged-diff content scanning
- token-like patterns were rewritten to avoid exact token literals where practical

Still blocked in the sibling worktree because dependencies are not installed there:

```bash
npm test
npm run build
```

Observed errors:

```text
prettier: command not found
next: command not found
```

Post-merge plan: rerun `npm test` and `npm run build` in `/Users/nico/Desktop/commerce`, where `node_modules` exists.

## Post-Merge Verification In Main

Passed in `/Users/nico/Desktop/commerce`:

```bash
node --test tests/agent-ops/*.test.mjs
npx prettier --check AGENTS.md CLAUDE.md docs/agent-ops/*.md docs/agent-ops/claude-settings.local.example.json scripts/agent_ops/*.mjs tests/agent-ops/*.mjs package.json
npm run build
python3 -m json.tool docs/agent-ops/claude-settings.local.example.json
python3 -m json.tool .claude/settings.local.json
scripts/agent_ops/pre-commit-secret-scan.sh
```

Still failing in main:

```bash
npm test
```

Reason: repo-wide Prettier backlog remains outside this branch's scope. After formatting the agent-ops files, `npm test` still reports style issues in 136 existing files across `app/`, `components/`, `docs/`, `lib/`, `proxy.ts`, and `scripts/import-woocommerce.mjs`.
