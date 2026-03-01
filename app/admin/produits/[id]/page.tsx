"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { adminFetch } from "lib/admin/fetch";

interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  status: string;
  short_description: string | null;
  description: string | null;
  regular_price: number;
  eco_contribution: number | null;
  featured_image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
}

interface PriceTier {
  id?: string;
  min_quantity: number;
  max_quantity?: number | null;
  price_per_unit: number;
}

interface AiPreview {
  before: string | null;
  generated: string;
}

type ProductVersion = {
  id: string;
  version_num: number;
  snapshot: Record<string, unknown>;
  changed_by: string;
  change_note: string | null;
  created_at: string;
};

function seoScore(p: Partial<ProductDetail>): number {
  let score = 0;
  if (p.name && p.name.length >= 30 && p.name.length <= 70) score += 25;
  if (p.short_description && p.short_description.length >= 80) score += 25;
  if (p.sku) score += 25;
  if (p.regular_price && p.regular_price > 0) score += 25;
  return score;
}

function SeoVoyant({ score }: { score: number }) {
  const { color, label } =
    score >= 90 ? { color: "text-green-600 bg-green-50", label: "Excellent" }
    : score >= 70 ? { color: "text-yellow-600 bg-yellow-50", label: "Bon" }
    : score >= 40 ? { color: "text-orange-600 bg-orange-50", label: "Moyen" }
    : { color: "text-red-600 bg-red-50", label: "Insuffisant" };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      ● {score}/100 — {label}
    </span>
  );
}

// ── Diff modal helpers ────────────────────────────────────────────────────────

const DIFF_FIELDS: { key: keyof ProductDetail; label: string }[] = [
  { key: "name", label: "Titre" },
  { key: "sku", label: "SKU" },
  { key: "status", label: "Statut" },
  { key: "regular_price", label: "Prix HT" },
  { key: "short_description", label: "Description courte" },
  { key: "seo_title", label: "Titre SEO" },
  { key: "seo_description", label: "Description meta" },
];

