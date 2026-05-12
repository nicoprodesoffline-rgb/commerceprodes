# Commerce Agent Ops

Use this skill when working in `commerce` on storefront, admin, data import, SQL, auth, infra, review, debugging, or repository hygiene.

## Workflow

1. Read `AGENTS.md`, `CLAUDE.md`, and `docs/agent-ops/CONTEXT_LOADING.md`.
2. Pick a task type: `agent-ops`, `storefront`, `admin`, `data-sql`, `infra`, or `docs`.
3. Run:
   ```bash
   node scripts/agent_ops/preflight.mjs --task-type <task-type>
   ```
4. Load only the listed context.
5. Before completion, run:
   ```bash
   node scripts/agent_ops/quality-gate.mjs
   node scripts/agent_ops/review-pack.mjs
   ```
6. Run the recommended commands or document why they were skipped.

## Commerce Rules

- Never read `.env*`, `.vercel`, credentials, keys, or private config.
- Treat deploy, SQL migration, auth, checkout, import, and email flows as high-risk.
- Use browser verification for visible UI changes when possible.
- Preserve unrelated user changes.
- Fail loud on skipped checks, warnings, and uncertainty.

## Memory And Errors

Append durable decisions to `docs/agent-ops/MEMORY.md`.
Append failed approaches to `docs/agent-ops/ERRORS.md` using:

```bash
node scripts/agent_ops/preserve-error.mjs --task "Short task" --did-not-work "Failed approach" --worked "Working approach" --note "Next time"
```
