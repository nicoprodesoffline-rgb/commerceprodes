"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { adminFetch } from "lib/admin/fetch";

type PricingAttribute = {
  id: string;
  name: string;
  slug: string | null;
  terms: string[];
  impacts_price: boolean;
  auto_impacts_price: boolean;
};

type TierRow = {
  min_quantity: number;
  max_quantity: number | null;
  value: number;
};

type NormalPricingPayload = {
  mode: "flat" | "degressive";
  regular_price: number | null;
  sale_price: number | null;
  sale_price_start: string | null;
  sale_price_end: string | null;
  pbq_pricing_type: "fixed" | "percentage" | null;
  tiers: TierRow[];
};

type PromotionLayer = {
  id: string;
  pricing_profile_id: string | null;
  label: string;
  mode:
    | "lot"
    | "unit_flat_discount"
    | "unit_percent_discount"
    | "unit_sale_price";
  discount_amount: number | null;
  discount_percent: number | null;
  override_unit_price_ht: number | null;
  force_promotions_category: boolean;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  position: number;
  is_active_now: boolean;
  meta?: Record<string, unknown>;
};

type LotOffer = {
  id: string;
  pricing_profile_id: string;
  label: string;
  paid_units: number;
  bonus_units: number;
  lot_price_ht: number;
  eco_included: boolean;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  position: number;
};

type LotProfile = {
  id: string;
  product_id: string;
  profile_key: string;
  label: string;
  applies_to: "variant" | "family" | "product";
  axis: Record<string, string>;
  active: boolean;
  position: number;
  offers: LotOffer[];
};

type BranchCandidate = {
  prefix: string;
  root: string;
  branch: string;
  sampleSkus: string[];
  count: number;
};

type PromoModeDraft = "flat" | "degressive" | "lot";

const modeLabel: Record<PromotionLayer["mode"], string> = {
  lot: "Lots",
  unit_flat_discount: "Remise unitaire (€)",
  unit_percent_discount: "Remise unitaire (%)",
  unit_sale_price: "Prix unitaire promo",
};

function localIso(dt: string | null): string {
  if (!dt) return "";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
}

