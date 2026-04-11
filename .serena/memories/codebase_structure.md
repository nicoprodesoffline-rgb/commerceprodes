# Codebase Structure

```
commerce/
├── app/
│   ├── admin/           # B2B admin panel pages (variations, devis, etc.)
│   ├── api/             # API routes
│   │   ├── admin/       # Admin API (auth, analytics, devis, healthcheck, products/status)
│   │   ├── checkout/
│   │   ├── contact/
│   │   ├── devis/
│   │   ├── devis-express/
│   │   └── search/filters/
│   ├── cart/
│   ├── checkout/
│   ├── product/
│   ├── search/[collection]/
│   └── [page]/          # CMS pages
├── components/
│   ├── admin/           # Admin UI components (sidebar, etc.)
│   └── layout/          # Layout components (navbar, search, catalog-filters)
├── lib/
│   ├── shopify/         # Shopify Storefront API client
│   ├── supabase/        # Supabase client + queries
│   ├── email/           # Resend email sender
│   ├── admin/           # Admin session management
│   ├── quote/           # Quote/devis logic
│   ├── pdf/             # PDF generation
│   ├── cart/            # Cart logic
│   ├── analytics/       # Analytics helpers
│   ├── rate-limit.ts    # Rate limiting
│   ├── logger.ts        # Logging utility
│   └── validation.ts    # Input validation
├── scripts/             # Data import/export scripts (PUID, acronymes, WooCommerce)
├── middleware.ts         # Next.js middleware (rate limiting, auth guards)
└── docs/                # Project documentation and session reports
```
