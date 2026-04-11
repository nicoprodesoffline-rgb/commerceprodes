import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkLotPricingDb, degradedResponse } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

async function resolveProductId(idOrSlug: string): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const client = supabaseServer();
  const { data } = await client
    .from("products")
    .select("id")
    .eq("slug", idOrSlug)
    .single();
  return data?.id ?? null;
}

async function loadProfiles(productId: string) {
  const client = supabaseServer();
  const { data: profiles, error: profileError } = await client
    .from("product_pricing_profiles")
    .select(
      "id, product_id, profile_key, label, applies_to, axis, active, position",
    )
    .eq("product_id", productId)
    .order("position", { ascending: true });

  if (profileError) {
    return { error: profileError.message, profiles: [] as any[] };
  }

  const profileIds = (profiles || []).map((p: any) => p.id);
  let offers: any[] = [];
  if (profileIds.length > 0) {
    const { data: offersRaw, error: offersError } = await client
      .from("product_lot_offers")
      .select(
        "id, pricing_profile_id, code, label, paid_units, bonus_units, lot_price_ht, eco_included, active, starts_at, ends_at, position",
      )
      .in("pricing_profile_id", profileIds)
      .order("position", { ascending: true });
    if (offersError)
      return { error: offersError.message, profiles: [] as any[] };
    offers = offersRaw || [];
  }

  const offersByProfile = new Map<string, any[]>();
  for (const offer of offers) {
    const list = offersByProfile.get(offer.pricing_profile_id) ?? [];
    list.push(offer);
    offersByProfile.set(offer.pricing_profile_id, list);
  }

  return {
    error: null,
    profiles: (profiles || []).map((profile: any) => ({
      ...profile,
      offers: offersByProfile.get(profile.id) || [],
    })),
  };
}

function parseSkuPrefix(
  sku: string,
): { prefix: string; root: string; branch: string } | null {
  const clean = String(sku || "").trim();
  if (!clean) return null;
  const beforeDot = clean.split(".")[0]?.trim() || "";
  if (!beforeDot) return null;
  const tokens = beforeDot
    .split("-")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;
  const rootTokens =
    tokens.length >= 3 ? tokens.slice(0, 3) : tokens.slice(0, 1);
  const root = rootTokens.join("-");
  const branch = tokens.slice(rootTokens.length).join("-");
  return {
    prefix: beforeDot,
    root,
    branch,
  };
}

