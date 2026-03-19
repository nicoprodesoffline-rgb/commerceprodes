/**
 * POST /api/admin/families/assemble
 * Assemble products/variants under a parent product (creates or updates a family).
 * Supports dedicated mother creation (`create_parent_product=true`) from selected children.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkFamiliesDb, degradedResponse } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUUID(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

function buildMotherName(provided: string | null, childNames: string[]): string {
  const clean = provided?.trim();
  if (clean) return clean.slice(0, 200);
  if (childNames.length === 0) return `Produit modèle ${new Date().toISOString().slice(0, 10)}`;
  const first = childNames[0] || "";
  const tokens = first.split(/\s+/).filter(Boolean);
  const prefix: string[] = [];
  for (const token of tokens) {
    const ok = childNames.every((name) => name.toLowerCase().includes(token.toLowerCase()));
    if (!ok) break;
    prefix.push(token);
    if (prefix.length >= 4) break;
  }
  if (prefix.length > 0) return prefix.join(" ").slice(0, 200);
  return first.slice(0, 200);
}

function buildMotherShortDescription(childNames: string[]): string {
  const picks = childNames.slice(0, 6);
  const head =
    picks.length > 0
      ? `Gamme disponible en plusieurs déclinaisons: ${picks.join(", ")}.`
      : "Gamme disponible en plusieurs déclinaisons.";
  return `${head} Sélectionnez les options pour accéder à chaque référence.`.slice(0, 4000);
}

function buildMotherDescription(childNames: string[], childSkus: string[]): string {
  const lines: string[] = [];
  lines.push("Produit modèle regroupant plusieurs déclinaisons.");
  if (childNames.length > 0) {
    lines.push("");
    lines.push("Déclinaisons principales:");
    childNames.slice(0, 20).forEach((name) => lines.push(`- ${name}`));
  }
  if (childSkus.length > 0) {
    lines.push("");
    lines.push("Références incluses:");
    lines.push(childSkus.slice(0, 30).join(", "));
  }
  lines.push("");
  lines.push("Le prix dépend des options sélectionnées.");
  return lines.join("\n").slice(0, 100000);
}

async function resolveMemberProductIdsFromVariants(
  variantIds: string[],
): Promise<string[]> {
  if (variantIds.length === 0) return [];
  const client = supabaseServer();
  const { data } = await client
    .from("variants")
    .select("id, product_id")
    .in("id", variantIds);
  return uniq((data || []).map((row: any) => String(row.product_id || "")).filter(Boolean));
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

  const createParentProduct = body.create_parent_product === true;
  const providedParentId = isUUID(body.parent_product_id) ? body.parent_product_id : null;
  const familyIdExisting =
    typeof body.family_id === "string" && UUID_RE.test(body.family_id)
      ? body.family_id
      : null;
  const strategy = typeof body.strategy === "string" ? body.strategy : "manual";
  const requestedFamilyName = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const requestedParentName =
    typeof body.parent_name === "string" ? body.parent_name.trim().slice(0, 200) : "";

  const memberProductIdsRaw = Array.isArray(body.member_product_ids)
    ? (body.member_product_ids as unknown[]).filter(isUUID)
    : [];
  const memberVariantIds = Array.isArray(body.member_variant_ids)
    ? (body.member_variant_ids as unknown[]).filter(isUUID)
    : [];

  let memberProductIds = uniq(memberProductIdsRaw);
  if (createParentProduct && providedParentId && !memberProductIds.includes(providedParentId)) {
    memberProductIds = [providedParentId, ...memberProductIds];
  }
  if (!createParentProduct && providedParentId) {
    memberProductIds = memberProductIds.filter((id) => id !== providedParentId);
  }

  if (!createParentProduct && !providedParentId) {
    return NextResponse.json({ error: "parent_product_id UUID requis" }, { status: 400 });
  }
  if (memberProductIds.length === 0 && memberVariantIds.length === 0) {
    return NextResponse.json({ error: "Au moins un membre requis" }, { status: 400 });
  }

  const client = supabaseServer();
  const conflicts: Array<{ id: string; type: "product" | "variant"; family_name: string }> = [];

  if (memberProductIds.length > 0) {
    const { data: existing } = await client
      .from("product_family_members")
      .select("member_product_id, family_id, product_families(name)")
      .in("member_product_id", memberProductIds)
      .eq("active", true);

    for (const row of existing ?? []) {
      if (!familyIdExisting || row.family_id !== familyIdExisting) {
        const fam = row.product_families as unknown as { name: string } | null;
        conflicts.push({
          id: row.member_product_id as string,
          type: "product",
          family_name: fam?.name ?? "unknown",
        });
      }
    }
  }

  if (memberVariantIds.length > 0) {
    const { data: existing } = await client
      .from("product_family_members")
      .select("member_variant_id, family_id, product_families(name)")
      .in("member_variant_id", memberVariantIds)
      .eq("active", true);

    for (const row of existing ?? []) {
      if (!familyIdExisting || row.family_id !== familyIdExisting) {
        const fam = row.product_families as unknown as { name: string } | null;
        conflicts.push({
          id: row.member_variant_id as string,
          type: "variant",
          family_name: fam?.name ?? "unknown",
        });
      }
    }
  }

  if (conflicts.length > 0) {
    return NextResponse.json({ ok: false, conflicts }, { status: 409 });
  }

  let parentProductId = providedParentId;
  let parentCreated = false;
  if (createParentProduct) {
    const productIdsForTemplate = uniq([
      ...memberProductIds,
      ...(await resolveMemberProductIdsFromVariants(memberVariantIds)),
    ]);
    const { data: childrenProducts } = await client
      .from("products")
      .select("id, name, sku")
      .in("id", productIdsForTemplate);

    const childNames = (childrenProducts || [])
      .map((p: any) => String(p.name || "").trim())
      .filter(Boolean);
    const childSkus = (childrenProducts || [])
      .map((p: any) => String(p.sku || "").trim())
      .filter(Boolean);

    const parentName = buildMotherName(requestedParentName || requestedFamilyName, childNames);
    const slug = `${slugify(parentName || "produit-modele")}-${Date.now()}`;

    const { data: createdParent, error: parentErr } = await client
      .from("products")
      .insert({
        name: parentName,
        slug,
        status: "publish",
        type: "variable",
        sku: null,
        regular_price: null,
        sale_price: null,
        short_description: buildMotherShortDescription(childNames),
        description: buildMotherDescription(childNames, childSkus),
        stock_status: "instock",
        manage_stock: false,
        family_role: "parent",
        parent_family_id: null,
      })
      .select("id")
      .single();

    if (parentErr || !createdParent?.id) {
      return NextResponse.json(
        { error: parentErr?.message ?? "Impossible de créer le produit mère" },
        { status: 500 },
      );
    }
    parentProductId = createdParent.id as string;
    parentCreated = true;
  }

  if (!parentProductId) {
    return NextResponse.json({ error: "Parent introuvable" }, { status: 400 });
  }

  let familyId = familyIdExisting;
  if (!familyId) {
    const familyName = requestedFamilyName || requestedParentName || `Famille ${new Date().toISOString().slice(0, 10)}`;
    const slug = `${slugify(familyName || "famille")}-${Date.now()}`;
    const { data: fam, error: famErr } = await client
      .from("product_families")
      .insert({
        parent_product_id: parentProductId,
        name: familyName,
        slug,
        strategy,
        active: true,
        published_at: new Date().toISOString(),
        meta: { parent_mode: parentCreated ? "dedicated" : "existing" },
      })
      .select("id")
      .single();
    if (famErr || !fam?.id) {
      return NextResponse.json({ error: famErr?.message ?? "Erreur création famille" }, { status: 500 });
    }
    familyId = fam.id as string;
  } else {
    const { error: famUpdateErr } = await client
      .from("product_families")
      .update({
        parent_product_id: parentProductId,
        active: true,
        published_at: new Date().toISOString(),
      })
      .eq("id", familyId);
    if (famUpdateErr) {
      return NextResponse.json({ error: famUpdateErr.message }, { status: 500 });
    }
  }

  for (let i = 0; i < memberProductIds.length; i++) {
    const memberId = memberProductIds[i]!;
    const { data: existing } = await client
      .from("product_family_members")
      .select("id")
      .eq("family_id", familyId)
      .eq("member_product_id", memberId)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await client
        .from("product_family_members")
        .update({ active: true, position: i, member_type: "product" })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      continue;
    }

    const { error } = await client.from("product_family_members").insert({
      family_id: familyId,
      member_product_id: memberId,
      member_type: "product",
      position: i,
      active: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (let i = 0; i < memberVariantIds.length; i++) {
    const memberId = memberVariantIds[i]!;
    const position = memberProductIds.length + i;
    const { data: existing } = await client
      .from("product_family_members")
      .select("id")
      .eq("family_id", familyId)
      .eq("member_variant_id", memberId)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await client
        .from("product_family_members")
        .update({ active: true, position, member_type: "variant" })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      continue;
    }

    const { error } = await client.from("product_family_members").insert({
      family_id: familyId,
      member_variant_id: memberId,
      member_type: "variant",
      position,
      active: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const variantProductIds = await resolveMemberProductIdsFromVariants(memberVariantIds);
  const childProductIds = uniq([...memberProductIds, ...variantProductIds]).filter(
    (id) => id !== parentProductId,
  );

  if (childProductIds.length > 0) {
    const { error: childRoleErr } = await client
      .from("products")
      .update({ family_role: "child", parent_family_id: familyId })
      .in("id", childProductIds);
    if (childRoleErr) return NextResponse.json({ error: childRoleErr.message }, { status: 500 });
  }

  const { error: parentRoleErr } = await client
    .from("products")
    .update({ family_role: "parent", parent_family_id: null })
    .eq("id", parentProductId);
  if (parentRoleErr) return NextResponse.json({ error: parentRoleErr.message }, { status: 500 });

  console.log(
    JSON.stringify({
      event: "admin.family.assemble",
      family_id: familyId,
      parent_product_id: parentProductId,
      parent_created: parentCreated,
      products: memberProductIds.length,
      variants: memberVariantIds.length,
    }),
  );

  return NextResponse.json({
    ok: true,
    family_id: familyId,
    parent_product_id: parentProductId,
    parent_created: parentCreated,
  });
}
