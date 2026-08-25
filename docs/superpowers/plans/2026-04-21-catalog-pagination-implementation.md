# Catalog Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe server-rendered pagination for `/search` and `/search/[collection]` without breaking existing non-paginated product queries.

**Architecture:** Keep the existing `getProducts()` and `getCollectionProducts()` APIs for all current callers, and add dedicated paginated helpers for catalogue pages only. Wire the two search pages to `?page=` navigation while preserving existing filters/sort parameters and stable SEO metadata.

**Tech Stack:** Next.js App Router, TypeScript, Supabase query helpers, server components

---

### Task 1: Add paginated catalogue helper

**Files:**
- Modify: `lib/supabase/index.ts`

- [ ] **Step 1: Write the failing test substitute**

Document the expected contract in code comments and implement a typed helper returning:
- `products`
- `total`
- `currentPage`
- `totalPages`
- `pageSize`

Reason: this repo currently has no unit test runner beyond formatting, so proof will come from typecheck/build plus page integration.

- [ ] **Step 2: Implement minimal paginated helpers**

Add dedicated paginated functions for:
- global search/catalog
- category search/catalog

Use Supabase `count: "exact"` and `range(offset, end)` while preserving existing filters, ordering, and exclusion of family children.

- [ ] **Step 3: Verify helper compiles**

Run: `npx tsc --noEmit`
Expected: PASS

### Task 2: Wire `/search` and `/search/[collection]`

**Files:**
- Modify: `app/search/page.tsx`
- Modify: `app/search/[collection]/page.tsx`

- [ ] **Step 1: Read `page` from search params**

Normalize invalid values to page `1`.

- [ ] **Step 2: Render pagination controls**

Add previous/next links plus `Page X / Y`, preserving all active query params.

- [ ] **Step 3: Keep SEO stable**

Update metadata/canonical handling so page 1 stays canonical without `?page=1`, while other pages use `?page=N`.

- [ ] **Step 4: Verify integration**

Run: `npx tsc --noEmit`
Expected: PASS

### Task 3: Final proof

**Files:**
- Modify: any files above only if verification requires fixes

- [ ] **Step 1: Run project proof-of-work**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 2: Summarize result**

Capture:
- final modified files
- whether pagination works on both routes
- any follow-up left out of scope