function DiffModal({
  version,
  current,
  loading,
  onConfirm,
  onCancel,
}: {
  version: ProductVersion;
  current: ProductDetail;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const snap = version.snapshot as Partial<ProductDetail>;

  const rows = DIFF_FIELDS.map((f) => {
    const cur = String(current[f.key] ?? "");
    const next = String(snap[f.key] ?? "");
    const changed = cur !== next;
    return { ...f, cur, next, changed };
  });

  const hasChanges = rows.some((r) => r.changed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              Restaurer v{version.version_num}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(version.created_at).toLocaleString("fr-FR")} · {version.changed_by}
              {version.change_note ? ` — ${version.change_note}` : ""}
            </p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {hasChanges ? (
            <>
              <p className="mb-3 text-xs text-gray-500">
                Les champs en surbrillance seront modifiés. Les champs identiques ne sont pas affichés.
              </p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-100 px-3 py-2 text-left text-gray-600 font-medium w-28">Champ</th>
                    <th className="border border-gray-100 px-3 py-2 text-left text-gray-600 font-medium">
                      Actuel
                    </th>
                    <th className="border border-gray-100 px-3 py-2 text-left text-gray-600 font-medium">
                      Après rollback (v{version.version_num})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter((r) => r.changed)
                    .map((r) => (
                      <tr key={r.key} className="bg-amber-50/60">
                        <td className="border border-gray-100 px-3 py-2 font-medium text-gray-700 align-top">
                          {r.label}
                        </td>
                        <td className="border border-gray-100 px-3 py-2 text-red-700 line-through align-top max-w-[200px] break-words">
                          {r.cur || <span className="italic not-italic text-gray-300 no-underline" style={{textDecoration:"none"}}>vide</span>}
                        </td>
                        <td className="border border-gray-100 px-3 py-2 text-green-700 align-top max-w-[200px] break-words">
                          {r.next || <span className="italic text-gray-300">vide</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="text-sm text-gray-500 py-4 text-center">
              Aucune différence détectée entre la version actuelle et v{version.version_num}.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors disabled:opacity-60"
          >
            {loading ? "Restauration…" : `✓ Confirmer rollback vers v${version.version_num}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]";

export default function ProductEditPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const savedRef = useRef<ProductDetail | null>(null);
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [dirty, setDirty] = useState(false);

  // IA state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiConfirming, setAiConfirming] = useState(false);
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  const [activeDescTab, setActiveDescTab] = useState<"short" | "long">("short");

  // ── Version history state ─────────────────────────────────────────────────
  const [versions, setVersions] = useState<ProductVersion[]>([]);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<ProductVersion | null>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackMsg, setRollbackMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    adminFetch(`/api/admin/products/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.product) {
          setProduct(data.product);
          savedRef.current = data.product;
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  // Track dirty state whenever product changes
  useEffect(() => {
    if (!product || !savedRef.current) return;
    const changed = JSON.stringify(product) !== JSON.stringify(savedRef.current);
    setDirty(changed);
  }, [product]);

  // ── IA: Aperçu (preview only, no DB write) ────────────────────────────────
  const handleAiPreview = async () => {
    if (!product || !id) return;
    setAiLoading(true);
    setAiPreview(null);
    setAiError(null);
    setAiUnavailable(false);
    try {
      const res = await adminFetch("/api/admin/ia/generate-descriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: id, preview: true }),
      });
      const data = await res.json();
      if (data.ia_available === false) {
        setAiUnavailable(true);
        setAiError(data.reason ?? "Clé API Anthropic non configurée");
        return;
      }
      if (res.status === 400) {
        setAiError(data.error ?? "Paramètres invalides");
        return;
      }
      if (!res.ok) {
        setAiError(`Erreur serveur (${res.status})`);
        return;
      }
      if (data.product?.description_generated) {
        setAiPreview({
          before: data.product.description_before ?? null,
          generated: data.product.description_generated,
        });
      } else {
        setAiError("Réponse IA vide ou inattendue");
      }
    } catch {
      setAiError("Erreur réseau — réessayez");
    } finally {
      setAiLoading(false);
    }
  };

  // ── IA: Confirmer (writes to DB, then updates local state) ────────────────
  const handleAiConfirm = async () => {
    if (!product || !id || !aiPreview) return;
    setAiConfirming(true);
    setAiError(null);
    try {
      const res = await adminFetch("/api/admin/ia/generate-descriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: id, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAiError(data.error ?? `Erreur sauvegarde (${res.status})`);
        return;
      }
      const saved = data.product?.description ?? aiPreview.generated;
      setProduct((prev) => prev ? { ...prev, short_description: saved } : prev);
      savedRef.current = product ? { ...product, short_description: saved } : savedRef.current;
      setAiPreview(null);
      setDirty(false);
    } catch {
      setAiError("Erreur réseau — réessayez");
    } finally {
      setAiConfirming(false);
    }
  };

  const handleAiApplyPreview = () => {
    if (!aiPreview || !product) return;
    setProduct({ ...product, short_description: aiPreview.generated });
    setAiPreview(null);
    setActiveDescTab("short");
  };

  const loadVersions = async () => {
    if (!product?.id) return;
    setVersionsLoading(true);
    try {
      const res = await adminFetch(`/api/admin/products/${product.id}/versions`);
      const data = await res.json();
      setVersions(data.versions ?? []);
      setVersionsLoaded(true);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  };

  // Open diff modal
  const handleRollbackPreview = (version: ProductVersion) => {
    setRollbackMsg(null);
    setRollbackTarget(version);
  };

  // Execute confirmed rollback
  const handleRollbackConfirm = async () => {
    if (!product?.id || !rollbackTarget) return;
    setRollbackLoading(true);
    try {
      const res = await adminFetch(`/api/admin/products/${product.id}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: rollbackTarget.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setRollbackTarget(null);
        setRollbackMsg(`✓ Rollback vers v${rollbackTarget.version_num} effectué. Rechargement…`);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setRollbackTarget(null);
        setRollbackMsg(`Erreur : ${data.error ?? "Rollback échoué"}`);
      }
    } catch {
      setRollbackTarget(null);
      setRollbackMsg("Erreur de connexion");
    } finally {
      setRollbackLoading(false);
    }
  };

  const handleSave = useCallback(async () => {
    if (!product) return;
    setSaving(true);
    setSaveError(false);
    try {
      const res = await adminFetch(`/api/admin/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: product.name,
          sku: product.sku,
          status: product.status,
          short_description: product.short_description,
          description: product.description,
          regular_price: product.regular_price,
          eco_contribution: product.eco_contribution,
          seo_title: product.seo_title,
          seo_description: product.seo_description,
        }),
      });
      if (res.ok) {
        savedRef.current = { ...product };
        setDirty(false);
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 2000);
      } else {
        setSaveError(true);
        setTimeout(() => setSaveError(false), 3000);
      }
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    } finally {
      setSaving(false);
    }
  }, [product, id]);

  if (loading) {
    return <div className="py-12 text-center text-gray-400">Chargement…</div>;
  }

  if (!product) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">Produit introuvable.</p>
        <Link href="/admin/catalogue" className="mt-4 text-sm text-[#cc1818] underline">
          ← Retour au catalogue
        </Link>
      </div>
    );
  }

  const score = seoScore(product);
  const seoCriterias = [
    !product.name || product.name.length < 30 || product.name.length > 70
      ? "Titre entre 30 et 70 caractères"
      : null,
    !product.short_description || product.short_description.length < 80
      ? "Description ≥ 80 caractères"
      : null,
    !product.sku ? "SKU manquant" : null,
    !product.regular_price ? "Prix non défini" : null,
  ].filter(Boolean);

  return (
    <div>
      {/* ── Rollback diff modal ── */}
      {rollbackTarget && (
        <DiffModal
          version={rollbackTarget}
          current={product}
          loading={rollbackLoading}
          onConfirm={handleRollbackConfirm}
          onCancel={() => setRollbackTarget(null)}
        />
      )}

      <div className="mb-5 flex items-center justify-between">
        <div>
          <Link
            href="/admin/catalogue"
            className="mb-1 block text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Retour au catalogue
          </Link>
          <h1 className="text-xl font-bold text-gray-900 line-clamp-1">{product.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {dirty && !saveOk && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              ● Modifications non enregistrées
            </span>
          )}
          <Link
            href={`/product/${product.slug}`}
            target="_blank"
            className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Voir la fiche →
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`rounded-md px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-60 ${
              saveError ? "bg-red-600" : saveOk ? "bg-green-600" : "bg-[#cc1818] hover:bg-[#aa1414]"
            }`}
          >
            {saving ? "Enregistrement…" : saveOk ? "✓ Enregistré" : saveError ? "✕ Erreur" : "Enregistrer"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ── Colonne principale (70%) ── */}
        <div className="flex-1 space-y-5">
          {/* Informations générales */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-800">Informations générales</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Titre *
                  <span className={`ml-2 text-xs ${product.name.length > 70 ? "text-red-600" : "text-gray-400"}`}>
                    {product.name.length}/70
                  </span>
                </label>
                <input
                  type="text"
                  value={product.name}
                  onChange={(e) => setProduct({ ...product, name: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Handle / Slug</label>
                <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500 font-mono">
                  /product/{product.slug}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">SKU</label>
                <input
                  type="text"
                  value={product.sku ?? ""}
                  onChange={(e) => setProduct({ ...product, sku: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Statut</label>
                <select
                  value={product.status}
                  onChange={(e) => setProduct({ ...product, status: e.target.value })}
                  className={inputClass}
                >
                  <option value="publish">Publié</option>
                  <option value="draft">Brouillon</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Éco-participation (€/unité)</label>
                <input
                  type="number"
                  step="0.01"
                  value={product.eco_contribution ?? ""}
                  onChange={(e) => setProduct({ ...product, eco_contribution: parseFloat(e.target.value) || 0 })}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          {/* Description + IA */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">Description</h2>
                <div className="flex items-center gap-2">
                  {aiUnavailable && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                      IA non disponible
                    </span>
                  )}
                  {!aiPreview && (
                    <button
                      onClick={handleAiPreview}
                      disabled={aiLoading}
                      className="flex items-center gap-1 rounded-md bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                    >
                      ✨ {aiLoading ? "Génération…" : "Aperçu IA"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Erreur IA */}
            {aiError && (
              <div className="mx-5 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {aiError}
              </div>
            )}

            {/* Diff avant/après IA */}
            {aiPreview && (
              <div className="mx-5 mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="mb-2 text-xs font-semibold text-amber-800">Aperçu de la description générée</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[10px] font-medium text-gray-500 uppercase tracking-wide">Avant</p>
                    <div className="min-h-[60px] rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                      {aiPreview.before ? aiPreview.before : <span className="italic text-gray-300">vide</span>}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-medium text-amber-700 uppercase tracking-wide">Généré</p>
                    <div className="min-h-[60px] rounded border border-amber-300 bg-white px-3 py-2 text-xs text-gray-800">
                      {aiPreview.generated}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleAiConfirm}
                    disabled={aiConfirming}
                    className="rounded bg-[#cc1818] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#aa1414] transition-colors disabled:opacity-60"
                  >
                    {aiConfirming ? "Sauvegarde…" : "✓ Confirmer et sauvegarder en DB"}
                  </button>
                  <button
                    onClick={handleAiApplyPreview}
                    className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Appliquer dans le formulaire
                  </button>
                  <button
                    onClick={() => setAiPreview(null)}
                    className="rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Ignorer
                  </button>
                </div>
              </div>
            )}

            <div className="p-5">
              <div className="mb-3 flex border-b border-gray-200">
                {(["short", "long"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveDescTab(tab)}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                      activeDescTab === tab
                        ? "border-b-2 border-[#cc1818] text-[#cc1818]"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {tab === "short" ? "Description courte" : "Description longue"}
                  </button>
                ))}
              </div>
              {activeDescTab === "short" ? (
                <div>
                  <textarea
                    rows={4}
                    maxLength={300}
                    value={product.short_description ?? ""}
                    onChange={(e) => setProduct({ ...product, short_description: e.target.value })}
                    className={inputClass}
                    placeholder="Description courte (max 300 caractères)"
                  />
                  <p className="mt-1 text-right text-xs text-gray-400">
                    {(product.short_description ?? "").length}/300
                  </p>
                </div>
              ) : (
                <textarea
                  rows={8}
                  value={product.description ?? ""}
                  onChange={(e) => setProduct({ ...product, description: e.target.value })}
                  className={inputClass}
                  placeholder="Description longue (HTML supporté)"
                />
              )}
            </div>
          </section>

          {/* Prix */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-800">Prix</h2>
            </div>
            <div className="p-5">
              <div className="mb-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Prix HT de base (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={product.regular_price}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setProduct({ ...product, regular_price: isNaN(v) ? 0 : v });
                    }}
                    className={inputClass}
                  />
                </div>
              </div>
              {tiers.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-gray-600">Paliers dégressifs</p>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Qté min</th>
                        <th className="px-2 py-1.5 text-left">Qté max</th>
                        <th className="px-2 py-1.5 text-left">Remise (€)</th>
                        <th className="px-2 py-1.5 text-left">Prix calculé</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {tiers.map((tier, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              value={tier.min_quantity}
                              onChange={(e) => {
                                const t = [...tiers];
                                t[i] = { ...t[i]!, min_quantity: parseInt(e.target.value) || 0 };
                                setTiers(t);
                              }}
                              className="w-16 rounded border border-gray-200 px-1 py-0.5 focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              value={tier.max_quantity ?? ""}
                              onChange={(e) => {
                                const t = [...tiers];
                                t[i] = { ...t[i]!, max_quantity: parseInt(e.target.value) || null };
                                setTiers(t);
                              }}
                              className="w-16 rounded border border-gray-200 px-1 py-0.5 focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              step="0.01"
                              value={tier.price_per_unit}
                              onChange={(e) => {
                                const t = [...tiers];
                                t[i] = { ...t[i]!, price_per_unit: parseFloat(e.target.value) || 0 };
                                setTiers(t);
                              }}
                              className="w-20 rounded border border-gray-200 px-1 py-0.5 focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-1 text-gray-600">
                            {(product.regular_price - tier.price_per_unit).toFixed(2)} €
                          </td>
                          <td className="px-2 py-1">
                            <button
                              onClick={() => setTiers(tiers.filter((_, j) => j !== i))}
                              className="text-red-400 hover:text-red-600"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    onClick={() => setTiers([...tiers, { min_quantity: 10, price_per_unit: 0 }])}
                    className="mt-2 rounded border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-500 hover:border-gray-400 transition-colors"
                  >
                    + Ajouter un palier
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── Colonne latérale (30%) ── */}
        <div className="w-full space-y-4 lg:w-72 lg:flex-none">
          {/* Image */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-800">Image principale</h2>
            </div>
            <div className="p-5">
              {product.featured_image_url && (
                <div className="mb-3 aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  <Image
                    src={product.featured_image_url}
                    alt={product.name}
                    width={200}
                    height={200}
                    className="h-full w-full object-contain"
                  />
                </div>
              )}
              <input
                type="url"
                value={product.featured_image_url ?? ""}
                onChange={(e) => setProduct({ ...product, featured_image_url: e.target.value })}
                className={inputClass}
                placeholder="https://…"
              />
            </div>
          </section>

          {/* SEO */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">SEO</h2>
                <SeoVoyant score={score} />
              </div>
            </div>
            <div className="space-y-3 p-5">
              {seoCriterias.length > 0 && (
                <ul className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                  {seoCriterias.map((c) => (
                    <li key={c as string}>⚠ {c}</li>
                  ))}
                </ul>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Titre SEO
                  <span className={`ml-2 text-xs ${(product.seo_title ?? "").length > 70 ? "text-red-600" : "text-gray-400"}`}>
                    {(product.seo_title ?? "").length}/70
                  </span>
                </label>
                <input
                  type="text"
                  maxLength={70}
                  value={product.seo_title ?? ""}
                  onChange={(e) => setProduct({ ...product, seo_title: e.target.value })}
                  className={inputClass}
                  placeholder={product.name}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Description meta
                  <span className={`ml-2 text-xs ${(product.seo_description ?? "").length > 155 ? "text-red-600" : "text-gray-400"}`}>
                    {(product.seo_description ?? "").length}/155
                  </span>
                </label>
                <textarea
                  maxLength={155}
                  rows={3}
                  value={product.seo_description ?? ""}
                  onChange={(e) => setProduct({ ...product, seo_description: e.target.value })}
                  className={inputClass}
                  placeholder={product.short_description ?? ""}
                />
              </div>
            </div>
          </section>

          {/* ── Historique des versions ── */}
          <section className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">Historique des versions</h2>
              <button
                onClick={loadVersions}
                disabled={versionsLoading}
                className="text-xs text-blue-600 hover:underline disabled:opacity-50"
              >
                {versionsLoaded ? "Actualiser" : "Charger"}
              </button>
            </div>
            <div className="p-5">
              {rollbackMsg && (
                <div className={`mb-3 rounded-md px-3 py-2 text-xs ${rollbackMsg.startsWith("✓") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                  {rollbackMsg}
                </div>
              )}
              {versionsLoading ? (
                <p className="text-xs text-gray-400">Chargement…</p>
              ) : !versionsLoaded ? (
                <p className="text-xs text-gray-400">Cliquez sur &quot;Charger&quot; pour voir l&apos;historique des modifications.</p>
              ) : versions.length === 0 ? (
                <p className="text-xs text-gray-400">Aucune version enregistrée. Les versions sont créées automatiquement à chaque modification.</p>
              ) : (
                <div className="space-y-2">
                  {versions.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                      <span className="text-xs font-mono font-bold text-gray-500 w-8">v{v.version_num}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 truncate">{v.change_note ?? "Modification"}</p>
                        <p className="text-xs text-gray-400">{new Date(v.created_at).toLocaleString("fr-FR")} · {v.changed_by}</p>
                      </div>
                      <button
                        onClick={() => handleRollbackPreview(v)}
                        className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        Restaurer
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
