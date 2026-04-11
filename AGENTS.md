# AGENTS.md — PRODES Commerce

This file provides project-specific context for Codex agents working on this codebase.
Superpowers skills (systematic-debugging, TDD, verification-before-completion, etc.) are loaded
separately via `~/.agents/skills/superpowers`. This file adds the PRODES-specific layer on top.

---

## Project

**PRODES Commerce** — B2B e-commerce platform for industrial supplies (French market).
Stack: Next.js 15.6 · TypeScript · Supabase (PostgreSQL) · Tailwind CSS · pnpm

Working directory: `/Users/nico/Desktop/prodes_newsite_codex/commerce`

---

## Verification Standard (overrides generic superpowers verification)

The proof-of-work command for this project is:

```bash
cd /Users/nico/Desktop/prodes_newsite_codex/commerce
npx tsc --noEmit && npm run build
```

**Both must pass (exit 0) before any completion claim.**
TSC passing alone is not sufficient. Build must also pass.

---

## Engineering Rules (PRODES-specific)

### Data access

- Always use `lib/supabase/index.ts` functions — never raw Supabase client in components or routes
- Never `select("*")` without explicit justification
- Product images come from the `product_images` table — never `featured_image_url` direct column
- Field name: `eco_contribution` (not `eco_participation`)

### TypeScript

- No `any` types in data flow
- Types live in `lib/supabase/types.ts`
- ProductVariant requires `sku` field

### Client/Server boundary

- `"use client"` only where interactivity or hooks are required
- Cart is localStorage via CartContext — never server-side
- No `useEffect` for data that can be server-fetched

### B2B UI rules (French market)

- Prices formatted: `new Intl.NumberFormat('fr-FR', {minimumFractionDigits:2}).format(price) + " € HT"`
- No "Add to Cart" button — three B2B actions: "Demander un devis" / "Mandat administratif" / "Payer en ligne"
- PBQ pricing: variant tiers take priority over product tiers

### Security

- Never expose raw Supabase errors to client — use `safeError` helper
- Rate limiting via middleware on all public POST routes
- No SQL in application code — use Supabase functions or RLS

---

## State and Orchestration

```
state/
├── orchestrator.json   # current mode (manual | codex-autonomous)
├── handoff.json        # last session context — read on startup
├── lock.json           # active session metadata
├── roadmap.json        # project priorities
└── task-packets/       # task definitions from human+Claude planning
```

**Read `state/handoff.json` at session start** to understand what the previous session left off.

### Forbidden paths (never modify without explicit instruction)

- `state/` — orchestration files are written only by `relay.sh`
- `.env*` — environment variables
- `supabase/migrations/` — SQL migrations require human approval
- `docs/agentic/` — operating model documentation

---

## Session Close

At the end of every session, call:

```bash
cd /Users/nico/Desktop/prodes_newsite_codex
./scripts/relay.sh end "<validation 1 line>" "<next step 1 line>" "codex" "<task title>"
```

This is the **only authorized writer** to `handoff.json`. Never write to it directly.

---

## Debugging Reference (PRODES-specific Phase 1 evidence gathering)

When systematic-debugging Phase 1 calls for evidence in a multi-component system:

```bash
# TypeScript errors
npx tsc --noEmit 2>&1 | head -30

# Build output
npm run build 2>&1 | tail -40

# Supabase query issues — check RLS and function signatures
# Route errors — check server component vs client component boundary
# Type errors — grep lib/supabase/types.ts for the type definition
```

---

## Key Files

| File                    | Purpose                    |
| ----------------------- | -------------------------- |
| `lib/supabase/index.ts` | All DB access functions    |
| `lib/supabase/types.ts` | TypeScript types           |
| `middleware.ts`         | Rate limiting, auth guards |
| `app/api/`              | API routes                 |
| `components/`           | Shared components          |
| `state/handoff.json`    | Session context            |
| `state/roadmap.json`    | Project priorities         |

---

## Superpowers Skills Available

The following skills are loaded via `~/.agents/skills/superpowers`:

| Skill                            | Triggers when                               |
| -------------------------------- | ------------------------------------------- |
| `systematic-debugging`           | Any bug, test failure, unexpected behavior  |
| `verification-before-completion` | Before any "done" or "fixed" claim          |
| `test-driven-development`        | Before writing any feature or fix code      |
| `receiving-code-review`          | When receiving review feedback              |
| `brainstorming`                  | Before starting any non-trivial feature     |
| `writing-plans`                  | Before implementation of multi-step work    |
| `subagent-driven-development`    | For parallel execution of independent tasks |

**When in doubt, invoke the skill. The cost of checking is zero.**
