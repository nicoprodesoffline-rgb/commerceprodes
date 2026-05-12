# AGENTS.md — Commerce Prodes

Project repo: `/Users/nico/Desktop/commerce`

These rules apply to Codex, Claude Code, and any local coding agent working in this repo. Keep this file short; deeper context lives in `docs/agent-ops/`.

## Operating Rules

1. Read before writing: load `AGENTS.md`, `CLAUDE.md`, and task-specific context from `docs/agent-ops/CONTEXT_LOADING.md`.
2. State assumptions when ambiguous. Ask before production-affecting changes, secret access, deploys, destructive git actions, or database mutations.
3. Make surgical changes. Touch only the files needed for the requested behavior and match local conventions.
4. Prefer deterministic code over model judgment for routing, retries, parsing, auth checks, status handling, and transforms.
5. Surface conflicts instead of blending patterns. Pick the more recent/tested pattern and flag cleanup.
6. Tests and checks must prove intent. If no useful check is available, say why and provide another verification path.
7. Checkpoint significant multi-step work: what changed, what is verified, what remains.
8. Fail loud. Never call work complete if checks were skipped, failed, or only partially run.
9. Preserve user changes. Do not revert unrelated dirty files or untracked artifacts.
10. Treat repeated agent mistakes as harness input: add or update a rule, test, hook, script, skill, or memory entry.

## Commerce Truths

- `.env*`, `.vercel`, tokens, and credentials are never context.
- Production deploy, Vercel config, Supabase SQL, auth, email, import, and customer-facing checkout flows require explicit care and verification.
- SQL migrations and data import scripts must be reviewed as business-impacting changes.
- UI changes should be verified against real screens when a browser is available.

## Task Routing

- Context choice: `node scripts/agent_ops/context-loader.mjs --task-type <type>`
- Preflight: `node scripts/agent_ops/preflight.mjs --task-type <type>`
- Quality gate: `node scripts/agent_ops/quality-gate.mjs`
- Review pack: `node scripts/agent_ops/review-pack.mjs`
- Memory capture: `node scripts/agent_ops/preserve-memory.mjs --help`

## References

- Shared contract: `CLAUDE.md`
- Protocol: `docs/agent-ops/AGENT_OPERATING_PROTOCOL.md`
- Context loading: `docs/agent-ops/CONTEXT_LOADING.md`
- Ratchet: `docs/agent-ops/HARNESS_RATCHET.md`
- Security: `docs/agent-ops/SECURITY_AND_ENFORCEMENT.md`