async function loadBranchCandidates(productId: string) {
  const client = supabaseServer();
  const candidates = new Map<
    string,
    {
      prefix: string;
      root: string;
      branch: string;
      sampleSkus: string[];
      count: number;
    }
  >();

  const addSku = (sku: string) => {
    const parsed = parseSkuPrefix(sku);
    if (!parsed) return;
    const key = parsed.prefix;
    const current = candidates.get(key) || {
      prefix: parsed.prefix,
      root: parsed.root,
      branch: parsed.branch,
      sampleSkus: [],
      count: 0,
    };
    current.count += 1;
    if (current.sampleSkus.length < 4 && !current.sampleSkus.includes(sku)) {
      current.sampleSkus.push(sku);
    }
    candidates.set(key, current);
  };

  const { data: parent } = await client
    .from("products")
    .select("id, parent_family_id")
    .eq("id", productId)
    .maybeSingle();

  let familyId: string | null = parent?.parent_family_id ?? null;
  if (!familyId) {
    const { data: familyByParent } = await client
      .from("product_families")
      .select("id")
      .eq("parent_product_id", productId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    familyId = familyByParent?.id ?? null;
  }

  if (familyId) {
    const { data: members } = await client
      .from("product_family_members")
      .select("member_product_id, member_variant_id, active")
      .eq("family_id", familyId)
      .eq("active", true);

    const memberProductIds = (members || [])
      .map((m: any) => m.member_product_id)
      .filter(Boolean) as string[];
    const memberVariantIds = (members || [])
      .map((m: any) => m.member_variant_id)
      .filter(Boolean) as string[];

    if (memberProductIds.length > 0) {
      const { data: products } = await client
        .from("products")
        .select("id, sku")
        .in("id", memberProductIds);
      (products || []).forEach((p: any) => {
        if (p.sku) addSku(String(p.sku));
      });
    }

    if (memberVariantIds.length > 0) {
      const { data: variants } = await client
        .from("variants")
        .select("id, sku")
        .in("id", memberVariantIds);
      (variants || []).forEach((v: any) => {
        if (v.sku) addSku(String(v.sku));
      });
    }
  }

  const { data: ownVariants } = await client
    .from("variants")
    .select("id, sku")
    .eq("product_id", productId)
    .eq("status", "publish");
  (ownVariants || []).forEach((v: any) => {
    if (v.sku) addSku(String(v.sku));
  });

  const { data: ownProduct } = await client
    .from("products")
    .select("id, sku")
    .eq("id", productId)
    .maybeSingle();
  if (ownProduct?.sku) addSku(String(ownProduct.sku));

  return [...candidates.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.prefix.localeCompare(b.prefix);
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const lotDb = await checkLotPricingDb();
  if (!lotDb.available) {
    return NextResponse.json(degradedResponse(lotDb), { status: 503 });
  }

  const { id } = await params;
  const productId = await resolveProductId(id);
  if (!productId) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  const loaded = await loadProfiles(productId);
  if (loaded.error) {
    return NextResponse.json({ error: loaded.error }, { status: 500 });
  }

  const branchCandidates = await loadBranchCandidates(productId);

  return NextResponse.json({
    product_id: productId,
    profiles: loaded.profiles,
    branch_candidates: branchCandidates,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const lotDb = await checkLotPricingDb();
  if (!lotDb.available) {
    return NextResponse.json(degradedResponse(lotDb), { status: 503 });
  }

  const { id } = await params;
  const productId = await resolveProductId(id);
  if (!productId) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const kind = String(body.kind || "");
  const client = supabaseServer();

  if (kind === "profile") {
    const profileKey = String(body.profile_key || "").trim();
    const label = String(body.label || "").trim();
    if (!profileKey || !label) {
      return NextResponse.json(
        { error: "profile_key et label requis" },
        { status: 400 },
      );
    }

    const appliesTo = String(body.applies_to || "variant");
    const axis =
      body.axis && typeof body.axis === "object" && !Array.isArray(body.axis)
        ? body.axis
        : {};

    const { data: inserted, error } = await client
      .from("product_pricing_profiles")
      .insert({
        product_id: productId,
        profile_key: profileKey,
        label,
        applies_to: appliesTo,
        axis,
        active: asBoolean(body.active) ?? true,
        position: asNumber(body.position) ?? 100,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, kind, id: inserted?.id ?? null });
  }

  if (kind === "offer") {
    const pricingProfileId = String(body.pricing_profile_id || "").trim();
    const label = String(body.label || "").trim();
    const paidUnits = asNumber(body.paid_units);
    const lotPrice = asNumber(body.lot_price_ht);

    if (!pricingProfileId || !label || paidUnits == null || lotPrice == null) {
      return NextResponse.json(
        {
          error: "pricing_profile_id, label, paid_units et lot_price_ht requis",
        },
        { status: 400 },
      );
    }

    const { data: profile, error: profileError } = await client
      .from("product_pricing_profiles")
      .select("id, product_id")
      .eq("id", pricingProfileId)
      .single();

    if (profileError || !profile || profile.product_id !== productId) {
      return NextResponse.json(
        { error: "Profil tarifaire invalide pour ce produit" },
        { status: 400 },
      );
    }

    const { data: inserted, error } = await client
      .from("product_lot_offers")
      .insert({
        pricing_profile_id: pricingProfileId,
        code: body.code ? String(body.code) : null,
        label,
        paid_units: Math.max(1, Math.trunc(paidUnits)),
        bonus_units: Math.max(0, Math.trunc(asNumber(body.bonus_units) ?? 0)),
        lot_price_ht: lotPrice,
        eco_included: asBoolean(body.eco_included) ?? true,
        active: asBoolean(body.active) ?? true,
        starts_at: body.starts_at ? String(body.starts_at) : null,
        ends_at: body.ends_at ? String(body.ends_at) : null,
        position: asNumber(body.position) ?? 100,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, kind, id: inserted?.id ?? null });
  }

  return NextResponse.json(
    { error: "kind inconnu (profile|offer)" },
    { status: 400 },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const lotDb = await checkLotPricingDb();
  if (!lotDb.available) {
    return NextResponse.json(degradedResponse(lotDb), { status: 503 });
  }

  const { id } = await params;
  const productId = await resolveProductId(id);
  if (!productId) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const kind = String(body.kind || "");
  const rowId = String(body.id || "").trim();
  if (!rowId) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  const client = supabaseServer();

  if (kind === "profile") {
    const { data: existing, error: existingError } = await client
      .from("product_pricing_profiles")
      .select("id, product_id")
      .eq("id", rowId)
      .single();

    if (existingError || !existing || existing.product_id !== productId) {
      return NextResponse.json(
        { error: "Profil introuvable" },
        { status: 404 },
      );
    }

    const payload: Record<string, unknown> = {};
    if (body.label != null) payload.label = String(body.label);
    if (body.profile_key != null)
      payload.profile_key = String(body.profile_key);
    if (body.applies_to != null) payload.applies_to = String(body.applies_to);
    if (
      body.axis &&
      typeof body.axis === "object" &&
      !Array.isArray(body.axis)
    ) {
      payload.axis = body.axis;
    }
    if (body.active != null) payload.active = asBoolean(body.active);
    if (body.position != null) payload.position = asNumber(body.position);

    const { error } = await client
      .from("product_pricing_profiles")
      .update(payload)
      .eq("id", rowId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, kind, id: rowId });
  }

  if (kind === "offer") {
    const { data: offer, error: offerError } = await client
      .from("product_lot_offers")
      .select("id, pricing_profile_id")
      .eq("id", rowId)
      .single();

    if (offerError || !offer) {
      return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
    }

    const { data: profile, error: profileError } = await client
      .from("product_pricing_profiles")
      .select("id, product_id")
      .eq("id", offer.pricing_profile_id)
      .single();
    if (profileError || !profile || profile.product_id !== productId) {
      return NextResponse.json(
        { error: "Offre hors produit" },
        { status: 400 },
      );
    }

    const payload: Record<string, unknown> = {};
    if (body.code != null) payload.code = body.code ? String(body.code) : null;
    if (body.label != null) payload.label = String(body.label);
    if (body.paid_units != null)
      payload.paid_units = Math.max(
        1,
        Math.trunc(asNumber(body.paid_units) ?? 1),
      );
    if (body.bonus_units != null)
      payload.bonus_units = Math.max(
        0,
        Math.trunc(asNumber(body.bonus_units) ?? 0),
      );
    if (body.lot_price_ht != null)
      payload.lot_price_ht = asNumber(body.lot_price_ht);
    if (body.eco_included != null)
      payload.eco_included = asBoolean(body.eco_included);
    if (body.active != null) payload.active = asBoolean(body.active);
    if (body.starts_at !== undefined)
      payload.starts_at = body.starts_at ? String(body.starts_at) : null;
    if (body.ends_at !== undefined)
      payload.ends_at = body.ends_at ? String(body.ends_at) : null;
    if (body.position != null) payload.position = asNumber(body.position);

    const { error } = await client
      .from("product_lot_offers")
      .update(payload)
      .eq("id", rowId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, kind, id: rowId });
  }

  return NextResponse.json(
    { error: "kind inconnu (profile|offer)" },
    { status: 400 },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const lotDb = await checkLotPricingDb();
  if (!lotDb.available) {
    return NextResponse.json(degradedResponse(lotDb), { status: 503 });
  }

  const { id } = await params;
  const productId = await resolveProductId(id);
  if (!productId) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  const kind = req.nextUrl.searchParams.get("kind") || "";
  const rowId = req.nextUrl.searchParams.get("id") || "";
  if (!rowId) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  const client = supabaseServer();

  if (kind === "profile") {
    const { data: existing, error: existingError } = await client
      .from("product_pricing_profiles")
      .select("id, product_id")
      .eq("id", rowId)
      .single();
    if (existingError || !existing || existing.product_id !== productId) {
      return NextResponse.json(
        { error: "Profil introuvable" },
        { status: 404 },
      );
    }
    const { error } = await client
      .from("product_pricing_profiles")
      .delete()
      .eq("id", rowId);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, kind, id: rowId });
  }

  if (kind === "offer") {
    const { data: offer, error: offerError } = await client
      .from("product_lot_offers")
      .select("id, pricing_profile_id")
      .eq("id", rowId)
      .single();

    if (offerError || !offer) {
      return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
    }

    const { data: profile, error: profileError } = await client
      .from("product_pricing_profiles")
      .select("id, product_id")
      .eq("id", offer.pricing_profile_id)
      .single();
    if (profileError || !profile || profile.product_id !== productId) {
      return NextResponse.json(
        { error: "Offre hors produit" },
        { status: 400 },
      );
    }

    const { error } = await client
      .from("product_lot_offers")
      .delete()
      .eq("id", rowId);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, kind, id: rowId });
  }

  return NextResponse.json(
    { error: "kind inconnu (profile|offer)" },
    { status: 400 },
  );
}
