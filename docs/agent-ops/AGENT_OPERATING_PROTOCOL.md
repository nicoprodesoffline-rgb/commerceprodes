# Agent Operating Protocol

This is the Commerce overlay for the shared Codex/Claude Code operating system.

## 1. Start With The Right Context

Before non-trivial work:

1. Read `AGENTS.md`.
2. Read `CLAUDE.md`.
3. Run or consult `node scripts/agent_ops/context-loader.mjs --task-type <type>`.
4. Load only the docs and files needed for the task.

Do not load `.env*`, `.vercel`, credentials, generated build output, `.next`, or full CSV/data dumps unless the task explicitly requires a safe summary.

## 2. Define Success

Make success observable:

- behavior changed or preserved
- files expected to change
- command or browser check that proves it
- data/auth/deploy risk reviewed
- skipped checks called out

## 3. Work In A Worktree

Default branch workflow:

1. Confirm repo status and remote URL safety.
2. Leave unrelated dirty files untouched.
3. Create a worktree for the task.
4. Run baseline checks where the environment allows it.
5. Make scoped changes.
6. Run the quality gate and recommended checks.
7. Produce a review pack before merge.

If `.worktrees/` is not ignored, use a sibling worktree or add the ignore rule before using an in-repo worktree.

## 4. High-Risk Surfaces

Treat these as requiring extra review:

- `docs/sql-migrations/`
- `data/`
- `scripts/import-woocommerce.mjs`
- auth or middleware
- checkout/cart flows
- email/resend flows
- Vercel config
- `.env.example`

## 5. Harness Ratchet

When an agent mistake appears:

1. Classify the failure.
2. Add the smallest durable improvement.
3. Verify that improvement.
4. Record the reason in `HARNESS_RATCHET.md` or `MEMORY.md`.

## 6. Merge Standard

Before merge:

- `node scripts/agent_ops/quality-gate.mjs`
- `node scripts/agent_ops/review-pack.mjs`
- recommended checks from the quality gate, or documented reason they cannot run
- no unrelated dirty files
- no tokenized remote URL
