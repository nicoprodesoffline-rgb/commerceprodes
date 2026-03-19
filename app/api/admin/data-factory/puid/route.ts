import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { supabaseServer } from "lib/supabase/client";
import { buildPuidPlan, loadPuidInput, type PuidScope } from "lib/admin/puid";

function parseBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function parseScope(value: unknown): PuidScope {
  return value === "latest_import" || value === "latest" ? "latest_import" : "all";
}

async function resolveLatestImportSince(client: ReturnType<typeof supabaseServer>): Promise<string | null> {
  const latestImport = await client
    .from("import_logs")
    .select("created_at")
    .in("status", ["pending", "processing", "done"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestImport.error || !latestImport.data?.created_at) return null;
  return String(latestImport.data.created_at);
}

async function hasPuidColumns(client: ReturnType<typeof supabaseServer>): Promise<boolean> {
  const probe = await client.from("products").select("id, puid").limit(1);
  if (!probe.error) return true;
  return false;
}

async function querySkuConflicts(
  client: ReturnType<typeof supabaseServer>,
  table: "products" | "variants",
  idsToUpdate: string[],
  skuTargets: string[],
): Promise<Map<string, string[]>> {
  const conflictMap = new Map<string, string[]>();
  if (skuTargets.length === 0) return conflictMap;

  const { data, error } = await client
    .from(table)
    .select("id, sku")
    .in("sku", skuTargets)
    .not("id", "in", `(${idsToUpdate.join(",")})`);

  if (error || !data) return conflictMap;
  for (const row of data as Array<{ id: string; sku: string | null }>) {
    const sku = String(row.sku || "");
    if (!sku) continue;
    const ids = conflictMap.get(sku) ?? [];
    ids.push(String(row.id));
    conflictMap.set(sku, ids);
  }
  return conflictMap;
}

function buildPreviewResponse(plan: ReturnType<typeof buildPuidPlan>, since: string | null, scope: PuidScope) {
  return {
    scope: {
      mode: scope,
      since,
      ...plan.scope,
    },
    products: plan.product_suggestions,
    variants: plan.variant_suggestions,
    branches: plan.branches,
    collisions: plan.collisions,
  };
}

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const client = supabaseServer();
  const url = new URL(req.url);
  const scope = parseScope(url.searchParams.get("scope"));
  const limit = Math.min(3000, Math.max(1, Number(url.searchParams.get("limit") || 300)));
  const includeDraft = parseBool(url.searchParams.get("include_draft"), true);

  const since = scope === "latest_import" ? await resolveLatestImportSince(client) : null;

  try {
    const input = await loadPuidInput(client, {
      scope,
      sinceIso: since,
      limit,
      includeDraft,
    });
    const plan = buildPuidPlan({
      products: input.products,
      variants: input.variants,
      rules: input.rules,
      includeOnlyPublished: !includeDraft,
    });

    return NextResponse.json(buildPreviewResponse(plan, since, scope));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur preview PUID" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const client = supabaseServer();
  const scope = parseScope(body.scope);
  const limit = Math.min(3000, Math.max(1, Number(body.limit || 300)));
  const includeDraft = parseBool(body.include_draft, true);
  const applyProducts = parseBool(body.apply_products, true);
  const applyVariants = parseBool(body.apply_variants, true);
  const dryRun = parseBool(body.dry_run, true);
  const applyToSku = parseBool(body.apply_to_sku, false);
  const cleanupLotCandidates = parseBool(body.cleanup_lot_candidates, false);

  const productIds = Array.isArray(body.product_ids)
    ? (body.product_ids as unknown[]).map((id) => String(id)).filter(Boolean)
    : [];

  const since = scope === "latest_import" ? await resolveLatestImportSince(client) : null;

  try {
    const input = await loadPuidInput(client, {
      scope,
      sinceIso: since,
      limit,
      includeDraft,
      productIds,
    });

    const plan = buildPuidPlan({
      products: input.products,
      variants: input.variants,
      rules: input.rules,
      includeOnlyPublished: !includeDraft,
    });

    const puidColumnsAvailable = await hasPuidColumns(client);
    if (!puidColumnsAvailable && !applyToSku) {
      return NextResponse.json(
        {
          error: "Colonnes PUID absentes. Appliquez la migration 021 avant écriture.",
          migration: "commerce/docs/sql-migrations/021-puid-identity.sql",
          preview: buildPreviewResponse(plan, since, scope),
        },
        { status: 503 },
      );
    }

    const productMap = new Map(input.products.map((product) => [product.id, product]));

    const productRows = applyProducts ? plan.product_suggestions : [];
    const variantRows = applyVariants ? plan.variant_suggestions : [];

    const productSkuTargets = applyToSku
      ? productRows.map((row) => row.suggested_puid).filter(Boolean)
      : [];
    const variantSkuTargets = applyToSku
      ? variantRows.map((row) => row.suggested_puid).filter(Boolean)
      : [];

    const productSkuConflicts = applyToSku
      ? await querySkuConflicts(client, "products", productRows.map((row) => row.id), productSkuTargets)
      : new Map<string, string[]>();
    const variantSkuConflicts = applyToSku
      ? await querySkuConflicts(client, "variants", variantRows.map((row) => row.id), variantSkuTargets)
      : new Map<string, string[]>();

    if (dryRun) {
      return NextResponse.json({
        dry_run: true,
        scope: {
          mode: scope,
          since,
          ...plan.scope,
        },
        preview: {
          products: productRows.slice(0, 300),
          variants: variantRows.slice(0, 800),
          branches: plan.branches,
          collisions: plan.collisions,
        },
        apply: {
          apply_products: applyProducts,
          apply_variants: applyVariants,
          apply_to_sku: applyToSku,
          cleanup_lot_candidates: cleanupLotCandidates,
          products_planned: productRows.length,
          variants_planned: variantRows.length,
          product_sku_conflicts: [...productSkuConflicts.entries()],
          variant_sku_conflicts: [...variantSkuConflicts.entries()],
        },
      });
    }

    const productSkuMap = new Map<string, string>();
    for (const row of productRows) {
      if (row.source_sku) productSkuMap.set(row.source_sku, row.suggested_puid);
    }

    const result = {
      updated_products: 0,
      updated_variants: 0,
      skipped_products_conflict: 0,
      skipped_variants_conflict: 0,
      lot_rows_drafted_products: 0,
      lot_rows_drafted_variants: 0,
      errors: [] as string[],
    };

    for (const row of productRows) {
      const source = productMap.get(row.id);
      if (!source) continue;

      if (applyToSku && productSkuConflicts.has(row.suggested_puid)) {
        result.skipped_products_conflict += 1;
        continue;
      }

      const payload: Record<string, unknown> = {};
      if (puidColumnsAvailable) {
        payload.puid = row.suggested_puid;
        payload.puid_root = row.puid_root;
        payload.puid_price_branch = row.price_branch;
        payload.puid_style_branch = row.style_branch;
        payload.puid_generated_at = new Date().toISOString();
      }

      if (applyToSku) {
        payload.sku = row.suggested_puid;
        if (source.parent_sku && productSkuMap.has(source.parent_sku)) {
          payload.parent_sku = productSkuMap.get(source.parent_sku)!;
        }
      }

      if (Object.keys(payload).length === 0) continue;

      const { error } = await client.from("products").update(payload).eq("id", row.id);
      if (error) {
        result.errors.push(`products:${row.id}:${error.message}`);
        continue;
      }
      result.updated_products += 1;
    }

    for (const row of variantRows) {
      if (applyToSku && variantSkuConflicts.has(row.suggested_puid)) {
        result.skipped_variants_conflict += 1;
        continue;
      }

      const payload: Record<string, unknown> = {};
      if (puidColumnsAvailable) {
        payload.puid = row.suggested_puid;
        payload.puid_root = row.puid_root;
        payload.puid_price_branch = row.price_branch;
        payload.puid_style_branch = row.style_branch;
        payload.puid_generated_at = new Date().toISOString();
      }

      if (applyToSku) {
        payload.sku = row.suggested_puid;
      }

      if (Object.keys(payload).length === 0) continue;

      const { error } = await client.from("variants").update(payload).eq("id", row.id);
      if (error) {
        result.errors.push(`variants:${row.id}:${error.message}`);
        continue;
      }
      result.updated_variants += 1;
    }

    if (cleanupLotCandidates) {
      const lotProducts = productRows.filter((row) => row.lot_candidate).map((row) => row.id);
      const lotVariants = variantRows.filter((row) => row.lot_candidate).map((row) => row.id);
      if (lotProducts.length > 0) {
        const { error } = await client
          .from("products")
          .update({ status: "draft" })
          .in("id", lotProducts);
        if (error) result.errors.push(`draft_products:${error.message}`);
        else result.lot_rows_drafted_products = lotProducts.length;
      }
      if (lotVariants.length > 0) {
        const { error } = await client
          .from("variants")
          .update({ status: "draft" })
          .in("id", lotVariants);
        if (error) result.errors.push(`draft_variants:${error.message}`);
        else result.lot_rows_drafted_variants = lotVariants.length;
      }
    }

    return NextResponse.json({
      dry_run: false,
      scope: {
        mode: scope,
        since,
        ...plan.scope,
      },
      result,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur apply PUID" }, { status: 500 });
  }
}
