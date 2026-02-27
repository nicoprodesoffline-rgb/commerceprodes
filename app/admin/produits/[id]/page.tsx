"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

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
  featured_image_url: string | null; // computed from product_images join (read-only)
  seo_title: string | null;
  seo_description: string | null;
}

interface PriceTier {
  id?: string;
  min_quantity: number;
  max_quantity?: number | null;
  price_per_unit: number;
}

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

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]";

export default function ProductEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const password = typeof window !== "undefined" ? sessionStorage.getItem("admin_password") ?? "" : "";

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [activeDescTab, setActiveDescTab] = useState<"short" | "long">("short");

  useEffect(() => {
    if (!id) return;
    // Fetch product via products-list with search=id (workaround — ideally a dedicated endpoint)
    fetch(`/api/admin/products/${id}`, {
      headers: { Authorization: `Bearer ${password}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.product) {
          setProduct(data.product);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, password]);

  const handleGenerateAI = async () => {
    if (!product) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/admin/ia/generate-descriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify({ productIds: [id], dryRun: false }),
      });
      const data = await res.json();
      if (data.results?.[0]?.description) {
        setProduct((prev) =>
          prev ? { ...prev, short_description: data.results[0].description } : prev,
        );
      }
    } catch {
      /* ignore */
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = useCallback(async () => {
    if (!product) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${password}`,
        },
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
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }, [product, id, password]);

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
        <div className="flex gap-2">
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
              saved ? "bg-green-600" : "bg-[#cc1818] hover:bg-[#aa1414]"
            }`}
          >
            {saving ? "Enregistrement…" : saved ? "✓ Enregistré" : "Enregistrer"}
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

          {/* Description */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">Description</h2>
                <button
                  onClick={handleGenerateAI}
                  disabled={aiLoading}
                  className="flex items-center gap-1 rounded-md bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                >
                  ✨ {aiLoading ? "Génération…" : "Générer avec IA"}
                </button>
              </div>
            </div>
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
                    value={product.regular_price}
                    onChange={(e) => setProduct({ ...product, regular_price: parseFloat(e.target.value) || 0 })}
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
                    <li key={c}>⚠ {c}</li>
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
        </div>
      </div>
    </div>
  );
}
