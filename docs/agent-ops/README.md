# Commerce Agent Ops

Shared operating docs for Codex, Claude Code, and future local agents in `commerce`.

Read in this order:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/agent-ops/AGENT_OPERATING_PROTOCOL.md`
4. `docs/agent-ops/CONTEXT_LOADING.md`
5. `docs/agent-ops/HARNESS_RATCHET.md`
6. `docs/agent-ops/SECURITY_AND_ENFORCEMENT.md`
7. `docs/agent-ops/MEMORY.md`
8. `docs/agent-ops/ERRORS.md`
9. `docs/agent-ops/eval-runs/README.md`
10. `docs/agent-ops/IMPLEMENTATION_LOG_2026-05-12.md`

Useful commands:

```bash
node scripts/agent_ops/preflight.mjs --task-type storefront
node scripts/agent_ops/quality-gate.mjs
node scripts/agent_ops/review-pack.mjs
node scripts/agent_ops/run-skill-evals.mjs --dry-run --split optimization
node --test tests/agent-ops/*.test.mjs
```
