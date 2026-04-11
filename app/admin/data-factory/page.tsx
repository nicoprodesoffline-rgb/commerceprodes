"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "lib/admin/fetch";

type TabId =
  | "imports"
  | "normalisation"
  | "families"
  | "pricing"
  | "validation";

interface ImportLog {
  id: string;
  filename: string | null;
  file_url: string | null;
  status: "pending" | "processing" | "done" | "error" | string;
  supplier_name?: string | null;
  catalog_name?: string | null;
  catalog_year?: number | null;
  source_label?: string | null;
  import_batch_key?: string | null;
  rows_processed: number | null;
  rows_total?: number | null;
  rows_ok?: number | null;
  rows_error?: number | null;
  error_count?: number | null;
  stage?: string | null;
  duration_ms?: number | null;
  notes: string | null;
  error_details?: string | null;
  updated_at?: string | null;
  created_at: string;
}

interface FamilySuggestion {
  parent: { id: string; name: string; sku: string | null };
  children: Array<{ id: string; name: string; sku: string | null }>;
  strategy: string;
  score: number;
  reasons: string[];
}

interface FamilyAudit {
  total_active_families: number;
  pending_candidates: number;
  native_candidates?: number;
  issues: number;
  parents_without_children: Array<{ id: string; name: string }>;
  orphan_products: Array<{
    id: string;
    name: string;
    sku: string;
    parent_sku: string;
  }>;
  large_families: Array<{ id: string; name: string; count: number }>;
  potential_suggestions?: number;
  scope?: {
    mode?: string;
    since?: string | null;
    products_considered?: number;
  };
}

interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  status: string;
  regular_price: number | null;
  sale_price: number | null;
  short_description: string | null;
  parent_sku: string | null;
  family_role: string | null;
  family_id: string | null;
  family_name: string | null;
  has_variants: boolean;
  variant_count: number;
  pbq_enabled: boolean | null;
  pbq_pricing_type: string | null;
  categories: string | null;
  updated_at: string | null;
}

interface ValidationIssue {
  product: ProductListItem;
  reasons: string[];
}

interface PricingSummary {
  total: number;
  published: number;
  promoActive: number;
  pbqEnabled: number;
  degressive: number;
  lot: number;
  missingPrice: number;
}

interface PuidSuggestion {
  id: string;
  level: "product" | "variant";
  product_id: string;
  source_sku: string | null;
  suggested_puid: string;
  puid_root: string;
  price_branch: string | null;
  style_branch: string | null;
  supplier_code: string;
  model_code: string;
  reasons: string[];
  lot_candidate: boolean;
  confidence: number;
}

interface PuidPreview {
  scope: {
    mode: string;
    since?: string | null;
    total_products: number;
    total_variants: number;
    total_suggestions: number;
    collisions: number;
    lot_candidates: number;
  };
  products: PuidSuggestion[];
  variants: PuidSuggestion[];
  branches: Array<{
    product_id: string;
    product_name: string;
    puid_root: string;
    branches: Array<{
      price_branch: string;
      count: number;
      style_examples: string[];
      samples: string[];
    }>;
  }>;
  collisions: Array<{
    level: "product" | "variant";
    suggested_puid: string;
    ids: string[];
  }>;
}

const TABS: Array<{ id: TabId; label: string; hint: string }> = [
  {
    id: "imports",
    label: "Import brut",
    hint: "Upload catalogue + déclenchement pipeline",
  },
  {
    id: "normalisation",
    label: "Normalisation",
    hint: "Règles explicites, IA, coût, plan d'action",
  },
  {
    id: "families",
    label: "Mères / Filles",
    hint: "Arbre mère/filles + audit/suggestions",
  },
  {
    id: "pricing",
    label: "Tarification",
    hint: "Vue macro pricing normal/promo",
  },
  {
    id: "validation",
    label: "Validation & publication",
    hint: "Queue des points à vérifier",
  },
];

const STATUS_META: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  processing: "bg-amber-100 text-amber-800",
  done: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
};

const NORMALIZATION_KEYS = [
  "df_normalization_strategy",
  "df_publish_policy",
  "df_confidence_threshold",
  "df_price_impact_axes_default",
  "df_auto_assign_family_role",
  "df_sku_separator",
] as const;

