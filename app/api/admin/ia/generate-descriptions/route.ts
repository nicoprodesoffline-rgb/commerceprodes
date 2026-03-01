import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { sanitizeNumber, sanitizeString } from "lib/validation";
import { log } from "lib/logger";
import {
  estimateCostFromTokens,
  getIaControlConfig,
  recordIaUsage,
  renderPromptTemplate,
} from "lib/admin/ia-control";

const FALLBACK_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

function extractResponseText(content: any[]): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text")
    .map((block) => String(block.text ?? ""))
    .join("\n")
    .trim();
}

function extractUsage(message: any): { inputTokens: number; outputTokens: number } {
  const usage = message?.usage ?? {};
  return {
    inputTokens: Number(usage.input_tokens ?? usage.inputTokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? usage.outputTokens ?? 0),
  };
}

/**
 * GET /api/admin/ia/generate-descriptions
 *   ?mode=list  (auth admin) → { ia_available, model, count, products[] }
 *   (no mode)                → { ia_available, model, reason }
 */
export async function GET(req: NextRequest) {
  const config = await getIaControlConfig();
  const model = config.defaultModel || FALLBACK_MODEL;

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
        model,
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

  return NextResponse.json({
    ia_available: Boolean(process.env.ANTHROPIC_API_KEY),
    model,
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

  const payload = body as Record<string, unknown>;
  const productId = payload.productId ? sanitizeString(String(payload.productId), 36) : null;
  const preview = payload.preview === true;
  const confirm = payload.confirm === true;
  const categorySlug = sanitizeString(String(payload.categorySlug ?? ""), 100);
  const limit = sanitizeNumber(Number(payload.limit ?? 5), 1, 100);

  if (productId && !preview && !confirm) {
    return NextResponse.json(
      { error: "Pour un produit unique, précisez preview:true ou confirm:true" },
      { status: 400 },
    );
  }

  const config = await getIaControlConfig();
  const modelOverride = sanitizeString(String(payload.model ?? ""), 120);
  const model = modelOverride || config.defaultModel || FALLBACK_MODEL;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ia_available: false,
      model,
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

      const prompt = renderPromptTemplate(config.prompts.generateDescriptions, {
        name: String((single as any).name ?? ""),
        category: String(categoryName),
        sku: (single as any).sku ?? "—",
      });

      const message = await anthropic.messages.create({
        model,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      });

      const description = extractResponseText((message as any).content);
      const usage = extractUsage(message);
      const estimated = estimateCostFromTokens({
        config,
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });

      if (preview) {
        log("info", "admin.ia.preview_description", { productId, model });
        await recordIaUsage({
          action: "generate_description_preview",
          model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalUsd: estimated.totalUsd,
          totalEur: estimated.totalEur,
          itemCount: 1,
          metadata: { productId },
        });

        return NextResponse.json({
          ia_available: true,
          model,
          mode: "preview",
          saved: false,
          usage: estimated,
          product: {
            id: single.id,
            name: single.name,
            description_before: (single as any).short_description ?? null,
            description_generated: description,
          },
        });
      }

      const { error: updateError } = await client
        .from("products")
        .update({ short_description: description })
        .eq("id", productId);

      if (updateError) throw updateError;

      log("info", "admin.ia.confirm_description", { productId, model });
      await recordIaUsage({
        action: "generate_description_confirm",
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalUsd: estimated.totalUsd,
        totalEur: estimated.totalEur,
        itemCount: 1,
        metadata: { productId },
      });

      return NextResponse.json({
        ia_available: true,
        model,
        mode: "confirm",
        saved: true,
        usage: estimated,
        product: {
          id: single.id,
          name: single.name,
          description,
        },
      });
    }

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
        model,
        mode: "batch",
        generated: 0,
        errors: [],
        products: [],
      });
    }

    const generated: Array<{ id: string; name: string; description: string }> = [];
    const errors: string[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    for (const product of products) {
      try {
        const categoryName =
          (product as any).product_categories?.[0]?.categories?.name ?? "équipement collectivité";

        const prompt = renderPromptTemplate(config.prompts.generateDescriptions, {
          name: String(product.name ?? ""),
          category: String(categoryName),
          sku: product.sku ?? "—",
        });

        const message = await anthropic.messages.create({
          model,
          max_tokens: 300,
          messages: [{ role: "user", content: prompt }],
        });

        const description = extractResponseText((message as any).content);
        const usage = extractUsage(message);
        inputTokens += usage.inputTokens;
        outputTokens += usage.outputTokens;

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

    const estimated = estimateCostFromTokens({
      config,
      model,
      inputTokens,
      outputTokens,
      calls: products.length,
    });

    await recordIaUsage({
      action: "generate_descriptions_batch",
      model,
      inputTokens,
      outputTokens,
      totalUsd: estimated.totalUsd,
      totalEur: estimated.totalEur,
      itemCount: products.length,
      metadata: {
        category: categorySlug || "all",
        generated: generated.length,
        errors: errors.length,
      },
    });

    log("info", "admin.ia.generate_descriptions", {
      category: categorySlug,
      model,
      requested: limit,
      generated: generated.length,
      errors: errors.length,
      estimated_eur: estimated.totalEur,
    });

    return NextResponse.json({
      ia_available: true,
      model,
      mode: "batch",
      usage: estimated,
      generated: generated.length,
      errors,
      products: generated,
    });
  } catch (err) {
    console.error("ia.generate_descriptions error", err);
    return NextResponse.json({ error: "Erreur génération" }, { status: 500 });
  }
}