function toNumberOrNull(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function defaultTierRows(): TierRow[] {
  return [
    { min_quantity: 2, max_quantity: 5, value: 0 },
    { min_quantity: 6, max_quantity: 10, value: 0 },
  ];
}

function defaultLotRows() {
  return [
    {
      label: "Lot 20",
      paid_units: 20,
      bonus_units: 0,
      lot_price_ht: 0,
      eco_included: true,
    },
  ];
}

function normalizeProfileKey(prefix: string): string {
  return prefix
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseSkuPrefix(
  raw: string,
): { prefix: string; root: string; branch: string } | null {
  const clean = String(raw || "")
    .trim()
    .toUpperCase();
  if (!clean) return null;
  const beforeDot = clean.split(".")[0]?.trim() || "";
  if (!beforeDot) return null;
  const tokens = beforeDot
    .split("-")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;
  const rootTokens =
    tokens.length >= 3 ? tokens.slice(0, 3) : tokens.slice(0, 1);
  return {
    prefix: beforeDot,
    root: rootTokens.join("-"),
    branch: tokens.slice(rootTokens.length).join("-"),
  };
}

export function PricingGovernanceCard({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"normal" | "promo">("normal");

  const [attributes, setAttributes] = useState<PricingAttribute[]>([]);
  const [selectedAttributeIds, setSelectedAttributeIds] = useState<Set<string>>(
    new Set(),
  );
  const [autoSuggestedIds, setAutoSuggestedIds] = useState<Set<string>>(
    new Set(),
  );
  const [savingAttrs, setSavingAttrs] = useState(false);

  const [normalMode, setNormalMode] = useState<"flat" | "degressive">("flat");
  const [normalRegularPrice, setNormalRegularPrice] = useState("");
  const [normalSalePrice, setNormalSalePrice] = useState("");
  const [normalDegressiveType, setNormalDegressiveType] = useState<
    "fixed" | "percentage"
  >("fixed");
  const [normalTiers, setNormalTiers] = useState<TierRow[]>(defaultTierRows());
  const [savingNormal, setSavingNormal] = useState(false);

  const [layers, setLayers] = useState<PromotionLayer[]>([]);
  const [lotProfiles, setLotProfiles] = useState<LotProfile[]>([]);
  const [branchCandidates, setBranchCandidates] = useState<BranchCandidate[]>(
    [],
  );

  const [promoLabel, setPromoLabel] = useState("Promo commerciale");
  const [promoStartsAt, setPromoStartsAt] = useState("");
  const [promoEndsAt, setPromoEndsAt] = useState("");
  const [promoMode, setPromoMode] = useState<PromoModeDraft>("flat");
  const [promoFlatPrice, setPromoFlatPrice] = useState("");
  const [promoDegressiveType, setPromoDegressiveType] = useState<
    "fixed" | "percentage"
  >("fixed");
  const [promoDegressiveTiers, setPromoDegressiveTiers] =
    useState<TierRow[]>(defaultTierRows());
  const [promoLotSkuInput, setPromoLotSkuInput] = useState("");
  const [promoLotPrefix, setPromoLotPrefix] = useState("");
  const [promoLotBranchUnitPrice, setPromoLotBranchUnitPrice] = useState("");
  const [promoLotRows, setPromoLotRows] = useState(defaultLotRows());
  const [creatingPromo, setCreatingPromo] = useState(false);

  const hasPromoConfigured = layers.length > 0;
  const activeNow = useMemo(
    () => layers.find((l) => l.is_active_now && l.active) ?? null,
    [layers],
  );
  const selectedBranch = useMemo(
    () =>
      branchCandidates.find((branch) => branch.prefix === promoLotPrefix) ??
      null,
    [branchCandidates, promoLotPrefix],
  );
  const parsedLotSku = useMemo(
    () => parseSkuPrefix(promoLotSkuInput),
    [promoLotSkuInput],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [attrRes, normalRes, promoRes, lotRes] = await Promise.all([
        adminFetch(`/api/admin/products/${productId}/pricing-attributes`),
        adminFetch(`/api/admin/products/${productId}/normal-pricing`),
        adminFetch(`/api/admin/products/${productId}/promotions`),
        adminFetch(`/api/admin/products/${productId}/lot-pricing`),
      ]);

      const attrJson = await attrRes.json().catch(() => ({}));
      const normalJson = await normalRes.json().catch(() => ({}));
      const promoJson = await promoRes.json().catch(() => ({}));
      const lotJson = await lotRes.json().catch(() => ({}));

      if (!attrRes.ok) {
        setError(attrJson.error ?? "Erreur chargement attributs");
      } else {
        const attrs: PricingAttribute[] = attrJson.attributes ?? [];
        setAttributes(attrs);
        setSelectedAttributeIds(
          new Set(
            attrJson.selected_attribute_ids ??
              attrs.filter((a) => a.impacts_price).map((a) => a.id),
          ),
        );
        setAutoSuggestedIds(
          new Set(
            attrJson.auto_suggested_attribute_ids ??
              attrs.filter((a) => a.auto_impacts_price).map((a) => a.id),
          ),
        );
      }

      if (!normalRes.ok) {
        setError(
          (prev) =>
            prev ?? normalJson.error ?? "Erreur chargement tarif normal",
        );
      } else {
        setNormalMode(normalJson.mode === "degressive" ? "degressive" : "flat");
        setNormalRegularPrice(
          normalJson.regular_price != null
            ? String(normalJson.regular_price)
            : "",
        );
        setNormalSalePrice(
          normalJson.sale_price != null ? String(normalJson.sale_price) : "",
        );
        setNormalDegressiveType(
          normalJson.pbq_pricing_type === "percentage" ? "percentage" : "fixed",
        );
        const tiers = Array.isArray(normalJson.tiers)
          ? (normalJson.tiers as TierRow[])
          : [];
        setNormalTiers(tiers.length > 0 ? tiers : defaultTierRows());
      }

      if (!promoRes.ok) {
        setError(
          (prev) => prev ?? promoJson.error ?? "Erreur chargement promos",
        );
      } else {
        setLayers(promoJson.layers ?? []);
      }

      if (!lotRes.ok) {
        setError((prev) => prev ?? lotJson.error ?? "Erreur chargement lots");
      } else {
        const profiles: LotProfile[] = lotJson.profiles ?? [];
        const branches: BranchCandidate[] = lotJson.branch_candidates ?? [];
        setLotProfiles(profiles);
        setBranchCandidates(branches);
        if (branches.length > 0) {
          setPromoLotPrefix((prev) => prev || branches[0]!.prefix);
          setPromoLotSkuInput((prev) => prev || branches[0]!.prefix);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveAttributes() {
    setSavingAttrs(true);
    setError(null);
    try {
      const res = await adminFetch(
        `/api/admin/products/${productId}/pricing-attributes`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attribute_ids: [...selectedAttributeIds] }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Impossible d'enregistrer les attributs");
      } else {
        await load();
      }
    } finally {
      setSavingAttrs(false);
    }
  }

  async function saveNormalPricing() {
    setSavingNormal(true);
    setError(null);
    try {
      const payload: NormalPricingPayload = {
        mode: normalMode,
        regular_price: toNumberOrNull(normalRegularPrice),
        sale_price: toNumberOrNull(normalSalePrice),
        sale_price_start: null,
        sale_price_end: null,
        pbq_pricing_type:
          normalMode === "degressive" ? normalDegressiveType : null,
        tiers:
          normalMode === "degressive"
            ? normalTiers
                .map((row) => ({
                  min_quantity: Math.max(1, Math.round(row.min_quantity || 1)),
                  max_quantity:
                    row.max_quantity != null
                      ? Math.max(1, Math.round(row.max_quantity))
                      : null,
                  value: Number(row.value || 0),
                }))
                .sort((a, b) => a.min_quantity - b.min_quantity)
            : [],
      };

      const res = await adminFetch(
        `/api/admin/products/${productId}/normal-pricing`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Impossible d'enregistrer le tarif normal");
      } else {
        await load();
      }
    } finally {
      setSavingNormal(false);
    }
  }

  async function toggleLayer(layer: PromotionLayer, active: boolean) {
    const res = await adminFetch(
      `/api/admin/products/${productId}/promotions`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: layer.id, active }),
      },
    );
    if (res.ok) await load();
  }

  async function deleteLayer(layer: PromotionLayer) {
    if (!confirm(`Supprimer la couche "${layer.label}" ?`)) return;
    const res = await adminFetch(
      `/api/admin/products/${productId}/promotions?layerId=${layer.id}`,
      { method: "DELETE" },
    );
    if (res.ok) await load();
  }

  async function ensureLotProfile(prefix: string): Promise<string> {
    const key = normalizeProfileKey(prefix);
    const existing = lotProfiles.find(
      (p) => normalizeProfileKey(p.profile_key) === key,
    );
    if (existing) return existing.id;

    const created = await adminFetch(
      `/api/admin/products/${productId}/lot-pricing`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "profile",
          profile_key: key,
          label: `Branche ${prefix}`,
          applies_to: "product",
          axis: { sku_prefix: prefix },
        }),
      },
    );
    const json = await created.json().catch(() => ({}));
    if (!created.ok || !json.id) {
      throw new Error(json.error ?? "Impossible de créer le profil lot");
    }
    return String(json.id);
  }

  async function createPromoLayer() {
    setCreatingPromo(true);
    setError(null);
    try {
      const startsAt = promoStartsAt
        ? new Date(promoStartsAt).toISOString()
        : null;
      const endsAt = promoEndsAt ? new Date(promoEndsAt).toISOString() : null;

      if (promoMode === "flat") {
        const price = toNumberOrNull(promoFlatPrice);
        if (price == null)
          throw new Error("Renseignez un prix promo unitaire.");
        const res = await adminFetch(
          `/api/admin/products/${productId}/promotions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              label: promoLabel,
              mode: "unit_sale_price",
              override_unit_price_ht: price,
              starts_at: startsAt,
              ends_at: endsAt,
              active: true,
            }),
          },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(json.error ?? "Création promo flat impossible");
      }

      if (promoMode === "degressive") {
        const tiers = promoDegressiveTiers
          .map((row) => ({
            min_quantity: Math.max(1, Math.round(row.min_quantity || 1)),
            max_quantity:
              row.max_quantity != null
                ? Math.max(1, Math.round(row.max_quantity))
                : null,
            value: Number(row.value || 0),
          }))
          .sort((a, b) => a.min_quantity - b.min_quantity);
        if (tiers.length === 0)
          throw new Error("Ajoutez au moins un palier promo.");

        const res = await adminFetch(
          `/api/admin/products/${productId}/promotions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              label: promoLabel,
              mode: "unit_sale_price",
              override_unit_price_ht: null,
              starts_at: startsAt,
              ends_at: endsAt,
              active: true,
              meta: {
                pricing_mode: "degressive",
                pbq_pricing_type: promoDegressiveType,
                tiers,
              },
            }),
          },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(json.error ?? "Création promo dégressive impossible");
      }

      if (promoMode === "lot") {
        if (!promoLotPrefix) throw new Error("Choisissez un préfixe SKU.");
        const branchUnitPrice = toNumberOrNull(promoLotBranchUnitPrice);
        if (branchUnitPrice == null)
          throw new Error("Renseignez le prix unitaire de la branche.");
        const lotRows = promoLotRows
          .map((row) => ({
            label: row.label.trim(),
            paid_units: Math.max(1, Math.round(row.paid_units || 1)),
            bonus_units: Math.max(0, Math.round(row.bonus_units || 0)),
            lot_price_ht: Number(row.lot_price_ht || 0),
            eco_included: row.eco_included !== false,
          }))
          .filter((row) => row.label && Number.isFinite(row.lot_price_ht));
        if (lotRows.length === 0)
          throw new Error("Ajoutez au moins un lot valide.");

        const profileId = await ensureLotProfile(promoLotPrefix);
        for (const row of lotRows) {
          const offerRes = await adminFetch(
            `/api/admin/products/${productId}/lot-pricing`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                kind: "offer",
                pricing_profile_id: profileId,
                label: row.label,
                paid_units: row.paid_units,
                bonus_units: row.bonus_units,
                lot_price_ht: row.lot_price_ht,
                eco_included: row.eco_included,
              }),
            },
          );
          const offerJson = await offerRes.json().catch(() => ({}));
          if (!offerRes.ok) {
            throw new Error(offerJson.error ?? `Lot "${row.label}" invalide`);
          }
        }

        const layerRes = await adminFetch(
          `/api/admin/products/${productId}/promotions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              label: promoLabel,
              mode: "lot",
              pricing_profile_id: profileId,
              starts_at: startsAt,
              ends_at: endsAt,
              active: true,
              meta: {
                pricing_mode: "lot",
                sku_prefix: promoLotPrefix,
                branch_unit_price_ht: branchUnitPrice,
              },
            }),
          },
        );
        const layerJson = await layerRes.json().catch(() => ({}));
        if (!layerRes.ok) {
          throw new Error(layerJson.error ?? "Création promo lot impossible");
        }
      }

      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur création promo");
    } finally {
      setCreatingPromo(false);
    }
  }

  function setTierValue(
    setter: Dispatch<SetStateAction<TierRow[]>>,
    index: number,
    patch: Partial<TierRow>,
  ) {
    setter((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addTier(setter: Dispatch<SetStateAction<TierRow[]>>) {
    setter((prev) => [
      ...prev,
      {
        min_quantity:
          prev.length > 0
            ? prev[prev.length - 1]!.max_quantity ||
              prev[prev.length - 1]!.min_quantity + 1
            : 2,
        max_quantity: null,
        value: 0,
      },
    ]);
  }

  return (
    <section className="rounded-lg border border-purple-200 bg-white">
      <div className="border-b border-purple-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-800">
          Tarification commerciale
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Normal: flat ou dégressif. Promotions: flat, dégressif ou lots.
        </p>
      </div>

      <div className="border-b border-gray-100 px-5 pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("normal")}
            className={`rounded-t-md border px-3 py-1.5 text-xs font-medium ${
              tab === "normal"
                ? "border-purple-300 border-b-white bg-white text-purple-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Tarif normal
          </button>
          <button
            type="button"
            onClick={() => setTab("promo")}
            className={`rounded-t-md border px-3 py-1.5 text-xs font-medium ${
              tab === "promo"
                ? "border-purple-300 border-b-white bg-white text-purple-700"
                : hasPromoConfigured
                  ? "border-transparent text-gray-500 hover:text-gray-700"
                  : "border-transparent text-gray-400"
            }`}
          >
            Tarif promo {!hasPromoConfigured && "· inactif"}
          </button>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {loading && <p className="text-xs text-gray-400">Chargement…</p>}
        {error && (
          <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">
            {error}
          </p>
        )}

        {tab === "normal" && (
          <>
            <div className="rounded-md border border-gray-100 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Embranchements qui changent le prix
                </h3>
                <button
                  onClick={() =>
                    setSelectedAttributeIds(new Set(autoSuggestedIds))
                  }
                  className="text-xs text-purple-600 hover:text-purple-800"
                  type="button"
                >
                  Suggestion auto
                </button>
              </div>

              <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                {attributes.map((attr) => (
                  <label
                    key={attr.id}
                    className="flex items-center gap-2 text-xs text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAttributeIds.has(attr.id)}
                      onChange={(e) =>
                        setSelectedAttributeIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(attr.id);
                          else next.delete(attr.id);
                          return next;
                        })
                      }
                    />
                    <span className="font-medium">{attr.name}</span>
                    {attr.auto_impacts_price && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                        auto
                      </span>
                    )}
                  </label>
                ))}
              </div>

              <button
                onClick={saveAttributes}
                disabled={savingAttrs}
                className="mt-2 rounded-md border border-purple-300 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-60"
                type="button"
              >
                {savingAttrs ? "Enregistrement…" : "Enregistrer les axes"}
              </button>
            </div>

            <div className="rounded-md border border-gray-100 p-3">
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Mode tarif normal
                </label>
                <select
                  value={normalMode}
                  onChange={(e) =>
                    setNormalMode(e.target.value as "flat" | "degressive")
                  }
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs"
                >
                  <option value="flat">Flat</option>
                  <option value="degressive">Dégressif</option>
                </select>
              </div>

              {normalMode === "flat" && (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">
                      Prix unitaire base (HT)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={normalRegularPrice}
                      onChange={(e) => setNormalRegularPrice(e.target.value)}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">
                      Prix promo unitaire (HT)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={normalSalePrice}
                      onChange={(e) => setNormalSalePrice(e.target.value)}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs"
                    />
                  </div>
                </div>
              )}

              {normalMode === "degressive" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">
                        Prix unitaire base (HT)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={normalRegularPrice}
                        onChange={(e) => setNormalRegularPrice(e.target.value)}
                        className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">
                        Type de dégressif
                      </label>
                      <select
                        value={normalDegressiveType}
                        onChange={(e) =>
                          setNormalDegressiveType(
                            e.target.value as "fixed" | "percentage",
                          )
                        }
                        className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs"
                      >
                        <option value="fixed">Somme fixe</option>
                        <option value="percentage">Pourcentage</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {normalTiers.map((row, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-12 gap-2 rounded border border-gray-100 p-2"
                      >
                        <div className="col-span-3">
                          <label className="mb-1 block text-[11px] text-gray-500">
                            Qté min
                          </label>
                          <input
                            type="number"
                            value={row.min_quantity}
                            onChange={(e) =>
                              setTierValue(setNormalTiers, idx, {
                                min_quantity: Math.max(
                                  1,
                                  Number(e.target.value || 1),
                                ),
                              })
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="mb-1 block text-[11px] text-gray-500">
                            Qté max
                          </label>
                          <input
                            type="number"
                            value={row.max_quantity ?? ""}
                            onChange={(e) =>
                              setTierValue(setNormalTiers, idx, {
                                max_quantity: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              })
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                          />
                        </div>
                        <div className="col-span-4">
                          <label className="mb-1 block text-[11px] text-gray-500">
                            Valeur (
                            {normalDegressiveType === "percentage" ? "%" : "€"})
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={row.value}
                            onChange={(e) =>
                              setTierValue(setNormalTiers, idx, {
                                value: Number(e.target.value || 0),
                              })
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                          />
                        </div>
                        <div className="col-span-2 flex items-end justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              setNormalTiers((prev) =>
                                prev.filter((_, i) => i !== idx),
                              )
                            }
                            className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
                          >
                            Suppr.
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addTier(setNormalTiers)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      + Ajouter palier
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={saveNormalPricing}
                disabled={savingNormal}
                className="mt-3 rounded bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-60"
                type="button"
              >
                {savingNormal ? "Enregistrement…" : "Enregistrer tarif normal"}
              </button>
            </div>
          </>
        )}

        {tab === "promo" && (
          <>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Promos existantes
              </h3>
              {activeNow ? (
                <p className="mb-2 rounded bg-green-50 px-2 py-1 text-xs text-green-700">
                  Active: {activeNow.label} ({modeLabel[activeNow.mode]})
                </p>
              ) : (
                <p className="mb-2 rounded bg-gray-50 px-2 py-1 text-xs text-gray-500">
                  Aucune promo active
                </p>
              )}

              <div className="space-y-2">
                {layers.map((layer) => (
                  <div
                    key={layer.id}
                    className="rounded-md border border-gray-100 p-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-800">
                          {layer.label}
                        </p>
                        <p className="text-gray-500">{modeLabel[layer.mode]}</p>
                        {layer.meta &&
                          String((layer.meta as any).pricing_mode || "") ===
                            "degressive" && (
                            <p className="text-[11px] text-indigo-600">
                              Dégressif promo (
                              {String(
                                (layer.meta as any).pbq_pricing_type || "fixed",
                              )}
                              )
                            </p>
                          )}
                        {layer.meta &&
                          String((layer.meta as any).pricing_mode || "") ===
                            "lot" && (
                            <p className="text-[11px] text-indigo-600">
                              Préfixe:{" "}
                              {String((layer.meta as any).sku_prefix || "—")}
                            </p>
                          )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleLayer(layer, !layer.active)}
                          className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:bg-gray-50"
                          type="button"
                        >
                          {layer.active ? "Désactiver" : "Activer"}
                        </button>
                        <button
                          onClick={() => deleteLayer(layer)}
                          className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
                          type="button"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {localIso(layer.starts_at) || "immédiat"} →{" "}
                      {localIso(layer.ends_at) || "illimité"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-gray-100 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Nouvelle promo
              </h3>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <input
                  value={promoLabel}
                  onChange={(e) => setPromoLabel(e.target.value)}
                  className="rounded border border-gray-200 px-2 py-1.5 text-xs"
                  placeholder="Label promo"
                />
                <input
                  type="datetime-local"
                  value={promoStartsAt}
                  onChange={(e) => setPromoStartsAt(e.target.value)}
                  className="rounded border border-gray-200 px-2 py-1.5 text-xs"
                />
                <input
                  type="datetime-local"
                  value={promoEndsAt}
                  onChange={(e) => setPromoEndsAt(e.target.value)}
                  className="rounded border border-gray-200 px-2 py-1.5 text-xs"
                />
              </div>

              <div className="mt-2">
                <label className="mb-1 block text-xs text-gray-600">
                  Mode promo
                </label>
                <select
                  value={promoMode}
                  onChange={(e) =>
                    setPromoMode(e.target.value as PromoModeDraft)
                  }
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs"
                >
                  <option value="flat">Flat</option>
                  <option value="degressive">Dégressif</option>
                  <option value="lot">Lots</option>
                </select>
              </div>

              {promoMode === "flat" && (
                <div className="mt-2">
                  <label className="mb-1 block text-xs text-gray-600">
                    Prix promo unitaire (HT)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={promoFlatPrice}
                    onChange={(e) => setPromoFlatPrice(e.target.value)}
                    className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs"
                  />
                </div>
              )}

              {promoMode === "degressive" && (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">
                      Type de dégressif promo
                    </label>
                    <select
                      value={promoDegressiveType}
                      onChange={(e) =>
                        setPromoDegressiveType(
                          e.target.value as "fixed" | "percentage",
                        )
                      }
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs"
                    >
                      <option value="fixed">Somme fixe</option>
                      <option value="percentage">Pourcentage</option>
                    </select>
                  </div>
                  {promoDegressiveTiers.map((row, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 rounded border border-gray-100 p-2"
                    >
                      <div className="col-span-3">
                        <label className="mb-1 block text-[11px] text-gray-500">
                          Qté min
                        </label>
                        <input
                          type="number"
                          value={row.min_quantity}
                          onChange={(e) =>
                            setTierValue(setPromoDegressiveTiers, idx, {
                              min_quantity: Math.max(
                                1,
                                Number(e.target.value || 1),
                              ),
                            })
                          }
                          className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="mb-1 block text-[11px] text-gray-500">
                          Qté max
                        </label>
                        <input
                          type="number"
                          value={row.max_quantity ?? ""}
                          onChange={(e) =>
                            setTierValue(setPromoDegressiveTiers, idx, {
                              max_quantity: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                          className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="col-span-4">
                        <label className="mb-1 block text-[11px] text-gray-500">
                          Valeur (
                          {promoDegressiveType === "percentage" ? "%" : "€"})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={row.value}
                          onChange={(e) =>
                            setTierValue(setPromoDegressiveTiers, idx, {
                              value: Number(e.target.value || 0),
                            })
                          }
                          className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="col-span-2 flex items-end justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            setPromoDegressiveTiers((prev) =>
                              prev.filter((_, i) => i !== idx),
                            )
                          }
                          className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
                        >
                          Suppr.
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addTier(setPromoDegressiveTiers)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    + Ajouter palier promo
                  </button>
                </div>
              )}

              {promoMode === "lot" && (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">
                      SKU / Préfixe cible (avant le point)
                    </label>
                    <input
                      value={promoLotSkuInput}
                      onChange={(e) => {
                        const next = e.target.value.toUpperCase();
                        setPromoLotSkuInput(next);
                        const parsed = parseSkuPrefix(next);
                        if (parsed?.prefix) setPromoLotPrefix(parsed.prefix);
                      }}
                      placeholder="Ex: ABC-M2-D18.AN.RO"
                      className="w-full rounded border border-gray-200 px-2 py-1.5 font-mono text-xs"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                      Sélection: racine + variations qui changent le prix (avant
                      le ".").
                    </p>
                    {parsedLotSku && (
                      <p className="mt-1 text-[11px] text-indigo-600">
                        Détecté:{" "}
                        <span className="rounded bg-amber-100 px-1 font-mono">
                          {parsedLotSku.root}
                        </span>
                        {parsedLotSku.branch ? (
                          <span className="font-mono">
                            -{parsedLotSku.branch}
                          </span>
                        ) : (
                          ""
                        )}
                      </p>
                    )}
                  </div>

                  <div className="rounded border border-gray-100 p-2">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                      Préfixes disponibles
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {branchCandidates.map((branch) => {
                        const active = branch.prefix === promoLotPrefix;
                        return (
                          <button
                            key={branch.prefix}
                            type="button"
                            onClick={() => {
                              setPromoLotPrefix(branch.prefix);
                              setPromoLotSkuInput(branch.prefix);
                            }}
                            className={`rounded border px-2 py-1 text-[11px] ${
                              active
                                ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                                : "border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            <span className="rounded bg-amber-100 px-1 font-mono text-amber-800">
                              {branch.root}
                            </span>
                            {branch.branch ? (
                              <span className="font-mono">
                                -{branch.branch}
                              </span>
                            ) : (
                              ""
                            )}
                            <span className="ml-1 text-[10px] text-gray-400">
                              [{branch.count}]
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedBranch && (
                      <p className="mt-2 text-[11px] text-gray-500">
                        Préfixe actif:{" "}
                        <span className="font-mono">
                          {selectedBranch.prefix}
                        </span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-gray-600">
                      Prix unitaire branche (HT)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={promoLotBranchUnitPrice}
                      onChange={(e) =>
                        setPromoLotBranchUnitPrice(e.target.value)
                      }
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    {promoLotRows.map((row, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-12 gap-2 rounded border border-gray-100 p-2"
                      >
                        <div className="col-span-3">
                          <label className="mb-1 block text-[11px] text-gray-500">
                            Lot
                          </label>
                          <input
                            value={row.label}
                            onChange={(e) =>
                              setPromoLotRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? { ...r, label: e.target.value }
                                    : r,
                                ),
                              )
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="mb-1 block text-[11px] text-gray-500">
                            Payées
                          </label>
                          <input
                            type="number"
                            value={row.paid_units}
                            onChange={(e) =>
                              setPromoLotRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        paid_units: Math.max(
                                          1,
                                          Number(e.target.value || 1),
                                        ),
                                      }
                                    : r,
                                ),
                              )
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="mb-1 block text-[11px] text-gray-500">
                            Offertes
                          </label>
                          <input
                            type="number"
                            value={row.bonus_units}
                            onChange={(e) =>
                              setPromoLotRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        bonus_units: Math.max(
                                          0,
                                          Number(e.target.value || 0),
                                        ),
                                      }
                                    : r,
                                ),
                              )
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="mb-1 block text-[11px] text-gray-500">
                            Prix promo lot (HT)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={row.lot_price_ht}
                            onChange={(e) =>
                              setPromoLotRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        lot_price_ht: Number(
                                          e.target.value || 0,
                                        ),
                                      }
                                    : r,
                                ),
                              )
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                          />
                        </div>
                        <div className="col-span-1 flex items-end justify-center">
                          <label className="text-[10px] text-gray-500">
                            <input
                              type="checkbox"
                              checked={row.eco_included}
                              onChange={(e) =>
                                setPromoLotRows((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? { ...r, eco_included: e.target.checked }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </label>
                        </div>
                        <div className="col-span-1 flex items-end justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              setPromoLotRows((prev) =>
                                prev.filter((_, i) => i !== idx),
                              )
                            }
                            className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="col-span-12 rounded bg-gray-50 px-2 py-1 text-[11px] text-gray-600">
                          {(() => {
                            const totalUnits =
                              Math.max(1, Number(row.paid_units || 0)) +
                              Math.max(0, Number(row.bonus_units || 0));
                            const unit = Number(promoLotBranchUnitPrice || 0);
                            const pseudoRegular = totalUnits * unit;
                            const lotPrice = Number(row.lot_price_ht || 0);
                            const delta =
                              pseudoRegular > 0
                                ? (1 - lotPrice / pseudoRegular) * 100
                                : 0;
                            return (
                              <>
                                Qty totale:{" "}
                                <span className="font-semibold">
                                  {totalUnits}
                                </span>
                                {" · "}Faux regular:{" "}
                                <span className="font-semibold">
                                  {pseudoRegular.toFixed(2)} €
                                </span>
                                {" · "}Prix promo lot:{" "}
                                <span className="font-semibold">
                                  {lotPrice.toFixed(2)} €
                                </span>
                                {" · "}Remise:{" "}
                                <span className="font-semibold">
                                  {Number.isFinite(delta)
                                    ? delta.toFixed(1)
                                    : "0.0"}
                                  %
                                </span>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setPromoLotRows((prev) => [
                          ...prev,
                          {
                            label: "Nouveau lot",
                            paid_units: 1,
                            bonus_units: 0,
                            lot_price_ht: 0,
                            eco_included: true,
                          },
                        ])
                      }
                      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      + Ajouter lot promo
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={createPromoLayer}
                disabled={creatingPromo}
                className="mt-3 w-full rounded bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-60"
                type="button"
              >
                {creatingPromo ? "Création…" : "Créer promo"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