const AI_KEYS = [
  "df_ai_model_extract",
  "df_ai_model_normalize",
  "df_ai_prompt_extract",
  "df_ai_prompt_normalize",
  "df_cost_input_tokens_per_item",
  "df_cost_output_tokens_per_item",
  "df_cost_input_per_million",
  "df_cost_output_per_million",
] as const;

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMoney(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function DataFactoryPage() {
  const [activeTab, setActiveTab] = useState<TabId>("imports");

  const [importsLoading, setImportsLoading] = useState(false);
  const [imports, setImports] = useState<ImportLog[]>([]);
  const [uploading, setUploading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [catalogName, setCatalogName] = useState("");
  const [catalogYear, setCatalogYear] = useState(
    String(new Date().getFullYear()),
  );
  const [sourceLabel, setSourceLabel] = useState("manual_upload");
  const [scopeLatestImport, setScopeLatestImport] = useState(true);

  const [configLoading, setConfigLoading] = useState(false);
  const [configSavingKey, setConfigSavingKey] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});

  const [familyAuditLoading, setFamilyAuditLoading] = useState(false);
  const [familyAudit, setFamilyAudit] = useState<FamilyAudit | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<FamilySuggestion[]>([]);

  const [productsLoading, setProductsLoading] = useState(false);
  const [products, setProducts] = useState<ProductListItem[]>([]);

  const [batchSize, setBatchSize] = useState(50);
  const [puidPreviewLoading, setPuidPreviewLoading] = useState(false);
  const [puidApplyLoading, setPuidApplyLoading] = useState(false);
  const [puidPreview, setPuidPreview] = useState<PuidPreview | null>(null);
  const [puidApplyToSku, setPuidApplyToSku] = useState(false);
  const [puidCleanupLots, setPuidCleanupLots] = useState(false);
  const [puidIncludeDraft, setPuidIncludeDraft] = useState(true);
  const [puidLimit, setPuidLimit] = useState(250);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // PUID workflow steps
  const [puidDryRunLoading, setPuidDryRunLoading] = useState(false);
  const [puidDryRunResult, setPuidDryRunResult] = useState<null | {
    dry_run: true;
    scope: {
      mode: string;
      since: string | null;
      total_products: number;
      total_variants: number;
      total_suggestions: number;
      collisions: number;
      lot_candidates: number;
    };
    preview: {
      products: PuidSuggestion[];
      variants: PuidSuggestion[];
      branches: unknown[];
      collisions: unknown[];
    };
    apply: {
      products_planned: number;
      variants_planned: number;
      product_sku_conflicts: unknown[];
      variant_sku_conflicts: unknown[];
    };
  }>(null);

  const [puidBackupLoading, setPuidBackupLoading] = useState(false);
  const [puidBackupData, setPuidBackupData] = useState<unknown | null>(null);
  const [puidRestoreLoading, setPuidRestoreLoading] = useState(false);

  // Assembly from PUID
  const [puidAssembleLoading, setPuidAssembleLoading] = useState(false);
  const [puidAssemblePlan, setPuidAssemblePlan] = useState<null | {
    dry_run: boolean;
    stats: {
      total_products_with_puid_root: number;
      unique_roots: number;
      to_create: number;
      skip_existing: number;
      skip_single: number;
    };
    plan?: unknown[];
  }>(null);

  const cfg = (key: string, fallback = ""): string => config[key] ?? fallback;

  const normalizationStrategy = cfg("df_normalization_strategy", "parent_sku");
  const publishPolicy = cfg("df_publish_policy", "draft");
  const confidenceThreshold = cfg("df_confidence_threshold", "75");

  async function loadImports() {
    setImportsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "60" });
      const res = await adminFetch(
        `/api/admin/import-logs?${params.toString()}`,
      );
      const data = (await res.json().catch(() => ({}))) as {
        logs?: ImportLog[];
        error?: string;
      };
      if (!res.ok)
        throw new Error(data.error ?? "Impossible de charger les imports");
      setImports(data.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur imports");
    } finally {
      setImportsLoading(false);
    }
  }

  function validateImportFile(file: File): string | null {
    const allowed = [".xlsx", ".xls", ".csv", ".ods"];
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowed.includes(ext)) {
      return "Format non supporté (.xlsx, .xls, .csv, .ods)";
    }
    if (file.size <= 0 || file.size > 35 * 1024 * 1024) {
      return "Fichier invalide (max 35MB)";
    }
    return null;
  }

  async function submitImport() {
    if (!importFile) {
      setError("Aucun fichier sélectionné");
      return;
    }
    const invalidReason = validateImportFile(importFile);
    if (invalidReason) {
      setError(invalidReason);
      return;
    }

    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", importFile);
      form.set("supplier_name", supplierName.trim());
      form.set("catalog_name", catalogName.trim());
      form.set("catalog_year", catalogYear.trim());
      form.set("source_label", sourceLabel.trim() || "manual_upload");

      const res = await adminFetch("/api/admin/import-upload", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        import_log_id?: string;
        import_batch_key?: string;
        webhook_started?: boolean;
        webhook_message?: string;
        degraded_storage?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Import impossible");
      }
      const statusBits = [
        `Import enregistré (${data.import_batch_key ?? "batch n/a"})`,
        data.webhook_started
          ? "workflow n8n lancé"
          : (data.webhook_message ?? "workflow non lancé"),
        data.degraded_storage ? "stockage fallback activé" : null,
      ].filter(Boolean);
      setMessage(statusBits.join(" · "));
      setImportFile(null);
      await loadImports();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur import");
    } finally {
      setUploading(false);
    }
  }

  async function loadConfig() {
    setConfigLoading(true);
    try {
      const res = await adminFetch("/api/admin/site-config");
      const data = (await res.json().catch(() => ({}))) as {
        config?: Record<string, string>;
        error?: string;
      };
      if (!res.ok)
        throw new Error(data.error ?? "Impossible de charger la configuration");
      setConfig(data.config ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur configuration");
    } finally {
      setConfigLoading(false);
    }
  }

  async function loadFamilyAudit() {
    setFamilyAuditLoading(true);
    try {
      const params = new URLSearchParams();
      if (scopeLatestImport) params.set("scope", "latest_import");
      const res = await adminFetch(
        `/api/admin/families/audit${params.size ? `?${params.toString()}` : ""}`,
      );
      const data = (await res.json().catch(() => ({}))) as FamilyAudit & {
        error?: string;
      };
      if (!res.ok)
        throw new Error(data.error ?? "Impossible de charger l'audit familles");
      setFamilyAudit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur audit familles");
    } finally {
      setFamilyAuditLoading(false);
    }
  }

  async function loadProducts() {
    setProductsLoading(true);
    try {
      const params = new URLSearchParams({
        status: "all",
        limit: "200",
        page: "0",
        sort: "updated_at-desc",
      });
      const res = await adminFetch(
        `/api/admin/products-list?${params.toString()}`,
      );
      const data = (await res.json().catch(() => ({}))) as {
        products?: ProductListItem[];
        error?: string;
      };
      if (!res.ok)
        throw new Error(data.error ?? "Impossible de charger les produits");
      setProducts(data.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur produits");
    } finally {
      setProductsLoading(false);
    }
  }

  useEffect(() => {
    void Promise.all([
      loadImports(),
      loadConfig(),
      loadFamilyAudit(),
      loadProducts(),
    ]);
  }, []);

  async function saveKey(key: string, value: string) {
    setConfigSavingKey(key);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch("/api/admin/site-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Échec sauvegarde: ${key}`);
      setMessage(`Configuration enregistrée: ${key}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur sauvegarde");
    } finally {
      setConfigSavingKey(null);
    }
  }

  async function saveConfigGroup(keys: readonly string[]) {
    for (const key of keys) {
      await saveKey(key, cfg(key));
    }
  }

  async function runSuggestionPreview() {
    setSuggestionsLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/families/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy: normalizationStrategy,
          limit: 20,
          import_scope: scopeLatestImport ? "latest_import" : "all",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        suggestions?: FamilySuggestion[];
        error?: string;
      };
      if (!res.ok)
        throw new Error(data.error ?? "Échec simulation normalisation");
      setSuggestions(data.suggestions ?? []);
      setMessage(
        `Simulation terminée: ${(data.suggestions ?? []).length} suggestions`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur simulation");
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function runPuidPreview() {
    setPuidPreviewLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        scope: scopeLatestImport ? "latest_import" : "all",
        limit: String(puidLimit),
        include_draft: puidIncludeDraft ? "true" : "false",
      });
      const res = await adminFetch(
        `/api/admin/data-factory/puid?${params.toString()}`,
      );
      const data = (await res.json().catch(() => ({}))) as PuidPreview & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Échec preview PUID");
      setPuidPreview(data);
      setMessage(
        `Preview PUID: ${data.scope.total_suggestions} suggestions · ${data.scope.collisions} collisions`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur preview PUID");
    } finally {
      setPuidPreviewLoading(false);
    }
  }

  async function applyPuid() {
    setPuidApplyLoading(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        scope: scopeLatestImport ? "latest_import" : "all",
        limit: puidLimit,
        include_draft: puidIncludeDraft,
        apply_products: true,
        apply_variants: true,
        apply_to_sku: puidApplyToSku,
        cleanup_lot_candidates: puidCleanupLots,
        dry_run: false,
      };
      const res = await adminFetch("/api/admin/data-factory/puid", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        migration?: string;
        result?: {
          updated_products: number;
          updated_variants: number;
          skipped_products_conflict: number;
          skipped_variants_conflict: number;
          lot_rows_drafted_products: number;
          lot_rows_drafted_variants: number;
          errors?: string[];
        };
      };
      if (!res.ok) {
        const hint = data.migration
          ? ` · migration requise: ${data.migration}`
          : "";
        throw new Error((data.error ?? "Échec application PUID") + hint);
      }
      const result = data.result;
      setMessage(
        `PUID appliqué: ${result?.updated_products ?? 0} produits + ${result?.updated_variants ?? 0} variantes` +
          ` · conflits ignorés ${result?.skipped_products_conflict ?? 0}/${result?.skipped_variants_conflict ?? 0}`,
      );
      await Promise.all([loadProducts(), loadFamilyAudit()]);
      await runPuidPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur application PUID");
    } finally {
      setPuidApplyLoading(false);
    }
  }

  async function runPuidDryRun() {
    setPuidDryRunLoading(true);
    setError(null);
    try {
      const payload = {
        scope: scopeLatestImport ? "latest_import" : "all",
        limit: puidLimit,
        include_draft: puidIncludeDraft,
        apply_products: true,
        apply_variants: true,
        apply_to_sku: puidApplyToSku,
        cleanup_lot_candidates: puidCleanupLots,
        dry_run: true,
      };
      const res = await adminFetch("/api/admin/data-factory/puid", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res
        .json()
        .catch(() => ({}))) as typeof puidDryRunResult & { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "Échec dry-run PUID");
      setPuidDryRunResult(data as typeof puidDryRunResult);
      setMessage(
        `Dry-run PUID: ${data?.apply?.products_planned ?? 0} produits + ${data?.apply?.variants_planned ?? 0} variantes à modifier`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur dry-run PUID");
    } finally {
      setPuidDryRunLoading(false);
    }
  }

  async function downloadBackup() {
    setPuidBackupLoading(true);
    setError(null);
    try {
      const res = await adminFetch(
        `/api/admin/data-factory/puid/backup?limit=5000`,
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Échec backup PUID");
      setPuidBackupData(data);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `puid-backup-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Backup PUID téléchargé");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur backup PUID");
    } finally {
      setPuidBackupLoading(false);
    }
  }

  async function restoreFromFile(file: File) {
    setPuidRestoreLoading(true);
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        products?: unknown[];
        variants?: unknown[];
      };
      if (!Array.isArray(parsed.products) || !Array.isArray(parsed.variants)) {
        throw new Error(
          "Fichier backup invalide (products/variants manquants)",
        );
      }
      const res = await adminFetch("/api/admin/data-factory/puid/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed, dry_run: false }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        restored_products?: number;
        restored_variants?: number;
        errors?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Échec restauration PUID");
      setMessage(
        `Rollback PUID appliqué: ${data.restored_products ?? 0} produits + ${data.restored_variants ?? 0} variantes restaurés`,
      );
      await Promise.all([loadProducts(), runPuidPreview()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur restauration PUID");
    } finally {
      setPuidRestoreLoading(false);
    }
  }

  async function runAssembleFamilies(applyNow: boolean) {
    setPuidAssembleLoading(true);
    setError(null);
    try {
      const res = await adminFetch(
        "/api/admin/data-factory/puid/assemble-families",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dry_run: !applyNow,
            scope: scopeLatestImport ? "latest_import" : "all",
            limit: 2000,
            min_children: 1,
          }),
        },
      );
      const data = (await res
        .json()
        .catch(() => ({}))) as typeof puidAssemblePlan & { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "Échec assemblage familles");
      setPuidAssemblePlan(data as typeof puidAssemblePlan);
      if (applyNow) {
        setMessage(
          `Familles assemblées depuis PUID: ${(data as { created_families?: number }).created_families ?? 0} nouvelles familles créées`,
        );
        await loadFamilyAudit();
      } else {
        setMessage(
          `Dry-run assemblage: ${data?.stats?.to_create ?? 0} familles à créer`,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur assemblage familles",
      );
    } finally {
      setPuidAssembleLoading(false);
    }
  }

  const pricingSummary = useMemo<PricingSummary>(() => {
    return products.reduce<PricingSummary>(
      (acc, p) => {
        acc.total += 1;
        if (p.status === "publish") acc.published += 1;
        if (typeof p.sale_price === "number" && p.sale_price > 0)
          acc.promoActive += 1;
        if (p.pbq_enabled) acc.pbqEnabled += 1;
        if (p.pbq_pricing_type === "degressive") acc.degressive += 1;
        if (p.pbq_pricing_type === "lot") acc.lot += 1;
        if (p.regular_price == null || p.regular_price <= 0)
          acc.missingPrice += 1;
        return acc;
      },
      {
        total: 0,
        published: 0,
        promoActive: 0,
        pbqEnabled: 0,
        degressive: 0,
        lot: 0,
        missingPrice: 0,
      },
    );
  }, [products]);

  const validationQueue = useMemo<ValidationIssue[]>(() => {
    const threshold = parseNumber(confidenceThreshold, 75);
    return products
      .map((product) => {
        const reasons: string[] = [];
        if (!product.sku) reasons.push("SKU manquant");
        if (
          product.status === "publish" &&
          (!product.regular_price || product.regular_price <= 0)
        ) {
          reasons.push("Prix publié invalide");
        }
        if (
          !product.short_description ||
          product.short_description.trim().length < 20
        ) {
          reasons.push("Description courte faible");
        }
        if (product.family_role === "child" && !product.parent_sku) {
          reasons.push("Produit enfant sans parent_sku");
        }
        if (product.has_variants && !product.family_id) {
          reasons.push("Variantes présentes sans famille explicite");
        }
        if (product.status === "publish" && !product.categories) {
          reasons.push("Aucune catégorie");
        }
        if (reasons.length >= 3 && threshold >= 70) {
          reasons.push("Confiance faible: validation humaine requise");
        }
        return { product, reasons };
      })
      .filter((entry) => entry.reasons.length > 0)
      .slice(0, 120);
  }, [products, confidenceThreshold]);

  const inputTokensPerItem = parseNumber(
    cfg("df_cost_input_tokens_per_item", "900"),
    900,
  );
  const outputTokensPerItem = parseNumber(
    cfg("df_cost_output_tokens_per_item", "300"),
    300,
  );
  const inputPerMillion = parseNumber(cfg("df_cost_input_per_million", "1"), 1);
  const outputPerMillion = parseNumber(
    cfg("df_cost_output_per_million", "5"),
    5,
  );

  const estimatedCost = useMemo(() => {
    const inputCost =
      (batchSize * inputTokensPerItem * inputPerMillion) / 1_000_000;
    const outputCost =
      (batchSize * outputTokensPerItem * outputPerMillion) / 1_000_000;
    const total = inputCost + outputCost;
    return { inputCost, outputCost, total };
  }, [
    batchSize,
    inputTokensPerItem,
    outputTokensPerItem,
    inputPerMillion,
    outputPerMillion,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Factory</h1>
          <p className="mt-1 text-sm text-gray-500">
            Pipeline catalogue: import brut → normalisation → mères/filles →
            validation.
          </p>
        </div>
        <div className="flex gap-2">
          <label className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
            <input
              type="checkbox"
              className="mr-1 align-middle"
              checked={scopeLatestImport}
              onChange={(e) => setScopeLatestImport(e.target.checked)}
            />
            Scope mères/filles: dernier import
          </label>
          <button
            onClick={() =>
              void Promise.all([
                loadImports(),
                loadConfig(),
                loadFamilyAudit(),
                loadProducts(),
              ])
            }
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Rafraîchir
          </button>
        </div>
      </div>

      {(message || error) && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {error ?? message}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap border-b border-gray-200">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium ${
                  active
                    ? "border-b-2 border-[#cc1818] text-[#cc1818]"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="px-5 py-4">
          <p className="mb-4 text-xs text-gray-500">
            {TABS.find((tab) => tab.id === activeTab)?.hint}
          </p>

          {activeTab === "imports" && (
            <section className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <h2 className="text-sm font-semibold text-blue-900">
                  Processus d&apos;import catalogue
                </h2>
                <ol className="mt-2 grid gap-2 text-xs text-blue-900 md:grid-cols-4">
                  <li className="rounded border border-blue-200 bg-white/70 p-2">
                    1. Upload fichier brut (Excel/CSV)
                  </li>
                  <li className="rounded border border-blue-200 bg-white/70 p-2">
                    2. Parsing & extraction (Retab / n8n)
                  </li>
                  <li className="rounded border border-blue-200 bg-white/70 p-2">
                    3. Normalisation PUID + Mère/Filles
                  </li>
                  <li className="rounded border border-blue-200 bg-white/70 p-2">
                    4. Validation humaine avant publication
                  </li>
                </ol>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <h2 className="mb-3 text-sm font-semibold text-gray-900">
                  Nouveau catalogue fournisseur
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-600">Fournisseur</span>
                    <input
                      type="text"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      placeholder="ex: Grosfillex, E-Sunny, Socomix…"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-600">Nom catalogue</span>
                    <input
                      type="text"
                      value={catalogName}
                      onChange={(e) => setCatalogName(e.target.value)}
                      placeholder="ex: TARIFS REVENDEURS 2026"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-600">Année</span>
                    <input
                      type="number"
                      min={2000}
                      max={2100}
                      value={catalogYear}
                      onChange={(e) => setCatalogYear(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-600">Source</span>
                    <select
                      value={sourceLabel}
                      onChange={(e) => setSourceLabel(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="manual_upload">Upload manuel</option>
                      <option value="retab">Extraction Retab</option>
                      <option value="api_feed">Flux API fournisseur</option>
                    </select>
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.ods"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                    className="max-w-sm rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
                  />
                  {importFile ? (
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                      {importFile.name} · {(importFile.size / 1024).toFixed(0)}{" "}
                      Ko
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">
                      Formats acceptés: .xlsx .xls .csv .ods
                    </span>
                  )}
                  <button
                    onClick={() => void submitImport()}
                    disabled={uploading || !importFile}
                    className="rounded-lg bg-[#cc1818] px-3 py-2 text-sm font-semibold text-white hover:bg-[#aa1414] disabled:opacity-60"
                  >
                    {uploading ? "Envoi..." : "Démarrer import"}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Total imports</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {imports.length}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">En attente</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {imports.filter((item) => item.status === "pending").length}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">En cours</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {
                      imports.filter((item) => item.status === "processing")
                        .length
                    }
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">
                    Terminés / exploitables
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {imports.filter((item) => item.status === "done").length}
                  </p>
                </div>
              </div>

              {importsLoading ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                  Chargement des imports...
                </div>
              ) : imports.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
                  Aucun import trouvé.
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs text-gray-500">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Fournisseur</th>
                        <th className="px-3 py-2">Fichier</th>
                        <th className="px-3 py-2">Statut</th>
                        <th className="px-3 py-2 text-right">
                          Lignes (ok/err)
                        </th>
                        <th className="px-3 py-2">Batch</th>
                        <th className="px-3 py-2">Stage</th>
                        <th className="px-3 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {imports.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 text-gray-500">
                            {fmtDate(item.created_at)}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            <div className="font-medium">
                              {item.supplier_name ?? "—"}
                            </div>
                            <div className="text-[11px] text-gray-400">
                              {item.catalog_name ?? "catalogue n/a"}
                              {item.catalog_year
                                ? ` (${item.catalog_year})`
                                : ""}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-800">
                            {item.file_url ? (
                              <a
                                href={item.file_url}
                                target="_blank"
                                className="hover:underline"
                                rel="noreferrer"
                              >
                                {item.filename ?? "—"}
                              </a>
                            ) : (
                              (item.filename ?? "—")
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                STATUS_META[item.status] ??
                                "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700">
                            <div>{item.rows_processed ?? 0}</div>
                            <div className="text-[11px] text-gray-400">
                              {item.rows_ok ?? 0}/{item.rows_error ?? 0}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {item.import_batch_key ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {item.stage ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {item.notes ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeTab === "normalisation" && (
            <section className="space-y-5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h2 className="text-sm font-semibold text-amber-900">
                  Ce que fait la normalisation (concrètement)
                </h2>
                <ul className="mt-2 space-y-1 text-xs text-amber-900">
                  <li>
                    1. Détection des groupes candidats (via parent_sku, racine
                    SKU, titre).
                  </li>
                  <li>
                    2. Séparation attributs qui changent le prix vs attributs
                    esthétiques.
                  </li>
                  <li>
                    3. Proposition de structure Mère/Filles + besoin de
                    validation humaine si doute.
                  </li>
                  <li>
                    4. Génération d&apos;un plan de publication (brouillon /
                    publié sans prix / publié avec prix).
                  </li>
                </ul>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <h2 className="mb-3 text-sm font-semibold text-gray-900">
                  Règles de normalisation
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-600">
                      Stratégie de groupement
                    </span>
                    <select
                      value={normalizationStrategy}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          df_normalization_strategy: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="parent_sku">parent_sku</option>
                      <option value="sku_root">racine SKU</option>
                      <option value="title_root">titre similaire</option>
                      <option value="auto">auto</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-600">Politique publication</span>
                    <select
                      value={publishPolicy}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          df_publish_policy: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="draft">Brouillon</option>
                      <option value="publish_if_price">
                        Publier si prix valide
                      </option>
                      <option value="publish_without_price">
                        Publier même sans prix
                      </option>
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-600">
                      Seuil confiance (0-100)
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={confidenceThreshold}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          df_confidence_threshold: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-600">
                      Séparateur SKU prix/non-prix
                    </span>
                    <input
                      type="text"
                      value={cfg("df_sku_separator", ".")}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          df_sku_separator: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-gray-600">
                      Axes prix-impact (liste comma-separated)
                    </span>
                    <input
                      type="text"
                      value={cfg(
                        "df_price_impact_axes_default",
                        "dimension,norme,finition",
                      )}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          df_price_impact_axes_default: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => void saveConfigGroup(NORMALIZATION_KEYS)}
                    disabled={configSavingKey !== null || configLoading}
                    className="rounded-lg bg-[#cc1818] px-3 py-2 text-sm font-semibold text-white hover:bg-[#aa1414] disabled:opacity-60"
                  >
                    Sauver règles de normalisation
                  </button>
                  <button
                    onClick={() => void runSuggestionPreview()}
                    disabled={suggestionsLoading}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {suggestionsLoading
                      ? "Simulation..."
                      : "Simuler regroupement"}
                  </button>
                </div>
                <div className="mt-3 rounded border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
                  <p>
                    <strong>Stratégie de groupement:</strong>{" "}
                    <code>parent_sku</code> est la plus stable sur vos données
                    legacy.
                  </p>
                  <p>
                    <strong>Politique publication:</strong> utilisez{" "}
                    <code>publish_without_price</code> pour CTA &quot;demande de
                    prix&quot;.
                  </p>
                  <p>
                    <strong>Seuil confiance:</strong> en dessous du seuil,
                    l&apos;item est routé vers la queue <code>need_check</code>.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <h2 className="mb-3 text-sm font-semibold text-gray-900">
                  Centre de contrôle IA
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-600">Modèle extraction</span>
                    <input
                      type="text"
                      value={cfg(
                        "df_ai_model_extract",
                        "claude-haiku-4-5-20251001",
                      )}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          df_ai_model_extract: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-600">Modèle normalisation</span>
                    <input
                      type="text"
                      value={cfg("df_ai_model_normalize", "claude-sonnet-4-6")}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          df_ai_model_normalize: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-gray-600">Prompt extraction</span>
                    <textarea
                      rows={3}
                      value={cfg(
                        "df_ai_prompt_extract",
                        "Extraire SKU, désignation, prix, logistique, options, taxes.",
                      )}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          df_ai_prompt_extract: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-gray-600">Prompt normalisation</span>
                    <textarea
                      rows={3}
                      value={cfg(
                        "df_ai_prompt_normalize",
                        "Construire mère/filles, distinguer axes prix-impact et non-prix, signaler need_check.",
                      )}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          df_ai_prompt_normalize: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-600">Input tok/item</span>
                    <input
                      type="number"
                      min={1}
                      value={cfg("df_cost_input_tokens_per_item", "900")}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          df_cost_input_tokens_per_item: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-600">Output tok/item</span>
                    <input
                      type="number"
                      min={1}
                      value={cfg("df_cost_output_tokens_per_item", "300")}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          df_cost_output_tokens_per_item: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-600">€/1M input</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={cfg("df_cost_input_per_million", "1")}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          df_cost_input_per_million: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-600">€/1M output</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={cfg("df_cost_output_per_million", "5")}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          df_cost_output_per_million: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-blue-900">
                      Calculer le prix d&apos;un batch IA
                    </p>
                    <input
                      type="number"
                      min={1}
                      value={batchSize}
                      onChange={(e) =>
                        setBatchSize(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="w-28 rounded border border-blue-300 bg-white px-2 py-1 text-right text-sm"
                    />
                  </div>
                  <div className="grid gap-2 text-sm text-blue-900 md:grid-cols-3">
                    <p>
                      Input estimé:{" "}
                      <strong>{fmtMoney(estimatedCost.inputCost)}</strong>
                    </p>
                    <p>
                      Output estimé:{" "}
                      <strong>{fmtMoney(estimatedCost.outputCost)}</strong>
                    </p>
                    <p>
                      Total estimé:{" "}
                      <strong>{fmtMoney(estimatedCost.total)}</strong>
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    onClick={() => void saveConfigGroup(AI_KEYS)}
                    disabled={configSavingKey !== null || configLoading}
                    className="rounded-lg bg-[#cc1818] px-3 py-2 text-sm font-semibold text-white hover:bg-[#aa1414] disabled:opacity-60"
                  >
                    Sauver configuration IA
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <h2 className="mb-2 text-sm font-semibold text-gray-900">
                  Prévisualisation suggestions
                </h2>
                {suggestions.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Lance une simulation pour afficher les regroupements
                    proposés.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {suggestions.slice(0, 8).map((suggestion, index) => (
                      <div
                        key={`${suggestion.parent.id}-${index}`}
                        className="rounded-md border border-gray-200 p-3"
                      >
                        <p className="text-sm font-medium text-gray-900">
                          {suggestion.parent.name} ({suggestion.children.length}{" "}
                          enfants)
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Strategy: {suggestion.strategy} · Score:{" "}
                          {suggestion.score.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-indigo-200 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-indigo-900">
                      Générateur PUID — Workflow en 4 étapes
                    </h2>
                    <p className="text-xs text-indigo-700">
                      1) Prévisualiser · 2) Dry-run · 3) Backup · 4) Appliquer /
                      Rollback
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <label className="flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-indigo-700">
                      <input
                        type="checkbox"
                        checked={puidIncludeDraft}
                        onChange={(e) => setPuidIncludeDraft(e.target.checked)}
                      />
                      Inclure brouillons
                    </label>
                    <label className="flex items-center gap-1 text-gray-600">
                      Limite
                      <input
                        type="number"
                        min={20}
                        max={3000}
                        value={puidLimit}
                        onChange={(e) =>
                          setPuidLimit(
                            Math.max(
                              20,
                              Math.min(3000, Number(e.target.value) || 20),
                            ),
                          )
                        }
                        className="w-20 rounded border border-gray-300 px-2 py-1"
                      />
                    </label>
                  </div>
                </div>

                {/* Options */}
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <label className="flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-gray-700">
                    <input
                      type="checkbox"
                      checked={puidApplyToSku}
                      onChange={(e) => setPuidApplyToSku(e.target.checked)}
                    />
                    Remplacer aussi les SKU
                  </label>
                  <label className="flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-gray-700">
                    <input
                      type="checkbox"
                      checked={puidCleanupLots}
                      onChange={(e) => setPuidCleanupLots(e.target.checked)}
                    />
                    Passer lots en brouillon
                  </label>
                </div>

                {/* Étape 1 + 2 */}
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => void runPuidPreview()}
                    disabled={puidPreviewLoading}
                    className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                  >
                    {puidPreviewLoading ? "Analyse..." : "① Prévisualiser"}
                  </button>
                  <button
                    onClick={() => void runPuidDryRun()}
                    disabled={puidDryRunLoading || puidPreview == null}
                    className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                    title="Simule l'apply sans écriture en base — vérifie les conflits SKU"
                  >
                    {puidDryRunLoading
                      ? "Dry-run..."
                      : "② Dry-run (simuler apply)"}
                  </button>
                </div>

                {/* Dry-run result */}
                {puidDryRunResult && (
                  <div className="mb-3 rounded border border-blue-200 bg-blue-50 p-3 text-xs">
                    <p className="font-semibold text-blue-900 mb-1">
                      Résultat dry-run :
                    </p>
                    <div className="grid grid-cols-2 gap-1 text-blue-800 sm:grid-cols-4">
                      <span>
                        Produits à modifier:{" "}
                        <strong>
                          {puidDryRunResult.apply?.products_planned ?? 0}
                        </strong>
                      </span>
                      <span>
                        Variantes à modifier:{" "}
                        <strong>
                          {puidDryRunResult.apply?.variants_planned ?? 0}
                        </strong>
                      </span>
                      <span>
                        Conflits SKU produits:{" "}
                        <strong>
                          {(
                            puidDryRunResult.apply
                              ?.product_sku_conflicts as unknown[]
                          )?.length ?? 0}
                        </strong>
                      </span>
                      <span>
                        Conflits SKU variantes:{" "}
                        <strong>
                          {(
                            puidDryRunResult.apply
                              ?.variant_sku_conflicts as unknown[]
                          )?.length ?? 0}
                        </strong>
                      </span>
                    </div>
                  </div>
                )}

                {/* Étape 3 + 4 */}
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => void downloadBackup()}
                    disabled={puidBackupLoading}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                    title="Télécharge l'état actuel puid/sku avant toute modification"
                  >
                    {puidBackupLoading
                      ? "Sauvegarde..."
                      : "③ Backup (télécharger état actuel)"}
                  </button>
                  <button
                    onClick={() => void applyPuid()}
                    disabled={puidApplyLoading || puidPreview == null}
                    className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    title="Apply global — écriture en base. Faire backup d'abord."
                  >
                    {puidApplyLoading
                      ? "Application..."
                      : "④ Appliquer PUID (global)"}
                  </button>
                </div>

                {/* Rollback */}
                <div className="mb-4 rounded border border-red-100 bg-red-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-red-800">
                    Rollback — Restaurer depuis backup
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void restoreFromFile(f);
                      }}
                      className="max-w-xs rounded border border-red-200 bg-white px-2 py-1 text-xs"
                    />
                    {puidRestoreLoading && (
                      <span className="text-xs text-red-700">
                        Restauration en cours...
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-red-600">
                    Sélectionner un fichier backup JSON pour restaurer les
                    PUID/SKU précédents.
                  </p>
                </div>

                {/* Assemblage familles depuis PUID */}
                <div className="rounded border border-green-200 bg-green-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-green-900">
                    Assemblage auto mère/filles depuis PUID root
                  </p>
                  <p className="mb-2 text-[11px] text-green-700">
                    Regroupe les produits partageant le même puid_root en
                    familles (mère + filles).
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void runAssembleFamilies(false)}
                      disabled={puidAssembleLoading}
                      className="rounded border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-60"
                    >
                      {puidAssembleLoading
                        ? "Analyse..."
                        : "Simuler assemblage"}
                    </button>
                    <button
                      onClick={() => void runAssembleFamilies(true)}
                      disabled={puidAssembleLoading || puidAssemblePlan == null}
                      className="rounded bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                    >
                      {puidAssembleLoading
                        ? "Assemblage..."
                        : "Appliquer assemblage"}
                    </button>
                  </div>
                  {puidAssemblePlan && (
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-green-800 sm:grid-cols-5">
                      <span>
                        Produits PUID:{" "}
                        <strong>
                          {puidAssemblePlan.stats
                            ?.total_products_with_puid_root ?? 0}
                        </strong>
                      </span>
                      <span>
                        Racines uniques:{" "}
                        <strong>
                          {puidAssemblePlan.stats?.unique_roots ?? 0}
                        </strong>
                      </span>
                      <span>
                        Familles à créer:{" "}
                        <strong>
                          {puidAssemblePlan.stats?.to_create ?? 0}
                        </strong>
                      </span>
                      <span>
                        Déjà existantes:{" "}
                        <strong>
                          {puidAssemblePlan.stats?.skip_existing ?? 0}
                        </strong>
                      </span>
                      <span>
                        Ignorées (1 seul):{" "}
                        <strong>
                          {puidAssemblePlan.stats?.skip_single ?? 0}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>

                {!puidPreview ? (
                  <p className="mt-3 text-xs text-gray-500">
                    Lancez une prévisualisation pour vérifier la structure
                    racine → embranchements.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-5">
                      <div className="rounded border border-gray-200 bg-gray-50 p-2">
                        <p className="text-[11px] text-gray-500">
                          Produits analysés
                        </p>
                        <p className="text-lg font-semibold text-gray-900">
                          {puidPreview.scope.total_products}
                        </p>
                      </div>
                      <div className="rounded border border-gray-200 bg-gray-50 p-2">
                        <p className="text-[11px] text-gray-500">
                          Variantes analysées
                        </p>
                        <p className="text-lg font-semibold text-gray-900">
                          {puidPreview.scope.total_variants}
                        </p>
                      </div>
                      <div className="rounded border border-gray-200 bg-gray-50 p-2">
                        <p className="text-[11px] text-gray-500">Suggestions</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {puidPreview.scope.total_suggestions}
                        </p>
                      </div>
                      <div className="rounded border border-gray-200 bg-gray-50 p-2">
                        <p className="text-[11px] text-gray-500">Collisions</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {puidPreview.scope.collisions}
                        </p>
                      </div>
                      <div className="rounded border border-amber-200 bg-amber-50 p-2">
                        <p className="text-[11px] text-amber-700">
                          Lignes lot détectées
                        </p>
                        <p className="text-lg font-semibold text-amber-800">
                          {puidPreview.scope.lot_candidates}
                        </p>
                      </div>
                    </div>

                    <div className="rounded border border-gray-200">
                      <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700">
                        Exemples variantes (racine / branche prix / branche
                        style)
                      </div>
                      <div className="max-h-64 overflow-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-white text-left text-[11px] text-gray-500">
                            <tr>
                              <th className="px-3 py-2">PUID proposé</th>
                              <th className="px-3 py-2">Source SKU</th>
                              <th className="px-3 py-2">Branche prix</th>
                              <th className="px-3 py-2">Branche style</th>
                              <th className="px-3 py-2">Confiance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {puidPreview.variants.slice(0, 20).map((row) => (
                              <tr key={row.id}>
                                <td className="px-3 py-2 font-mono text-indigo-700">
                                  {row.suggested_puid}
                                </td>
                                <td className="px-3 py-2 text-gray-500">
                                  {row.source_sku ?? "—"}
                                </td>
                                <td className="px-3 py-2 text-gray-700">
                                  {row.price_branch ?? "BASE"}
                                </td>
                                <td className="px-3 py-2 text-gray-500">
                                  {row.style_branch ?? "—"}
                                </td>
                                <td className="px-3 py-2 text-gray-600">
                                  {Math.round(row.confidence * 100)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === "families" && (
            <section className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => void loadFamilyAudit()}
                  disabled={familyAuditLoading}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {familyAuditLoading
                    ? "Analyse..."
                    : "Relancer audit mères/filles"}
                </button>
                <Link
                  href="/admin/familles"
                  className="rounded-lg bg-[#cc1818] px-3 py-2 text-sm font-semibold text-white hover:bg-[#aa1414]"
                >
                  Ouvrir module mères/filles
                </Link>
              </div>

              {!familyAudit ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                  Audit indisponible.
                </div>
              ) : (
                <>
                  {familyAudit.scope?.mode === "latest_import" && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                      Scope actif: dernier import
                      {familyAudit.scope.since
                        ? ` (depuis ${fmtDate(familyAudit.scope.since)})`
                        : ""}
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Familles actives</p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {familyAudit.total_active_families}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">
                        Candidats en attente
                      </p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {familyAudit.pending_candidates}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">
                        Suggestions potentielles
                      </p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {familyAudit.potential_suggestions ?? 0}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Issues audit</p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {familyAudit.issues}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="mb-2 text-sm font-semibold text-gray-800">
                        Parents sans enfants
                      </p>
                      {familyAudit.parents_without_children.length === 0 ? (
                        <p className="text-xs text-gray-500">Aucun.</p>
                      ) : (
                        <ul className="space-y-1 text-xs text-gray-700">
                          {familyAudit.parents_without_children
                            .slice(0, 8)
                            .map((row) => (
                              <li key={row.id}>{row.name}</li>
                            ))}
                        </ul>
                      )}
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="mb-2 text-sm font-semibold text-gray-800">
                        Orphelins parent_sku
                      </p>
                      {familyAudit.orphan_products.length === 0 ? (
                        <p className="text-xs text-gray-500">Aucun.</p>
                      ) : (
                        <ul className="space-y-1 text-xs text-gray-700">
                          {familyAudit.orphan_products
                            .slice(0, 8)
                            .map((row) => (
                              <li key={row.id}>
                                {row.name}{" "}
                                <span className="text-gray-400">
                                  ({row.parent_sku})
                                </span>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="mb-2 text-sm font-semibold text-gray-800">
                        Familles volumineuses
                      </p>
                      {familyAudit.large_families.length === 0 ? (
                        <p className="text-xs text-gray-500">Aucune.</p>
                      ) : (
                        <ul className="space-y-1 text-xs text-gray-700">
                          {familyAudit.large_families.slice(0, 8).map((row) => (
                            <li key={row.id}>
                              {row.name} · {row.count} membres
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {activeTab === "pricing" && (
            <section className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Produits analysés</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {pricingSummary.total}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Publiés</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {pricingSummary.published}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Promo active</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {pricingSummary.promoActive}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">PBQ activé</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {pricingSummary.pbqEnabled}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Dégressif</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {pricingSummary.degressive}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Prix manquant</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {pricingSummary.missingPrice}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/catalogue"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Ouvrir Vue Excel
                </Link>
                <Link
                  href="/admin/produits"
                  className="rounded-lg bg-[#cc1818] px-3 py-2 text-sm font-semibold text-white hover:bg-[#aa1414]"
                >
                  Ouvrir Produits
                </Link>
              </div>

              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Produit</th>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2 text-right">Prix</th>
                      <th className="px-3 py-2">Type pricing</th>
                      <th className="px-3 py-2">MAJ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {products.slice(0, 20).map((product) => (
                      <tr key={product.id}>
                        <td className="px-3 py-2 text-gray-800">
                          {product.name}
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {product.sku ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {typeof product.regular_price === "number"
                            ? fmtMoney(product.regular_price)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {product.pbq_pricing_type ?? "flat"}
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {product.updated_at
                            ? fmtDate(product.updated_at)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "validation" && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Queue need_check: {validationQueue.length} produit(s)
                  </p>
                  <p className="text-xs text-gray-500">
                    Règles basées sur prix/description/SKU/famille/catégorie.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void loadProducts()}
                    disabled={productsLoading}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    Recharger queue
                  </button>
                  <Link
                    href="/admin/produits"
                    className="rounded-lg bg-[#cc1818] px-3 py-2 text-sm font-semibold text-white hover:bg-[#aa1414]"
                  >
                    Corriger dans Produits
                  </Link>
                </div>
              </div>

              {productsLoading ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                  Chargement queue validation...
                </div>
              ) : validationQueue.length === 0 ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-sm text-green-700">
                  Aucun blocage détecté sur l&apos;échantillon courant.
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs text-gray-500">
                      <tr>
                        <th className="px-3 py-2">Produit</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Statut</th>
                        <th className="px-3 py-2">Raisons</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {validationQueue.map((entry) => (
                        <tr key={entry.product.id}>
                          <td className="px-3 py-2 text-gray-800">
                            <Link
                              href={`/admin/produits/${entry.product.id}`}
                              className="hover:underline"
                            >
                              {entry.product.name}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {entry.product.sku ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {entry.product.status}
                          </td>
                          <td className="px-3 py-2 text-xs text-red-700">
                            {entry.reasons.join(" · ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
