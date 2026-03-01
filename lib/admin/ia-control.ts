import { supabaseServer } from "lib/supabase/client";
import { log } from "lib/logger";

export type IaAction =
  | "generate_descriptions_batch"
  | "generate_description_preview"
  | "generate_description_confirm"
  | "thematic_cta";

export const ALL_IA_ACTIONS: IaAction[] = [
  "generate_descriptions_batch",
  "generate_description_preview",
  "generate_description_confirm",
  "thematic_cta",
];

export const IA_ACTION_LABELS: Record<IaAction, string> = {
  generate_descriptions_batch: "Générer descriptions (batch)",
  generate_description_preview: "Prévisualiser description",
  generate_description_confirm: "Confirmer description",
  thematic_cta: "CTA Thématique",
};

interface ModelPricing {
  label: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

interface TokenDefaults {
  generateDescriptionInput: number;
  generateDescriptionOutput: number;
  thematicInput: number;
  thematicOutput: number;
}

interface PromptTemplates {
  generateDescriptions: string;
  thematicCta: string;
}

export interface PromptHistoryEntry {
  key: "generateDescriptions" | "thematicCta";
  version: number;
  prompt: string;
  savedAt: string;
}

export interface IaControlConfig {
  provider: "anthropic";
  defaultModel: string;
  /** Per-action model override — falls back to defaultModel if absent */
  modelOverrides: Partial<Record<IaAction, string>>;
  usdToEurRate: number;
  prompts: PromptTemplates;
  /** Bounded history of saved prompt versions (max 20) */
  promptHistory: PromptHistoryEntry[];
  tokenDefaults: TokenDefaults;
  pricingOverrides: Record<string, { inputUsdPerMillion: number; outputUsdPerMillion: number }>;
}

interface UsageSummary {
  days: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
  totalEur: number;
  byAction: Array<{
    action: IaAction;
    calls: number;
    totalUsd: number;
    totalEur: number;
  }>;
}

const CONFIG_KEY = "ia_control_center";
const FALLBACK_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const DEFAULT_PROMPTS: PromptTemplates = {
  generateDescriptions: `Tu es un expert en équipements pour collectivités.
Écris une description commerciale courte (2-3 phrases, max 150 mots) pour ce produit : {{name}}.
Catégorie : {{category}}.
SKU : {{sku}}.
La description doit être factuelle, professionnelle, au ton B2B.
Ne pas inventer de caractéristiques techniques.
Pas d'intro générique (pas de "Ce produit est..." ni "Nous vous présentons...").
Réponds uniquement avec la description, sans guillemets ni introduction.`,
  thematicCta: `Pour le thème "{{theme}}", sélectionne 6-8 types de produits pertinents pour des collectivités françaises.
Pour chaque type : des mots-clés courts pour une recherche ILIKE Supabase.
Génère aussi un titre court (≤ 8 mots) et une intro (2 phrases max).
Réponds UNIQUEMENT en JSON valide : { "title": "...", "intro": "...", "items": [{ "keywords": "...", "label": "...", "pitch": "..." }] }`,
};

const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-haiku-4-5-20251001": {
    label: "Claude Haiku 4.5",
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 5,
  },
  "claude-sonnet-4-6": {
    label: "Claude Sonnet 4.6",
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
  },
  "claude-opus-4-1": {
    label: "Claude Opus 4.1",
    inputUsdPerMillion: 15,
    outputUsdPerMillion: 75,
  },
};

const DEFAULT_CONFIG: IaControlConfig = {
  provider: "anthropic",
  defaultModel: FALLBACK_MODEL,
  modelOverrides: {},
  usdToEurRate: 0.92,
  prompts: DEFAULT_PROMPTS,
  promptHistory: [],
  tokenDefaults: {
    generateDescriptionInput: 700,
    generateDescriptionOutput: 180,
    thematicInput: 1200,
    thematicOutput: 420,
  },
  pricingOverrides: {},
};

function toPositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function toCurrency(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function deepMergeConfig(partial: Partial<IaControlConfig> | null): IaControlConfig {
  const source = partial ?? {};

  // Validate modelOverrides
  const modelOverrides: Partial<Record<IaAction, string>> = {};
  if (source.modelOverrides && typeof source.modelOverrides === "object") {
    for (const action of ALL_IA_ACTIONS) {
      const val = (source.modelOverrides as Record<string, unknown>)[action];
      if (typeof val === "string" && val.trim()) {
        modelOverrides[action] = val.trim();
      }
    }
  }

  // Validate promptHistory (bounded to 20, sanitize entries)
  let promptHistory: PromptHistoryEntry[] = [];
  if (Array.isArray(source.promptHistory)) {
    promptHistory = (source.promptHistory as unknown[])
      .filter(
        (e): e is PromptHistoryEntry =>
          e !== null &&
          typeof e === "object" &&
          typeof (e as PromptHistoryEntry).key === "string" &&
          typeof (e as PromptHistoryEntry).prompt === "string" &&
          typeof (e as PromptHistoryEntry).version === "number",
      )
      .slice(0, 20);
  }

  const merged: IaControlConfig = {
    provider: "anthropic",
    defaultModel: typeof source.defaultModel === "string" && source.defaultModel.trim()
      ? source.defaultModel.trim()
      : DEFAULT_CONFIG.defaultModel,
    modelOverrides,
    usdToEurRate: toPositiveNumber(source.usdToEurRate, DEFAULT_CONFIG.usdToEurRate),
    prompts: {
      generateDescriptions:
        source.prompts?.generateDescriptions?.trim() ||
        DEFAULT_CONFIG.prompts.generateDescriptions,
      thematicCta: source.prompts?.thematicCta?.trim() || DEFAULT_CONFIG.prompts.thematicCta,
    },
    promptHistory,
    tokenDefaults: {
      generateDescriptionInput: toPositiveNumber(
        source.tokenDefaults?.generateDescriptionInput,
        DEFAULT_CONFIG.tokenDefaults.generateDescriptionInput,
      ),
      generateDescriptionOutput: toPositiveNumber(
        source.tokenDefaults?.generateDescriptionOutput,
        DEFAULT_CONFIG.tokenDefaults.generateDescriptionOutput,
      ),
      thematicInput: toPositiveNumber(
        source.tokenDefaults?.thematicInput,
        DEFAULT_CONFIG.tokenDefaults.thematicInput,
      ),
      thematicOutput: toPositiveNumber(
        source.tokenDefaults?.thematicOutput,
        DEFAULT_CONFIG.tokenDefaults.thematicOutput,
      ),
    },
    pricingOverrides: {},
  };

  const overrides = source.pricingOverrides ?? {};
  for (const [model, pricing] of Object.entries(overrides)) {
    if (!model || !pricing) continue;
    const inputUsdPerMillion = toPositiveNumber(
      (pricing as any).inputUsdPerMillion,
      DEFAULT_MODEL_PRICING[model]?.inputUsdPerMillion ?? 1,
    );
    const outputUsdPerMillion = toPositiveNumber(
      (pricing as any).outputUsdPerMillion,
      DEFAULT_MODEL_PRICING[model]?.outputUsdPerMillion ?? 5,
    );
    merged.pricingOverrides[model] = { inputUsdPerMillion, outputUsdPerMillion };
  }

  return merged;
}

function normalizeAction(action: string): IaAction | null {
  if (
    action === "generate_descriptions_batch" ||
    action === "generate_description_preview" ||
    action === "generate_description_confirm" ||
    action === "thematic_cta"
  ) {
    return action;
  }
  return null;
}

/** Resolve the effective model for an action (override or default) */
export function resolveModel(config: IaControlConfig, action?: IaAction): string {
  if (action && config.modelOverrides[action]) {
    return config.modelOverrides[action]!;
  }
  return config.defaultModel;
}

/** Save a prompt version to history (bounded to 20 entries) */
export function appendPromptHistory(
  config: IaControlConfig,
  key: "generateDescriptions" | "thematicCta",
): IaControlConfig {
  const existing = config.promptHistory.filter((e) => e.key === key);
  const maxVersion = existing.reduce((m, e) => Math.max(m, e.version), 0);
  const entry: PromptHistoryEntry = {
    key,
    version: maxVersion + 1,
    prompt: key === "generateDescriptions" ? config.prompts.generateDescriptions : config.prompts.thematicCta,
    savedAt: new Date().toISOString(),
  };
  const updated = [...config.promptHistory, entry].slice(-20);
  return { ...config, promptHistory: updated };
}

export function renderPromptTemplate(
  template: string,
  vars: Record<string, string | null | undefined>,
): string {
  let output = template;
  for (const [key, value] of Object.entries(vars)) {
    output = output.replaceAll(`{{${key}}}`, String(value ?? "—"));
  }
  return output;
}

export function getModelPricing(config: IaControlConfig, model: string): ModelPricing {
  const defaultPricing = DEFAULT_MODEL_PRICING[model] ?? {
    label: model,
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
  };
  const override = config.pricingOverrides[model];
  return {
    label: defaultPricing.label,
    inputUsdPerMillion: override?.inputUsdPerMillion ?? defaultPricing.inputUsdPerMillion,
    outputUsdPerMillion:
      override?.outputUsdPerMillion ?? defaultPricing.outputUsdPerMillion,
  };
}

export function buildPricingCatalog(config: IaControlConfig): Array<{
  model: string;
  label: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}> {
  const models = new Set<string>([
    ...Object.keys(DEFAULT_MODEL_PRICING),
    ...Object.keys(config.pricingOverrides),
    config.defaultModel,
  ]);
  return [...models]
    .filter(Boolean)
    .map((model) => {
      const pricing = getModelPricing(config, model);
      return {
        model,
        label: pricing.label,
        inputUsdPerMillion: pricing.inputUsdPerMillion,
        outputUsdPerMillion: pricing.outputUsdPerMillion,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

export function estimateCostFromTokens(args: {
  config: IaControlConfig;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  calls?: number;
}) {
  const model = args.model || args.config.defaultModel;
  const pricing = getModelPricing(args.config, model);
  const inputTokens = Math.max(0, Math.round(args.inputTokens));
  const outputTokens = Math.max(0, Math.round(args.outputTokens));
  const calls = Math.max(1, Math.round(args.calls ?? 1));

  const inputUsd = (inputTokens / 1_000_000) * pricing.inputUsdPerMillion;
  const outputUsd = (outputTokens / 1_000_000) * pricing.outputUsdPerMillion;
  const totalUsd = inputUsd + outputUsd;
  const totalEur = totalUsd * args.config.usdToEurRate;

  return {
    model,
    calls,
    inputTokens,
    outputTokens,
    pricing,
    inputUsd: toCurrency(inputUsd),
    outputUsd: toCurrency(outputUsd),
    totalUsd: toCurrency(totalUsd),
    totalEur: toCurrency(totalEur),
    usdToEurRate: args.config.usdToEurRate,
  };
}

export function estimateActionCost(args: {
  config: IaControlConfig;
  action: string;
  count: number;
  model?: string;
}) {
  const action = normalizeAction(args.action);
  if (!action) {
    throw new Error("Action IA inconnue");
  }

  const count = Math.max(1, Math.round(args.count));

  let inputTokens = 0;
  let outputTokens = 0;

  if (
    action === "generate_descriptions_batch" ||
    action === "generate_description_preview" ||
    action === "generate_description_confirm"
  ) {
    inputTokens = count * args.config.tokenDefaults.generateDescriptionInput;
    outputTokens = count * args.config.tokenDefaults.generateDescriptionOutput;
  } else if (action === "thematic_cta") {
    inputTokens = count * args.config.tokenDefaults.thematicInput;
    outputTokens = count * args.config.tokenDefaults.thematicOutput;
  }

  return {
    action,
    count,
    ...estimateCostFromTokens({
      config: args.config,
      model: args.model,
      inputTokens,
      outputTokens,
      calls: count,
    }),
  };
}

export async function getIaControlConfig(): Promise<IaControlConfig> {
  const client = supabaseServer();
  try {
    const { data, error } = await client
      .from("site_config")
      .select("value")
      .eq("key", CONFIG_KEY)
      .single();

    if (error || !data?.value) {
      return DEFAULT_CONFIG;
    }

    const parsed = safeJsonParse(String(data.value));
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_CONFIG;
    }

    return deepMergeConfig(parsed as Partial<IaControlConfig>);
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveIaControlConfig(
  partial: Partial<IaControlConfig>,
): Promise<IaControlConfig> {
  const current = await getIaControlConfig();
  const merged = deepMergeConfig({ ...current, ...partial });
  const client = supabaseServer();

  await client.from("site_config").upsert(
    {
      key: CONFIG_KEY,
      value: JSON.stringify(merged),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  return merged;
}

export async function recordIaUsage(input: {
  action: IaAction;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
  totalEur: number;
  itemCount: number;
  metadata?: Record<string, unknown>;
}) {
  const client = supabaseServer();
  try {
    await client.from("ia_usage_events").insert({
      action: input.action,
      model: input.model,
      input_tokens: Math.max(0, Math.round(input.inputTokens)),
      output_tokens: Math.max(0, Math.round(input.outputTokens)),
      total_usd: toCurrency(input.totalUsd),
      total_eur: toCurrency(input.totalEur),
      item_count: Math.max(1, Math.round(input.itemCount)),
      metadata: input.metadata ?? {},
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    log("warn", "admin.ia.usage_insert_failed", {
      error: err instanceof Error ? err.message : String(err),
      action: input.action,
      model: input.model,
    });
  }
}

export async function getIaUsageSummary(days = 30): Promise<UsageSummary> {
  const client = supabaseServer();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const empty: UsageSummary = {
    days,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalUsd: 0,
    totalEur: 0,
    byAction: [],
  };

  try {
    const { data, error } = await client
      .from("ia_usage_events")
      .select("action, input_tokens, output_tokens, total_usd, total_eur")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error || !data) return empty;

    const grouped = new Map<IaAction, { calls: number; totalUsd: number; totalEur: number }>();
    let inputTokens = 0;
    let outputTokens = 0;
    let totalUsd = 0;
    let totalEur = 0;

    for (const row of data as any[]) {
      const action = normalizeAction(String(row.action));
      if (!action) continue;
      inputTokens += Number(row.input_tokens ?? 0);
      outputTokens += Number(row.output_tokens ?? 0);
      totalUsd += Number(row.total_usd ?? 0);
      totalEur += Number(row.total_eur ?? 0);

      const prev = grouped.get(action) ?? { calls: 0, totalUsd: 0, totalEur: 0 };
      prev.calls += 1;
      prev.totalUsd += Number(row.total_usd ?? 0);
      prev.totalEur += Number(row.total_eur ?? 0);
      grouped.set(action, prev);
    }

    return {
      days,
      calls: data.length,
      inputTokens,
      outputTokens,
      totalUsd: toCurrency(totalUsd),
      totalEur: toCurrency(totalEur),
      byAction: [...grouped.entries()].map(([action, g]) => ({
        action,
        calls: g.calls,
        totalUsd: toCurrency(g.totalUsd),
        totalEur: toCurrency(g.totalEur),
      })),
    };
  } catch {
    return empty;
  }
}
