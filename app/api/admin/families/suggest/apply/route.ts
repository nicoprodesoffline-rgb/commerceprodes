/**
 * POST /api/admin/families/suggest/apply
 * Apply a batch of candidate suggestions by delegating to assemble API logic.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkFamiliesDb, degradedResponse } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

async function createDedicatedMother(
  client: ReturnType<typeof supabaseServer>,
  name: string,
  childIds: string[],
) {
  const { data: children } = await client
    .from("products")
    .select("id, name, sku")
    .in("id", childIds);

  const childNames = (children || []).map((c: any) => String(c.name || "")).filter(Boolean);
  const childSkus = (children || []).map((c: any) => String(c.sku || "")).filter(Boolean);
  const short = `Gamme disponible en plusieurs déclinaisons: ${childNames.slice(0, 6).join(", ")}.`;
  const desc = [
    "Produit modèle regroupant plusieurs déclinaisons.",
    "",
    "Déclinaisons:",
    ...childNames.slice(0, 20).map((n: string) => `- ${n}`),
    "",
    "Références:",
    childSkus.slice(0, 30).join(", "),
  ].join("\n");

  const { data: created, error } = await client
    .from("products")
    .insert({
      name,
      slug: `${slugify(name || "produit-modele")}-${Date.now()}`,
      status: "publish",
      type: "variable",
      sku: null,
      regular_price: null,
      sale_price: null,
      short_description: short.slice(0, 4000),
      description: desc.slice(0, 100000),
      stock_status: "instock",
      manage_stock: false,
      family_role: "parent",
      parent_family_id: null,
    })
    .select("id")
    .single();

  if (error || !created?.id) return null;
  return created.id as string;
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const db = await checkFamiliesDb();
  if (!db.available) return NextResponse.json(degradedResponse(db), { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const candidateIds = Array.isArray(body.candidate_ids)
    ? (body.candidate_ids as unknown[]).filter(
        (x): x is string => typeof x === "string" && UUID_RE.test(x),
      )
    : [];

  if (candidateIds.length === 0) {
    return NextResponse.json({ error: "candidate_ids requis" }, { status: 400 });
  }

  const createParentProduct = body.create_parent_product === true;
  const client = supabaseServer();

  const { data: candidates } = await client
    .from("product_family_candidates")
    .select("*")
    .in("id", candidateIds)
    .eq("status", "pending");

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ error: "Aucun candidat en attente trouvé" }, { status: 404 });
  }

  const byParent: Record<string, string[]> = {};
  for (const c of candidates) {
    const pid = c.suggested_parent_id as string;
    if (!byParent[pid]) byParent[pid] = [];
    if (c.suggested_child_id) byParent[pid].push(c.suggested_child_id as string);
  }

  const created: string[] = [];
  for (const [suggestedParentId, childIdsRaw] of Object.entries(byParent)) {
    const childIds = [...new Set(childIdsRaw.filter((id) => UUID_RE.test(id)))];
    const { data: suggestedParent } = await client
      .from("products")
      .select("id, name")
      .eq("id", suggestedParentId)
      .single();
    if (!suggestedParent) continue;

    const effectiveChildren = createParentProduct
      ? [...new Set([suggestedParentId, ...childIds])]
      : childIds;

    let parentProductId = suggestedParentId;
    if (createParentProduct) {
      const dedicatedId = await createDedicatedMother(
        client,
        String(suggestedParent.name || "Produit modèle"),
        effectiveChildren,
      );
      if (!dedicatedId) continue;
      parentProductId = dedicatedId;
    }

    const { data: fam } = await client
      .from("product_families")
      .insert({
        parent_product_id: parentProductId,
        name: suggestedParent.name,
        slug: `${slugify(String(suggestedParent.name || "famille"))}-${Date.now()}`,
        strategy: "parent_sku",
        active: true,
        published_at: new Date().toISOString(),
        meta: { parent_mode: createParentProduct ? "dedicated" : "existing" },
      })
      .select("id")
      .single();

    if (!fam?.id) continue;

    const members = effectiveChildren.map((cid, i) => ({
      family_id: fam.id,
      member_product_id: cid,
      member_type: "product",
      position: i,
      active: true,
    }));

    await client.from("product_family_members").insert(members as never);

    await client
      .from("products")
      .update({ family_role: "child", parent_family_id: fam.id })
      .in("id", effectiveChildren);

    await client
      .from("products")
      .update({ family_role: "parent", parent_family_id: null })
      .eq("id", parentProductId);

    created.push(fam.id as string);
  }

  await client
    .from("product_family_candidates")
    .update({ status: "applied" })
    .in("id", candidateIds);

  console.log(
    JSON.stringify({
      event: "admin.family.suggest.apply",
      families_created: created.length,
      create_parent_product: createParentProduct,
    }),
  );
  return NextResponse.json({
    ok: true,
    families_created: created.length,
    family_ids: created,
  });
}
