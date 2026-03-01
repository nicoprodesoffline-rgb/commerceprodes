import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { sanitizeString, sanitizeNumber } from "lib/validation";
import { log } from "lib/logger";

const IA_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

function buildPrompt(name: string, categoryName: string, sku: string | null): string {
  return `Tu es un expert en équipements pour collectivités.
Écris une description commerciale courte (2-3 phrases, max 150 mots) pour ce produit : ${name}.
Catégorie : ${categoryName}.
SKU : ${sku ?? "—"}.
La description doit être factuelle, professionnelle, au ton B2B.
Ne pas inventer de caractéristiques techniques.
Pas d'intro générique (pas de "Ce produit est..." ni "Nous vous présentons...").
Réponds uniquement avec la description, sans guillemets ni introduction.`;
}

/**
 * GET /api/admin/ia/generate-descriptions
 *   ?mode=list  (auth admin) → { ia_available, model, count, products[] }
 *   (no mode)                → { ia_available, model, reason }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode");

  if (mode === "list") {
    if (!checkAdminAuth(req)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    try {
      const { supabaseServer } = await import("lib/supabase/client");
      const client = supabaseServer();
      const { data, count, error } = await client
        .from("products")
        .select("id, name, sku, short_description, status", { count: "exact" })
        .eq("status", "publish")
        .or("short_description.is.null,short_description.eq.")
        .order("name")
        .limit(50);

      if (error) throw error;

      return NextResponse.json({
        ia_available: Boolean(process.env.ANTHROPIC_API_KEY),
        model: IA_MODEL,
        count: count ?? (data?.length ?? 0),
        products: (data ?? []).map((p: any) => ({
          id: p.id,
          name: p.name,
          sku: p.sku ?? null,
          short_description: p.short_description ?? null,
        })),
      });
    } catch (err) {
      console.error("ia.generate_descriptions GET list error", err);
      return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
    }
  }

  // Default: config status (no auth needed)
  return NextResponse.json({
    ia_available: Boolean(process.env.ANTHROPIC_API_KEY),
    model: IA_MODEL,
    reason: process.env.ANTHROPIC_API_KEY ? null : "ANTHROPIC_API_KEY non configurée",
  });
}

/**
 * POST /api/admin/ia/generate-descriptions
 *   { productId, preview: true }  → génère description, PAS de sauvegarde DB
 *   { productId, confirm: true }  → génère description ET UPDATE DB explicite
 *   { categorySlug?, limit? }     → mode batch (backward-compatible, sauvegarde toujours)
 */
export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const productId = data.productId ? sanitizeString(String(data.productId), 36) : null;
  const preview = data.preview === true;
  const confirm = data.confirm === true;
  const categorySlug = sanitizeString(String(data.categorySlug ?? ""), 100);
  const limit = sanitizeNumber(Number(data.limit ?? 5), 1, 20);

  // Single-product: exiger preview XOR confirm explicitement
  if (productId && !preview && !confirm) {
    return NextResponse.json(
      { error: "Pour un produit unique, précisez preview:true ou confirm:true" },
      { status: 400 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ia_available: false,
      model: IA_MODEL,
      reason:
        "ANTHROPIC_API_KEY non configurée — ajoutez-la dans .env.local ou les variables d'environnement Vercel",
      generated: 0,
      errors: [],
      products: [],
    });
  }

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();
    const { Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey });

    // ── Mode single-product (preview ou confirm) ──────────────────────────────
    if (productId) {
      const { data: single, error } = await client
        .from("products")
        .select("id, name, sku, short_description, product_categories(categories(name))")
        .eq("id", productId)
        .single();

      if (error || !single) {
        return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
      }

      const categoryName =
        (single as any).product_categories?.[0]?.categories?.name ?? "équipement collectivité";

      const message = await anthropic.messages.create({
        model: IA_MODEL,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: buildPrompt(single.name, categoryName, (single as any).sku ?? null),
          },
        ],
      });

      const description =
        (message.content[0] as { type: string; text: string }).text?.trim() ?? "";

      if (preview) {
        // Preview only — aucune écriture DB
        log("info", "admin.ia.preview_description", { productId, model: IA_MODEL });
        return NextResponse.json({
          ia_available: true,
          model: IA_MODEL,
          mode: "preview",
          saved: false,
          product: {
            id: single.id,
            name: single.name,
            description_before: (single as any).short_description ?? null,
            description_generated: description,
          },
        });
      }

      // confirm:true — UPDATE DB explicite
      const { error: updateError } = await client
        .from("products")
        .update({ short_description: description })
        .eq("id", productId);

      if (updateError) throw updateError;

      log("info", "admin.ia.confirm_description", { productId, model: IA_MODEL });
      return NextResponse.json({
        ia_available: true,
        model: IA_MODEL,
        mode: "confirm",
        saved: true,
        product: {
          id: single.id,
          name: single.name,
          description,
        },
      });
    }

    // ── Mode batch (backward-compatible) ──────────────────────────────────────
    let products: any[] | null = null;
    let categoryId: string | null = null;

    if (categorySlug) {
      const { data: cat } = await client
        .from("categories")
        .select("id")
        .eq("slug", categorySlug)
        .single();
      if (cat) categoryId = cat.id;
    }

    let query = client
      .from("products")
      .select("id, name, sku, product_categories(categories(name))")
      .eq("status", "publish")
      .or("short_description.is.null,short_description.eq.")
      .limit(limit);

    if (categoryId) {
      const { data: catProducts } = await client
        .from("product_categories")
        .select("product_id")
        .eq("category_id", categoryId);
      const ids = (catProducts || []).map((cp: any) => cp.product_id);
      if (ids.length > 0) {
        query = query.in("id", ids);
      }
    }

    const { data: batchProducts } = await query;
    products = batchProducts;

    if (!products || products.length === 0) {
      return NextResponse.json({
        ia_available: true,
        model: IA_MODEL,
        mode: "batch",
        generated: 0,
        errors: [],
        products: [],
      });
    }

    const generated: Array<{ id: string; name: string; description: string }> = [];
    const errors: string[] = [];

    for (const product of products) {
      try {
        const categoryName =
          (product as any).product_categories?.[0]?.categories?.name ?? "équipement collectivité";

        const message = await anthropic.messages.create({
          model: IA_MODEL,
          max_tokens: 300,
          messages: [
            {
              role: "user",
              content: buildPrompt(product.name, categoryName, product.sku ?? null),
            },
          ],
        });

        const description =
          (message.content[0] as { type: string; text: string }).text?.trim() ?? "";

        if (description) {
          await client
            .from("products")
            .update({ short_description: description })
            .eq("id", product.id);

          generated.push({ id: product.id, name: product.name, description });
        }
      } catch (err) {
        errors.push(`${product.name}: ${String(err)}`);
      }
    }

    log("info", "admin.ia.generate_descriptions", {
      category: categorySlug,
      model: IA_MODEL,
      requested: limit,
      generated: generated.length,
      errors: errors.length,
    });

    return NextResponse.json({
      ia_available: true,
      model: IA_MODEL,
      mode: "batch",
      generated: generated.length,
      errors,
      products: generated,
    });
  } catch (err) {
    console.error("ia.generate_descriptions error", err);
    return NextResponse.json({ error: "Erreur génération" }, { status: 500 });
  }
}
