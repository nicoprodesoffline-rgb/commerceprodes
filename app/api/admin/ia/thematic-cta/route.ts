import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "lib/supabase/client";
import { checkAdminAuth } from "lib/admin/auth";
import {
  estimateCostFromTokens,
  getIaControlConfig,
  recordIaUsage,
  renderPromptTemplate,
} from "lib/admin/ia-control";
import { sanitizeString } from "lib/validation";

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

function extractResponseText(content: any[]): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text")
    .map((block) => String(block.text ?? ""))
    .join("\n")
    .trim();
}

function extractUsage(payload: any): { inputTokens: number; outputTokens: number } {
  const usage = payload?.usage ?? {};
  return {
    inputTokens: Number(usage.input_tokens ?? usage.inputTokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? usage.outputTokens ?? 0),
  };
}

async function callAnthropic(theme: string, model: string, promptTemplate: string): Promise<{
  result: AiResponse;
  inputTokens: number;
  outputTokens: number;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      result: {
        title: `Collection ${theme}`,
        intro: `Retrouvez nos produits sélectionnés pour le thème "${theme}".`,
        items: [
          { keywords: theme, label: theme, pitch: `Produits adaptés pour ${theme}` },
        ],
      },
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const prompt = renderPromptTemplate(promptTemplate, { theme });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system:
        "Tu es expert équipements collectivités françaises (mobilier urbain, signalisation, jeux, sécurité voirie, affichage, hygiène publique, sport).",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
  const data = await res.json();
  const text = extractResponseText(data.content);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in response");

  const usage = extractUsage(data);
  return {
    result: JSON.parse(jsonMatch[0]) as AiResponse,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const theme = sanitizeString(body.theme, 100);
  if (!theme) {
    return NextResponse.json({ error: "Thème invalide" }, { status: 400 });
  }

  const config = await getIaControlConfig();
  const model = sanitizeString(body.model, 120) || config.defaultModel;

  let aiResult: AiResponse;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const ai = await callAnthropic(theme, model, config.prompts.thematicCta);
    aiResult = ai.result;
    inputTokens = ai.inputTokens;
    outputTokens = ai.outputTokens;
  } catch (err) {
    return NextResponse.json({ error: `IA error: ${String(err)}` }, { status: 500 });
  }

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

  const estimated = estimateCostFromTokens({
    config,
    model,
    inputTokens,
    outputTokens,
  });

  if (process.env.ANTHROPIC_API_KEY) {
    await recordIaUsage({
      action: "thematic_cta",
      model,
      inputTokens,
      outputTokens,
      totalUsd: estimated.totalUsd,
      totalEur: estimated.totalEur,
      itemCount: 1,
      metadata: {
        theme,
        products: collectedProducts.length,
      },
    });
  }

  return NextResponse.json({
    title: aiResult.title,
    intro: aiResult.intro,
    products: collectedProducts.slice(0, 8),
    items: aiResult.items,
    model,
    usage: estimated,
  });
}
