import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { safeErrorMessage } from "lib/admin/security";
import {
  adaptRetabToSupabase,
  type RetabInput,
  type AdapterOutput,
} from "lib/retab/adapter";

// ─── Input validation ───────────────────────────────────────────────────────

function validateRetabInput(body: unknown):
  | {
      ok: true;
      data: RetabInput;
    }
  | {
      ok: false;
      error: string;
    } {
  if (body == null || typeof body !== "object") {
    return {
      ok: false,
      error: "Le corps de la requête doit être un objet JSON",
    };
  }

  const obj = body as Record<string, unknown>;

  // Expanded format: { products: [...], variants: [...] }
  if (Array.isArray(obj.products) && Array.isArray(obj.variants)) {
    if (obj.products.length === 0) {
      return { ok: false, error: "Le tableau 'products' est vide" };
    }

    // Validate first product has required fields
    const first = obj.products[0] as Record<string, unknown>;
    if (!first.ref || !first.nom_gamme) {
      return {
        ok: false,
        error: "Chaque product doit avoir 'ref' et 'nom_gamme'",
      };
    }

    // Validate variants have product_ref
    for (let i = 0; i < Math.min(obj.variants.length, 5); i++) {
      const v = obj.variants[i] as Record<string, unknown>;
      if (!v.product_ref) {
        return {
          ok: false,
          error: `variant[${i}] manque le champ 'product_ref'`,
        };
      }
    }

    return { ok: true, data: body as RetabInput };
  }

  // Raw format: { familles: [...] }
  // Also handles wrapped format: { meta, result: { familles: [...] } }
  const familles = Array.isArray(obj.familles)
    ? obj.familles
    : obj.result &&
        typeof obj.result === "object" &&
        Array.isArray((obj.result as Record<string, unknown>).familles)
      ? ((obj.result as Record<string, unknown>).familles as unknown[])
      : null;

  if (familles) {
    if (familles.length === 0) {
      return { ok: false, error: "Le tableau 'familles' est vide" };
    }

    const first = familles[0] as Record<string, unknown>;
    if (!first.nom_gamme) {
      return {
        ok: false,
        error: "Chaque famille doit avoir 'nom_gamme'",
      };
    }

    if (!Array.isArray(first.lignes)) {
      return {
        ok: false,
        error: "Chaque famille doit avoir un tableau 'lignes'",
      };
    }

    return { ok: true, data: body as RetabInput };
  }

  return {
    ok: false,
    error:
      "Format non reconnu. Attendu: { products, variants } (expanded), { familles } (raw), ou { meta, result: { familles } } (extracted)",
  };
}

// ─── Size limits ────────────────────────────────────────────────────────────

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_PRODUCTS = 500;
const MAX_VARIANTS = 10_000;

function checkLimits(data: RetabInput): string | null {
  const obj = data as Record<string, unknown>;
  if ("products" in obj && Array.isArray(obj.products)) {
    if (obj.products.length > MAX_PRODUCTS) {
      return `Trop de products: ${obj.products.length} (max ${MAX_PRODUCTS})`;
    }
    const variants = obj.variants as unknown[];
    if (variants.length > MAX_VARIANTS) {
      return `Trop de variants: ${variants.length} (max ${MAX_VARIANTS})`;
    }
  } else {
    // Resolve familles from direct or wrapped format
    const familles = (
      Array.isArray(obj.familles)
        ? obj.familles
        : obj.result && typeof obj.result === "object"
          ? (((obj.result as Record<string, unknown>).familles as unknown[]) ??
            [])
          : []
    ) as Array<{ lignes?: unknown[] }>;

    const totalLines = familles.reduce(
      (acc, f) => acc + (f.lignes?.length ?? 0),
      0,
    );
    if (familles.length > MAX_PRODUCTS) {
      return `Trop de familles: ${familles.length} (max ${MAX_PRODUCTS})`;
    }
    if (totalLines > MAX_VARIANTS) {
      return `Trop de lignes: ${totalLines} (max ${MAX_VARIANTS})`;
    }
  }
  return null;
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // Check dry_run parameter (only dry_run supported for now)
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") !== "false";

  if (!dryRun) {
    return NextResponse.json(
      { error: "Seul le mode dry_run=true est supporté actuellement" },
      { status: 400 },
    );
  }

  try {
    // Parse body with size check
    const contentLength = parseInt(
      req.headers.get("content-length") ?? "0",
      10,
    );
    if (contentLength > MAX_BODY_SIZE) {
      return NextResponse.json(
        {
          error: `Corps trop volumineux (max ${MAX_BODY_SIZE / 1024 / 1024} MB)`,
        },
        { status: 413 },
      );
    }

    const body: unknown = await req.json();

    // Validate input format
    const validation = validateRetabInput(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Check size limits
    const limitError = checkLimits(validation.data);
    if (limitError) {
      return NextResponse.json({ error: limitError }, { status: 400 });
    }

    // Run adapter
    const result: AdapterOutput = adaptRetabToSupabase(validation.data);

    return NextResponse.json({
      dry_run: true,
      ...result.summary,
      warnings: result.warnings,
      // Include full data for review in dry_run mode
      families: result.families.map((f) => ({
        name: f.name,
        slug: f.slug,
        supplier_code: f.supplier_code,
        category: f.category,
      })),
      products: result.products.map((p) => ({
        sku: p.sku,
        name: p.name,
        type: p.type,
        supplier_code: p.supplier_code,
        regular_price: p.regular_price,
        axes_prix: p.axes_prix,
        axes_style: p.axes_style,
        family_role: p.family_role,
      })),
      variants_sample: result.variants.slice(0, 20).map((v) => ({
        sku: v.sku,
        name: v.name,
        regular_price: v.regular_price,
        attributs_prix: v.attributs_prix,
        _price_branch: v._price_branch,
        _style_branch: v._style_branch,
        need_check: v.need_check,
      })),
      pricing_profiles: result.pricing_profiles.map((pp) => ({
        profile_key: pp.profile_key,
        label: pp.label,
        price_branch: pp.price_branch,
        base_price_ht: pp.base_price_ht,
      })),
      lot_offers: result.lot_offers.map((lo) => ({
        mode: lo.mode,
        label: lo.label,
        min_quantity: lo.min_quantity,
        unit_price_ht: lo.unit_price_ht,
        paid_units: lo.paid_units,
        lot_price_ht: lo.lot_price_ht,
      })),
      attribute_registry: result.attribute_registry,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: safeErrorMessage(
          err,
          "Erreur lors du traitement de l'ingestion",
        ),
      },
      { status: 500 },
    );
  }
}
