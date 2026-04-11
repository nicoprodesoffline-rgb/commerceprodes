# Tech Stack

## Core

- **Framework**: Next.js 15 (canary) with App Router, React 19
- **Language**: TypeScript 5.8 (strict)
- **Styling**: Tailwind CSS v4, Prettier + prettier-plugin-tailwindcss
- **Package manager**: npm (package-lock.json present), pnpm also used

## Backend / Data

- **Shopify**: Storefront API (product catalogue, cart, checkout) — `lib/shopify/`
- **Supabase**: B2B data layer (quotes, sessions, analytics) — `lib/supabase/`
- **Email**: Resend via `lib/email/sender.ts`
- **AI**: Anthropic SDK `@anthropic-ai/sdk`

## UI libs

- `@headlessui/react`, `@heroicons/react`
- `embla-carousel-react`
- `sonner` (toasts)
- `jspdf` (PDF export)
- `csv-parse` (CSV import scripts)

## Dev

- No test framework (test script = prettier:check)
- Linting: none configured beyond Prettier
- Deployment: Vercel (vercel.json present)
