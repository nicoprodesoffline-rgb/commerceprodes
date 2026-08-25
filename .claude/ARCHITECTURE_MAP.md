# Architecture Map

- `app/`
  - App Router pages and API routes
  - `app/search/*` for catalogue UX
  - `app/admin/*` for backoffice and data-factory surfaces
- `components/`
  - shared UI, search filters, product cards, admin widgets
- `lib/supabase/`
  - source of truth for DB access
  - use `lib/supabase/index.ts`, not raw client from components
- `lib/admin/`
  - backoffice-specific helpers
- `docs/`
  - product/project docs, audits, migrations, morning reports
- `.claude/`
  - compact startup context for Claude
- `state/` in parent repo
  - orchestration, roadmap, handoff
  - read only when the task truly needs cross-session or cross-agent state

