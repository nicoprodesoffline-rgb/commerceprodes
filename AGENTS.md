# AGENTS.md — PRODES Commerce

Project repo: `/Users/nico/Desktop/prodes_newsite_codex/commerce`

This file is the Codex-facing rule layer for `commerce`. Keep it short; use the repo docs for detail:
- `CLAUDE.md` for the compact startup path
- `.claude/QUICK_START.md`
- `.claude/ARCHITECTURE_MAP.md`
- `.claude/CURRENT_PRIORITIES.md`
- `.claude/COMMON_MISTAKES.md`
- `.claude/SESSION_PROTOCOL.md`

## Verification Standard

Proof-of-work for this repo:

```bash
cd /Users/nico/Desktop/prodes_newsite_codex/commerce
npm run build && npx tsc --noEmit
```

Both must pass before any completion claim.
Run build first because this repo expects `.next/types` to exist before TSC.

## Non-Negotiable Project Rules

### Data access

- Use `lib/supabase/index.ts` for DB access; do not query Supabase directly from components.
- Avoid `select("*")` unless explicitly justified.
- Product images come from `product_images`, never `featured_image_url`.
- Field name is `eco_contribution`, not `eco_participation`.

### TypeScript

- No `any` in normal data flow.
- Shared types live in `lib/supabase/types.ts`.
- `ProductVariant` requires `sku`.

### Client / server boundary

- Use `"use client"` only when interactivity or hooks require it.
- Cart stays client-side via `CartContext`.
- Do not fetch server-available data via `useEffect`.

### B2B UI

- Price format: `fr-FR` with `" € HT"`.
- Product pages do not use a generic "Add to Cart" CTA.
- PBQ pricing: variant tiers override product tiers.

### Security

- Never expose raw Supabase errors to the client; wrap them first.
- Public POST routes stay rate-limited.
- No ad hoc SQL in application code.

## Protected Paths

Never modify without explicit user approval:
- `state/`
- `.env*`
- `supabase/migrations/`
- `docs/agentic/`

## Session Close

Use only:

```bash
cd /Users/nico/Desktop/prodes_newsite_codex
./scripts/relay.sh end "<validation 1 line>" "<next step 1 line>" "codex" "<task title>"
```

Do not write `handoff.json` directly.

## Quick Debug Reference

```bash
# Build first when TSC depends on .next/types
npm run build
npx tsc --noEmit

# Targeted evidence
npm run build 2>&1 | tail -40
npx tsc --noEmit 2>&1 | head -30
```
