import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import {
  ALL_IA_ACTIONS,
  appendPromptHistory,
  buildPricingCatalog,
  getIaControlConfig,
  getIaUsageSummary,
  saveIaControlConfig,
  type IaAction,
  type IaControlConfig,
} from "lib/admin/ia-control";

function safeTrim(value: unknown, max = 2000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function safePositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function sanitizePatch(body: Record<string, unknown>, current: IaControlConfig): Partial<IaControlConfig> {
  const next: Partial<IaControlConfig> = {};

  if (body.defaultModel != null) {
    next.defaultModel = safeTrim(body.defaultModel, 120) || current.defaultModel;
  }

  if (body.usdToEurRate != null) {
    next.usdToEurRate = safePositiveNumber(body.usdToEurRate, current.usdToEurRate);
  }

  if (body.prompts && typeof body.prompts === "object") {
    const raw = body.prompts as Record<string, unknown>;
    next.prompts = {
      generateDescriptions:
        safeTrim(raw.generateDescriptions, 6000) || current.prompts.generateDescriptions,
      thematicCta: safeTrim(raw.thematicCta, 6000) || current.prompts.thematicCta,
    };
  }

  // Per-action model overrides
  if (body.modelOverrides && typeof body.modelOverrides === "object") {
    const raw = body.modelOverrides as Record<string, unknown>;
    const overrides: Partial<Record<IaAction, string>> = {};
    for (const action of ALL_IA_ACTIONS) {
      const val = raw[action];
      if (typeof val === "string") {
        overrides[action] = val.trim() || "";
      } else {
        // Preserve existing
        if (current.modelOverrides[action]) overrides[action] = current.modelOverrides[action];
      }
    }
    next.modelOverrides = overrides;
  }

  if (body.tokenDefaults && typeof body.tokenDefaults === "object") {
    const raw = body.tokenDefaults as Record<string, unknown>;
    next.tokenDefaults = {
      generateDescriptionInput: safePositiveNumber(
        raw.generateDescriptionInput,
        current.tokenDefaults.generateDescriptionInput,
      ),
      generateDescriptionOutput: safePositiveNumber(
        raw.generateDescriptionOutput,
        current.tokenDefaults.generateDescriptionOutput,
      ),
      thematicInput: safePositiveNumber(raw.thematicInput, current.tokenDefaults.thematicInput),
      thematicOutput: safePositiveNumber(raw.thematicOutput, current.tokenDefaults.thematicOutput),
    };
  }

  if (body.pricingOverrides && typeof body.pricingOverrides === "object") {
    const sanitized: Record<string, { inputUsdPerMillion: number; outputUsdPerMillion: number }> = {};
    for (const [model, values] of Object.entries(body.pricingOverrides as Record<string, unknown>)) {
      if (!model || !values || typeof values !== "object") continue;
      const row = values as Record<string, unknown>;
      sanitized[model] = {
        inputUsdPerMillion: safePositiveNumber(row.inputUsdPerMillion, 1),
        outputUsdPerMillion: safePositiveNumber(row.outputUsdPerMillion, 5),
      };
    }
    next.pricingOverrides = sanitized;
  }

  return next;
}

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const config = await getIaControlConfig();
  const usage = await getIaUsageSummary(30);

  return NextResponse.json({
    config,
    usage,
    pricingCatalog: buildPricingCatalog(config),
    ia_available: Boolean(process.env.ANTHROPIC_API_KEY),
    actions: ALL_IA_ACTIONS,
  });
}

export async function PATCH(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const current = await getIaControlConfig();

  // Special action: save prompt version before applying patch
  let configWithHistory = current;
  if (body.savePromptVersion && typeof body.savePromptVersion === "string") {
    const key = body.savePromptVersion;
    if (key === "generateDescriptions" || key === "thematicCta") {
      configWithHistory = appendPromptHistory(current, key);
    }
  }

  const patch = sanitizePatch(body, current);
  const config = await saveIaControlConfig({ ...configWithHistory, ...patch });

  return NextResponse.json({
    ok: true,
    config,
    pricingCatalog: buildPricingCatalog(config),
  });
}
