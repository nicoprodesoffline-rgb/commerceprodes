# Common Mistakes

- Do not use raw Supabase client in components or routes when `lib/supabase/index.ts` already owns the query.
- Product images come from `product_images`, never `featured_image_url`.
- B2B UI rule: no generic "Add to Cart" button on product pages.
- Price format stays `fr-FR` with `" € HT"`.
- Never edit `state/`, `.env*`, or `supabase/migrations/` without explicit user approval.
- If `npx tsc --noEmit` fails on missing `.next/types`, build first and rerun TSC.

