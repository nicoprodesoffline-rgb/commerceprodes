# Context Loading

Goal: give agents the smallest useful context for the task.

## Universal Context

Always load for non-trivial work:

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `package.json`

## Task Types

### `agent-ops`

Use for rules, docs, scripts, skills, and workflow improvements.

Load:

- `docs/agent-ops/AGENT_OPERATING_PROTOCOL.md`
- `docs/agent-ops/CONTEXT_LOADING.md`
- `docs/agent-ops/HARNESS_RATCHET.md`
- `docs/agent-ops/SECURITY_AND_ENFORCEMENT.md`
- `scripts/agent_ops/`
- `tests/agent-ops/`

Verify:

- `node --test tests/agent-ops/*.test.mjs`

### `storefront`

Use for public pages, product cards, navigation, cart, search, and visible UI.

Load:

- `app/page.tsx`
- relevant `app/` route
- relevant `components/`
- relevant `lib/` helper
- browser target or screenshot if visible UI changed

Verify:

- `npm run build`
- browser check for visible UI when applicable

### `admin`

Use for backoffice/admin flows, dashboards, protected routes, and operational screens.

Load:

- relevant `app/admin` route if present
- `middleware.ts` or `proxy.ts` if auth/routing changed
- relevant `lib/` helper
- relevant docs/audit notes

Verify:

- `npm run build`
- auth/routing manual check when applicable

### `data-sql`

Use for SQL migrations, import data, Supabase schema, CSV imports, and data reports.

Load:

- touched migration or data file
- `data/supabase_schema.sql`
- `scripts/import-woocommerce.mjs` if import behavior changed
- one relevant audit/report doc

Verify:

- `node scripts/agent_ops/review-pack.mjs`
- schema/data review by Nico before production application

### `infra`

Use for Next config, Vercel config, package scripts, middleware/proxy, and build settings.

Load:

- `next.config.ts`
- `vercel.json`
- `package.json`
- `proxy.ts`
- `.env.example` if public env shape changed

Verify:

- `npm run build`
- `npm test` if dependency tooling is available

### `docs`

Use for documentation-only changes.

Load:

- target doc
- one upstream doc
- one linked downstream doc

Verify:

- links and commands are correct
- stale local paths are removed

## Avoid

- Do not read `.env`, `.env.local`, `.vercel`, private tokens, or credential files.
- Do not load `.next`, `node_modules`, or large generated outputs.
- Do not use production SQL or Vercel changes as "documentation-only" changes.
