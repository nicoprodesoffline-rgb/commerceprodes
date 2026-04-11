# Code Style & Conventions

## TypeScript

- Strict TypeScript, no `any` without justification
- App Router conventions: `page.tsx`, `layout.tsx`, `route.ts` (API routes)
- Server components by default; `'use client'` only when needed
- Named exports preferred

## File structure

- `app/` — Next.js App Router pages and API routes
- `lib/` — shared utilities, organized by domain (shopify/, supabase/, email/, admin/, etc.)
- `components/` — React components (layout/, admin/, etc.)
- `scripts/` — Node.js utility scripts (data import, PUID export/apply)
- `data/` — static data files

## Naming

- Files: kebab-case (`catalog-filters.tsx`, `sender.ts`)
- Components: PascalCase
- Functions/variables: camelCase
- API routes: `app/api/<domain>/route.ts`

## Commits

- Format: `feat(scope): description` / `fix(scope): description` / `docs: description`
- Atomic commits per sub-task
- Never commit `.env.local`, `node_modules/`, secrets

## Formatting

- Prettier with `prettier-plugin-tailwindcss`
- Run `npm run prettier` before committing
