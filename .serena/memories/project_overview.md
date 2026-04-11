# Project Overview — PRODES Commerce

## Purpose

Next.js e-commerce application for PRODES, a B2B distributor of professional cleaning/maintenance products. The app serves both a public storefront (Shopify-backed catalogue) and a private B2B admin panel.

## Key features

- Product catalogue via Shopify Storefront API
- B2B admin panel (`/app/admin/`) with devis (quotes), orders, analytics, variations management
- Supabase for B2B data (quotes, sessions, users, analytics)
- Email via Resend (`lib/email/sender.ts`)
- PDF generation (jsPDF) for quotes/devis
- Rate limiting middleware (`lib/rate-limit.ts`)
- Anthropic AI SDK integrated (`@anthropic-ai/sdk`)

## Workspace layout

- App: `/Users/nico/Desktop/prodes_newsite_codex/commerce`
- Orchestration root: `/Users/nico/Desktop/prodes_newsite_codex`
- Shared state: `/Users/nico/Desktop/prodes_newsite_codex/state`
  - `state/orchestrator.json` — active mode
  - `state/roadmap.json` — planned tasks
  - `state/handoff.json` — last session packet
  - `state/ideas.json` — idea backlog
