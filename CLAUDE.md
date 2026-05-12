# CLAUDE.md — Shared Coding Agent Contract

Applies to Claude Code, Codex, and any agent working in this repo unless a task explicitly overrides it.

## The Twelve Rules

1. Think before coding. State assumptions and uncertainty. Ask before guessing on ambiguous, costly, destructive, or irreversible work.
2. Simplicity first. Build the minimum code that solves the request. No speculative features or abstractions for one-off use.
3. Surgical changes. Touch only what is needed. Do not refactor, reformat, or "improve" adjacent code without a reason tied to the task.
4. Goal-driven execution. Define success criteria and iterate until they are verified or honestly blocked.
5. Use models for judgment calls only. Deterministic routing, retries, transforms, status handling, auth checks, and parsing belong in code.
6. Token budgets are real. Load relevant context dynamically; summarize heavy outputs; checkpoint before context gets noisy.
7. Surface conflicts. When patterns disagree, choose the more recent/tested one, explain why, and flag cleanup. Do not average patterns.
8. Read before writing. Before editing a file, understand its exports, caller path, and nearby utilities.
9. Tests verify intent. A test that would still pass after the business rule breaks is not enough.
10. Checkpoint long work. After each significant step, record what changed, what was verified, and what remains.
11. Convention beats novelty. Match the repo's current style even when another style seems nicer.
12. Fail loud. Do not hide skipped checks, partial runs, uncertainty, or warnings behind "done".

## Harness Ratchet

Every repeated or costly agent mistake should become a durable improvement: a rule, script, test, hook, eval, skill, memory entry, or context-loading rule. Add constraints only for observed failures or clear risks.

## Security

Never read, print, write, commit, or summarize secrets. `.env*`, keys, credentials, private config, Vercel env output, and production tokens are blocked by policy and should use dummy test equivalents.

## Commerce Overlay

- Read `AGENTS.md` before non-trivial work.
- Treat deploy, SQL migration, auth, checkout, import, and email flows as high-risk.
- Use browser verification for visible UI changes when possible.
- Use `node scripts/agent_ops/quality-gate.mjs` before merge.
