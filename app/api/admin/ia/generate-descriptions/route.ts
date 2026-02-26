import { NextRequest, NextResponse } from "next/server";
import { sanitizeString, sanitizeNumber } from "lib/validation";
import { log } from "lib/logger";

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  return token === (process.env.ADMIN_PASSWORD ?? "");
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const categorySlug = sanitizeString(String(data.categorySlug ?? ""), 100);
  const limit = sanitizeNumber(Number(data.limit ?? 5), 1, 20);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurée" }, { status: 500 });
  }

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    // Fetch category id
    let categoryId: string | null = null;
    if (categorySlug) {
      const { data: cat } = await client
        .from("categories")
        .select("id")
        .eq("slug", categorySlug)
        .single();
      if (cat) categoryId = cat.id;
    }

    // Fetch products with missing descriptions
    let query = client
      .from("products")
      .select("id, name, sku, product_categories(categories(name))")
      .eq("status", "publish")
      .or("short_description.is.null,short_description.eq.")
      .limit(limit);

    if (categoryId) {
      // Get product IDs in category
      const { data: catProducts } = await client
        .from("product_categories")
        .select("product_id")
        .eq("category_id", categoryId);
      const ids = (catProducts || []).map((cp: any) => cp.product_id);
      if (ids.length > 0) {
        query = query.in("id", ids);
      }
    }

    const { data: products } = await query;
    if (!products || products.length === 0) {
      return NextResponse.json({ generated: 0, errors: [], products: [] });
    }

    const { Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey });

    const generated: Array<{ id: string; title: string; description: string }> = [];
    const errors: string[] = [];

    for (const product of products) {
      try {
        const categoryName =
          (product as any).product_categories?.[0]?.categories?.name ?? "équipement collectivité";

        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 300,
          messages: [
            {
              role: "user",
              content: `Tu es un expert en équipements pour collectivités.
Écris une description commerciale courte (2-3 phrases, max 150 mots) pour ce produit : ${product.name}.
Catégorie : ${categoryName}.
SKU : ${product.sku ?? "—"}.
La description doit être factuelle, professionnelle, au ton B2B.
Ne pas inventer de caractéristiques techniques.
Pas d'intro générique (pas de "Ce produit est..." ni "Nous vous présentons...").
Réponds uniquement avec la description, sans guillemets ni introduction.`,
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

          generated.push({ id: product.id, title: product.name, description });
        }
      } catch (err) {
        errors.push(`${product.name}: ${String(err)}`);
      }
    }

    log("info", "admin.ia.generate_descriptions", {
      category: categorySlug,
      requested: limit,
      generated: generated.length,
      errors: errors.length,
    });

    return NextResponse.json({ generated: generated.length, errors, products: generated });
  } catch (err) {
    console.error("ia.generate_descriptions error", err);
    return NextResponse.json({ error: "Erreur génération" }, { status: 500 });
  }
}
