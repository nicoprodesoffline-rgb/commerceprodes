# Agent Ops Memory

Durable memory for Commerce agent operations. Keep entries short, dated, and actionable.

## 2026-05-12 — Shared Agent Ops Port

Decision: Commerce gets the same shared Codex/Claude Code operating contract as Retab, adapted to a Next.js ecommerce repo.

Implementation shape:

- short root contracts in `AGENTS.md` and `CLAUDE.md`
- deeper docs under `docs/agent-ops/`
- deterministic Node scripts under `scripts/agent_ops/`
- built-in Node tests under `tests/agent-ops/`

## 2026-05-12 — Baseline Caveats

Observed before changes:

- `pnpm` is unavailable in this shell.
- `npm test` fails because it delegates to `pnpm prettier:check`.
- the sibling worktree has no `node_modules`, so `npm run build` fails with `next: command not found`.

The agent-ops harness uses `node --test` so it can be verified without installing dependencies.
