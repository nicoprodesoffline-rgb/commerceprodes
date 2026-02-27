import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "lib/supabase/client";
import { timingSafeEqual } from "crypto";

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!token || !expected || token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

interface ThematicItem {
  keywords: string;
  label: string;
  pitch: string;
}

interface AiResponse {
  title: string;
  intro: string;
  items: ThematicItem[];
}

async function callAnthropic(theme: string): Promise<AiResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback without AI
    return {
      title: `Collection ${theme}`,
      intro: `Retrouvez nos produits sélectionnés pour le thème "${theme}".`,
      items: [
        { keywords: theme, label: theme, pitch: `Produits adaptés pour ${theme}` },
      ],
    };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system:
        "Tu es expert équipements collectivités françaises (mobilier urbain, signalisation, jeux, sécurité voirie, affichage, hygiène publique, sport).",
      messages: [
        {
          role: "user",
          content: `Pour le thème "${theme}", sélectionne 6-8 types de produits pertinents pour des collectivités françaises. Pour chaque type : des mots-clés courts pour une recherche ILIKE Supabase. Génère aussi un titre court (≤ 8 mots) et une intro (2 phrases max). Réponds UNIQUEMENT en JSON valide : { "title": "...", "intro": "...", "items": [{ "keywords": "...", "label": "...", "pitch": "..." }] }`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
  const data = await res.json();
  const text = data.content?.[0]?.text ?? "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in response");
  return JSON.parse(jsonMatch[0]) as AiResponse;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { theme } = await req.json();
  if (!theme || typeof theme !== "string" || theme.length > 100) {
    return NextResponse.json({ error: "Thème invalide" }, { status: 400 });
  }

  let aiResult: AiResponse;
  try {
    aiResult = await callAnthropic(theme);
  } catch (err) {
    return NextResponse.json({ error: `IA error: ${String(err)}` }, { status: 500 });
  }

  // Fetch products for each item
  const client = supabaseServer();
  const collectedProducts: Array<{ id: string; handle: string; title: string; image_url: string | null }> = [];

  for (const item of aiResult.items.slice(0, 8)) {
    const { data } = await client
      .from("products")
      .select("id, handle, name, product_images(url, is_featured)")
      .ilike("name", `%${item.keywords}%`)
      .eq("status", "publish")
      .limit(2);

    for (const p of data ?? []) {
      if (!collectedProducts.find((cp) => cp.id === p.id)) {
        const imgs = (p as any).product_images ?? [];
        const featured = imgs.find((i: any) => i.is_featured) ?? imgs[0];
        collectedProducts.push({
          id: p.id,
          handle: p.handle,
          title: p.name,
          image_url: featured?.url ?? null,
        });
      }
    }
  }

  return NextResponse.json({
    title: aiResult.title,
    intro: aiResult.intro,
    products: collectedProducts.slice(0, 8),
    items: aiResult.items,
  });
}
