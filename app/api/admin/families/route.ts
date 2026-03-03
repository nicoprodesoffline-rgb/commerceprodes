import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkFamiliesDb, degradedResponse } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseBranchFromSku(rawSku: string): {
  root: string;
  priceBranch: string;
  styleBranch: string | null;
  fullPrefix: string;
} | null {
  const sku = String(rawSku || "").trim().toUpperCase();
  if (!sku) return null;
  const [beforeDotRaw, ...afterDot] = sku.split(".");
  const beforeDot = (beforeDotRaw || "").trim();
  if (!beforeDot) return null;

  const tokens = beforeDot
    .split("-")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  // Default root: first 3 tokens (ex: P-GMC-MARCA). Fallbacks for shorter SKUs.
  const rootTokens = tokens.length >= 3 ? tokens.slice(0, 3) : tokens.slice(0, 1);
  const root = rootTokens.join("-");
  const priceTokens = tokens.slice(rootTokens.length);
  const priceBranch = priceTokens.length > 0 ? priceTokens.join("-") : "BASE";
  const styleBranch = afterDot.length > 0 ? afterDot.join(".").trim() || null : null;

  return {
    root,
    priceBranch,
    styleBranch,
    fullPrefix: beforeDot,
  };
}

function buildFamilyBranchSummary(family: any) {
  const members = ((family as any).product_family_members || []) as any[];
  const roots = new Map<
    string,
    Map<string, { count: number; styles: Set<string>; samples: string[] }>
  >();
  let totalSkus = 0;

  for (const member of members) {
    if (!member?.active) continue;
    const sku = member?.products?.sku || member?.variants?.sku;
    if (!sku) continue;
    const parsed = parseBranchFromSku(String(sku));
    if (!parsed) continue;
    totalSkus += 1;

    const rootMap = roots.get(parsed.root) || new Map();
    const branchNode = rootMap.get(parsed.priceBranch) || {
      count: 0,
      styles: new Set<string>(),
      samples: [],
    };
    branchNode.count += 1;
    if (parsed.styleBranch) branchNode.styles.add(parsed.styleBranch);
    if (branchNode.samples.length < 4) branchNode.samples.push(String(sku));
    rootMap.set(parsed.priceBranch, branchNode);
    roots.set(parsed.root, rootMap);
  }

  return {
    total_skus: totalSkus,
    roots: [...roots.entries()].map(([root, branches]) => ({
      root,
      branches: [...branches.entries()]
        .map(([price_branch, node]) => ({
          price_branch,
          count: node.count,
          style_examples: [...node.styles].slice(0, 6),
          samples: node.samples,
        }))
        .sort((a, b) => b.count - a.count),
    })),
  };
}

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const db = await checkFamiliesDb();
  if (!db.available) return NextResponse.json(degradedResponse(db), { status: 503 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50"));
  const search = url.searchParams.get("q")?.trim().slice(0, 200) ?? "";
  const activeOnly = url.searchParams.get("active") !== "false";
  const includeNative = url.searchParams.get("includeNative") !== "false";
  const scope = url.searchParams.get("scope");
  const parentProductId = url.searchParams.get("parentProductId")?.trim() ?? "";
  const hasParentFilter = UUID_RE.test(parentProductId);
  const importScope = scope === "latest_import" || scope === "latest" ? "latest_import" : "all";

  const client = supabaseServer();
  let sinceIso: string | null = null;
  if (importScope === "latest_import") {
    const latestImport = await client
      .from("import_logs")
      .select("created_at")
      .in("status", ["pending", "processing", "done"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latestImport.error && latestImport.data?.created_at) {
      sinceIso = String(latestImport.data.created_at);
    }
  }

  let query = client
    .from("product_families")
    .select(`
      id, name, slug, strategy, active, published_at, created_at, updated_at,
      parent_product_id,
      products!product_families_parent_product_id_fkey (id, name, slug, sku, status, updated_at),
      product_family_members (
        id, member_product_id, member_variant_id, member_type, position, active, axes_summary,
        products!product_family_members_member_product_id_fkey (id, name, slug, sku, status),
        variants!product_family_members_member_variant_id_fkey (id, name, sku, stock_status, regular_price)
      )
    `)
    .order("created_at", { ascending: false });

  if (activeOnly) query = query.eq("active", true);
  if (search) query = query.ilike("name", `%${search}%`);
  if (hasParentFilter) query = query.eq("parent_product_id", parentProductId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const families: any[] = [...((data ?? []) as any[])].filter((family) => {
    if (!sinceIso) return true;
    const productUpdatedAt = (family as any).products?.updated_at;
    if (!productUpdatedAt) return false;
    return Date.parse(String(productUpdatedAt)) >= Date.parse(sinceIso);
  });

  // Native families = each product with variants but without explicit family row.
  if (includeNative) {
    const existingParentIds = new Set(
      families
        .map((family: any) => family.parent_product_id)
        .filter((id: string | null) => Boolean(id)),
    );

    let nativeProductsQuery = client
      .from("products")
      .select(`
        id, name, slug, sku, status, updated_at,
        variants(id, name, sku, stock_status, regular_price, position)
      `)
      .eq("status", "publish");

    if (search) {
      nativeProductsQuery = nativeProductsQuery.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }
    if (hasParentFilter) {
      nativeProductsQuery = nativeProductsQuery.eq("id", parentProductId);
    }
    if (sinceIso) {
      nativeProductsQuery = nativeProductsQuery.gte("updated_at", sinceIso);
    }

    const { data: nativeProducts, error: nativeError } = await nativeProductsQuery.limit(5000);
    if (!nativeError) {
      for (const product of nativeProducts ?? []) {
        const variants = ((product as any).variants ?? [])
          .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
        if (variants.length === 0) continue;
        if (existingParentIds.has((product as any).id)) continue;

        families.push({
          id: `native-${(product as any).id}`,
          name: (product as any).name,
          slug: (product as any).slug,
          strategy: "native_variants",
          active: true,
          published_at: null,
          created_at: null,
          updated_at: null,
          parent_product_id: (product as any).id,
          products: {
            id: (product as any).id,
            name: (product as any).name,
            slug: (product as any).slug,
            sku: (product as any).sku,
            status: (product as any).status,
          },
          product_family_members: variants.map((variant: any, index: number) => ({
            id: `native-${(product as any).id}-${variant.id}`,
            member_product_id: null,
            member_variant_id: variant.id,
            member_type: "variant",
            position: index,
            active: true,
            axes_summary: null,
            products: null,
            variants: {
              id: variant.id,
              name: variant.name,
              sku: variant.sku,
              stock_status: variant.stock_status,
              regular_price: variant.regular_price,
            },
          })),
        });
      }
    }
  }

  const sortedFamilies = families.sort((a: any, b: any) => {
    const aDate = a.created_at ? Date.parse(a.created_at) : 0;
    const bDate = b.created_at ? Date.parse(b.created_at) : 0;
    return bDate - aDate;
  });

  const total = sortedFamilies.length;
  const paged = sortedFamilies.slice((page - 1) * limit, page * limit).map((family: any) => ({
    ...family,
    branch_summary: buildFamilyBranchSummary(family),
  }));

  return NextResponse.json({
    families: paged,
    total,
    page,
    limit,
    scope: {
      mode: importScope,
      since: sinceIso,
    },
  });
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const db = await checkFamiliesDb();
  if (!db.available) return NextResponse.json(degradedResponse(db), { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const parent_product_id = body.parent_product_id;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const strategy = typeof body.strategy === "string" ? body.strategy : "manual";

  if (!parent_product_id || typeof parent_product_id !== "string" || !UUID_RE.test(parent_product_id)) {
    return NextResponse.json({ error: "parent_product_id UUID requis" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "name requis" }, { status: 400 });

  const validStrategies = ["parent_sku", "sku_root", "title_root", "manual"];
  if (!validStrategies.includes(strategy)) {
    return NextResponse.json({ error: "strategy invalide" }, { status: 400 });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now();
  const client = supabaseServer();

  const { data, error } = await client
    .from("product_families")
    .insert({ parent_product_id, name, slug, strategy, active: true, published_at: new Date().toISOString() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log(JSON.stringify({ event: "admin.family.create", id: data.id, name }));
  return NextResponse.json({ family: data }, { status: 201 });
}
