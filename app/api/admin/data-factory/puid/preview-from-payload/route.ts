/**
 * POST /api/admin/data-factory/puid/preview-from-payload
 *
 * Pure-function variant of /api/admin/data-factory/puid (which loads from
 * Supabase). Takes a `PuidPlanInput` directly in the request body, runs
 * `buildPuidPlan()` over it, and returns the resulting `PuidPlan`.
 *
 * Designed for the retab extraction dashboard to score PUID suggestions
 * before any Supabase import: the dashboard backend builds the
 * PuidPlanInput from `finalizer/expanded.json` and the active family
 * axes_prix/axes_style declarations, then POSTs here.
 *
 * No DB side effects, no writes — strictly read-only & idempotent.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { safeErrorMessage } from "lib/admin/security";
import {
  buildPuidPlan,
  type PuidPlanInput,
  type PuidProductRow,
  type PuidVariantRow,
} from "lib/admin/puid";

interface IncomingPayload {
  products?: unknown;
  variants?: unknown;
  rules?: unknown;
  includeOnlyPublished?: unknown;
}

function asString(value: unknown): string {
  return value == null ? "" : String(value);
}

function asStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value);
  return s.length > 0 ? s : null;
}

function asNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return fallback;
}

function normaliseProducts(raw: unknown): PuidProductRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row: any): PuidProductRow => ({
    id: asString(row.id),
    name: asString(row.name),
    sku: asStringOrNull(row.sku),
    parent_sku: asStringOrNull(row.parent_sku),
    supplier_code: asStringOrNull(row.supplier_code),
    supplier_ref: asStringOrNull(row.supplier_ref),
    family_role: asStringOrNull(row.family_role),
    parent_family_id: asStringOrNull(row.parent_family_id),
    regular_price: asNumberOrNull(row.regular_price),
    status: asStringOrNull(row.status),
    updated_at: asStringOrNull(row.updated_at),
  })).filter((p) => p.id);
}

function normaliseVariants(raw: unknown): PuidVariantRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row: any): PuidVariantRow => ({
    id: asString(row.id),
    product_id: asString(row.product_id),
    sku: asStringOrNull(row.sku),
    name: asString(row.name),
    regular_price: asNumberOrNull(row.regular_price),
    status: asStringOrNull(row.status),
    attrs: Array.isArray(row.attrs)
      ? row.attrs.map((a: any) => ({
          attribute_id: asString(a.attribute_id),
          attribute_slug: asStringOrNull(a.attribute_slug),
          attribute_name: asStringOrNull(a.attribute_name),
          term_slug: asString(a.term_slug),
          term_name: asStringOrNull(a.term_name),
        }))
      : [],
  })).filter((v) => v.id && v.product_id);
}

function normaliseRules(raw: unknown): PuidPlanInput["rules"] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row: any) => ({
    product_id: asStringOrNull(row.product_id),
    family_id: asStringOrNull(row.family_id),
    attribute_id: asString(row.attribute_id),
    impacts_price: asBool(row.impacts_price, false),
    active: asBool(row.active, true),
  })).filter((r) => r.attribute_id);
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: IncomingPayload;
  try {
    body = (await req.json()) as IncomingPayload;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const products = normaliseProducts(body.products);
  const variants = normaliseVariants(body.variants);
  const rules = normaliseRules(body.rules);

  if (products.length === 0) {
    return NextResponse.json(
      { error: "Aucun product valide dans le payload (products[] vide ou mal formé)" },
      { status: 422 },
    );
  }

  try {
    const plan = buildPuidPlan({
      products,
      variants,
      rules,
      includeOnlyPublished: asBool(body.includeOnlyPublished, false),
    });

    return NextResponse.json({
      source: "payload",
      input_summary: {
        products: products.length,
        variants: variants.length,
        rules: rules.length,
      },
      plan,
    });
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Erreur PUID") },
      { status: 500 },
    );
  }
}
