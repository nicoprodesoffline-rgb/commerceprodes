import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { supabaseServer } from "lib/supabase/client";
import { checkFamiliesDb, type DbStatus } from "lib/admin/families-db";

/**
 * POST — Auto-assemble product families from PUID roots.
 *
 * Groups all products that share the same puid_root into families.
 * For each root, the product with the shortest PUID (or family_role='parent')
 * becomes the mother, others become children.
 *
 * Body:
 *   dry_run?: boolean (default true)
 *   limit?: number    (max products to consider)
 *   min_children?: number (minimum children to create a family, default 1)
 *   scope?: "all" | "latest_import"
 */

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  puid: string | null;
  puid_root: string | null;
  family_role: string | null;
  parent_family_id: string | null;
  status: string | null;
  updated_at: string | null;
}

function parseBool(v: unknown, fallback = true): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const dryRun = parseBool(body.dry_run, true);
  const limit = Math.min(5000, Math.max(1, Number(body.limit || 2000)));
  const minChildren = Math.max(1, Number(body.min_children || 1));
  const scope = body.scope === "latest_import" ? "latest_import" : "all";

  // client not used before DB checks – declare here
  const client = supabaseServer();

  // Check families DB migration
  const dbStatus: DbStatus = await checkFamiliesDb();
  if (!dbStatus.available) {
    return NextResponse.json(
      { error: "Migration 016 requise.", table: dbStatus.table },
      { status: 503 },
    );
  }

  // Check puid columns
  const puidProbe = await client.from("products").select("id, puid_root").limit(1);
  if (puidProbe.error) {
    return NextResponse.json(
      { error: "Migration 021 requise (colonne puid_root absente).", migration: "docs/sql-migrations/021-puid-identity.sql" },
      { status: 503 },
    );
  }

  // Load products with puid_root
  let q = client
    .from("products")
    .select("id, name, slug, sku, puid, puid_root, family_role, parent_family_id, status, updated_at")
    .not("puid_root", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (scope === "latest_import") {
    const latestImport = await client
      .from("import_logs")
      .select("created_at")
      .in("status", ["pending", "processing", "done"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestImport.data?.created_at) {
      q = q.gte("updated_at", String(latestImport.data.created_at));
    }
  }

  const { data: productData, error: productError } = await q;
  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  const products: ProductRow[] = (productData ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    name: String(row.name || ""),
    slug: String(row.slug || ""),
    sku: row.sku ? String(row.sku) : null,
    puid: row.puid ? String(row.puid) : null,
    puid_root: row.puid_root ? String(row.puid_root) : null,
    family_role: row.family_role ? String(row.family_role) : null,
    parent_family_id: row.parent_family_id ? String(row.parent_family_id) : null,
    status: row.status ? String(row.status) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  }));

  // Group by puid_root
  const byRoot = new Map<string, ProductRow[]>();
  for (const p of products) {
    if (!p.puid_root) continue;
    const list = byRoot.get(p.puid_root) ?? [];
    list.push(p);
    byRoot.set(p.puid_root, list);
  }

  // Build assembly plan
  const plan: Array<{
    puid_root: string;
    mother: ProductRow;
    children: ProductRow[];
    action: "create" | "skip_existing" | "skip_single";
  }> = [];

  for (const [root, members] of byRoot.entries()) {
    if (members.length - 1 < minChildren) {
      plan.push({ puid_root: root, mother: members[0]!, children: [], action: "skip_single" });
      continue;
    }

    // Elect mother: prefer family_role='parent', else shortest PUID, else first by name
    let mother = members.find((m) => m.family_role === "parent");
    if (!mother) {
      mother = [...members].sort((a, b) => {
        const la = (a.puid ?? a.sku ?? "").length;
        const lb = (b.puid ?? b.sku ?? "").length;
        if (la !== lb) return la - lb;
        return (a.name ?? "").localeCompare(b.name ?? "");
      })[0]!;
    }

    const children = members.filter((m) => m.id !== mother!.id);

    // Check if family already exists for this root
    const existingFamily = await client
      .from("product_families")
      .select("id")
      .eq("parent_product_id", mother.id)
      .eq("active", true)
      .maybeSingle();

    if (existingFamily.data) {
      plan.push({ puid_root: root, mother, children, action: "skip_existing" });
    } else {
      plan.push({ puid_root: root, mother, children, action: "create" });
    }
  }

  const toCreate = plan.filter((p) => p.action === "create");

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      scope,
      stats: {
        total_products_with_puid_root: products.length,
        unique_roots: byRoot.size,
        to_create: toCreate.length,
        skip_existing: plan.filter((p) => p.action === "skip_existing").length,
        skip_single: plan.filter((p) => p.action === "skip_single").length,
      },
      plan: toCreate.slice(0, 50).map((p) => ({
        puid_root: p.puid_root,
        mother: { id: p.mother.id, name: p.mother.name, sku: p.mother.sku },
        children_count: p.children.length,
        children_sample: p.children.slice(0, 5).map((c) => ({ id: c.id, name: c.name, sku: c.sku })),
      })),
    });
  }

  // Apply: create families
  const result = {
    dry_run: false,
    scope,
    created_families: 0,
    updated_members: 0,
    errors: [] as string[],
  };

  for (const entry of toCreate) {
    const { mother, children, puid_root } = entry;

    // Create family
    const familySlug = `family-${puid_root.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}-${Date.now().toString(36)}`;
    const { data: newFamily, error: familyError } = await client
      .from("product_families")
      .insert({
        name: mother.name,
        slug: familySlug,
        parent_product_id: mother.id,
        strategy: "puid_root",
        active: true,
        source: "puid_auto",
      })
      .select("id")
      .single();

    if (familyError || !newFamily) {
      result.errors.push(`family:${puid_root}:${familyError?.message ?? "no data"}`);
      continue;
    }

    result.created_families += 1;
    const familyId = String(newFamily.id);

    // Update mother product
    await client
      .from("products")
      .update({ family_role: "parent", parent_family_id: familyId })
      .eq("id", mother.id);

    // Add members
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      const { error: memberError } = await client.from("product_family_members").insert({
        family_id: familyId,
        member_type: "product",
        member_product_id: child.id,
        position: (i + 1) * 10,
        active: true,
        axes_summary: child.puid ?? child.sku ?? null,
      });

      if (memberError) {
        result.errors.push(`member:${child.id}:${memberError.message}`);
        continue;
      }

      // Update child product
      await client
        .from("products")
        .update({ family_role: "child", parent_family_id: familyId })
        .eq("id", child.id);

      result.updated_members += 1;
    }
  }

  return NextResponse.json(result);
}
