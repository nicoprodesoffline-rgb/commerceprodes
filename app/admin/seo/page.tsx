"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SeoProductRow {
  id: string;
  title: string;
  slug: string;
  sku: string | null;
  short_description: string | null;
  featured_image_url: string | null;
  score: number;
  suggestions: string[];
}

function computeScore(p: {
  title: string;
  short_description: string | null;
  featured_image_url: string | null;
  sku: string | null;
}): { score: number; suggestions: string[] } {
  const suggestions: string[] = [];
  let score = 0;
  if (p.title && p.title.length >= 30 && p.title.length <= 70) score += 20;
  else suggestions.push((p.title?.length ?? 0) < 30 ? "Titre trop court" : "Titre trop long");
  const descLen = (p.short_description ?? "").replace(/<[^>]*>/g, "").length;
  if (descLen >= 80 && descLen <= 300) score += 20;
  else suggestions.push(descLen < 80 ? "Description trop courte ou absente" : "Description trop longue");
  if (p.featured_image_url && !p.featured_image_url.includes("placeholder")) score += 20;
  else suggestions.push("Image principale manquante");
  if (p.sku && p.sku.trim()) score += 20;
  else suggestions.push("SKU manquant");
  score += 20; // assume category OK (simplified for client-side)
  return { score, suggestions };
}

function Voyant({ score }: { score: number }) {
  const cls =
    score >= 90 ? "text-green-600" : score >= 70 ? "text-yellow-600" : score >= 40 ? "text-orange-600" : "text-red-600";
  return <span className={`font-mono text-sm font-bold ${cls}`}>● {score}</span>;
}

export default function SeoPage() {
  const [rows, setRows] = useState<SeoProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [serpTitle, setSerpTitle] = useState("");
  const [serpDesc, setSerpDesc] = useState("");
  const password = typeof window !== "undefined" ? sessionStorage.getItem("admin_password") ?? "" : "";

  useEffect(() => {
    // Load all products (up to 500) and compute scores client-side
    fetch("/api/admin/products-list?page=0&limit=500&status=all", {
      headers: { Authorization: `Bearer ${password}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const products = data.products ?? [];
        const scored: SeoProductRow[] = products.map((p: any) => {
          const { score, suggestions } = computeScore(p);
          return { ...p, score, suggestions };
        });
        scored.sort((a: SeoProductRow, b: SeoProductRow) => a.score - b.score);
        setRows(scored);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [password]);

  const green = rows.filter((r) => r.score >= 90).length;
  const orange = rows.filter((r) => r.score >= 40 && r.score < 90).length;
  const red = rows.filter((r) => r.score < 40).length;
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;

  const serpPreviewTitle = serpTitle.slice(0, 70);
  const serpPreviewDesc = serpDesc.slice(0, 155);
  const titleTruncated = serpTitle.length > 70;
  const descTruncated = serpDesc.length > 155;

  return (
    <div>
      <h1 className="mb-5 text-xl font-bold text-gray-900">SEO Global</h1>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Score ≥ 90 🟢", value: green, color: "text-green-600" },
          { label: "Score 40–89 🟠", value: orange, color: "text-orange-600" },
          { label: "Score < 40 🔴", value: red, color: "text-red-600" },
          { label: "Score moyen", value: avg, color: "text-gray-900" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{loading ? "…" : s.value}</p>
            <p className="mt-0.5 text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {rows.length > 0 && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 flex justify-between text-xs text-gray-500">
            <span>Score moyen global</span>
            <span className="font-semibold">{avg}/100</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${avg >= 70 ? "bg-green-500" : avg >= 40 ? "bg-orange-400" : "bg-red-500"}`}
              style={{ width: `${avg}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top 10 priorités */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-800">Top 10 priorités (scores les plus bas)</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              <p className="py-6 text-center text-xs text-gray-400">Chargement…</p>
            ) : (
              rows.slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <Voyant score={r.score} />
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/admin/produits/${r.id}`}
                      className="block text-sm font-medium text-gray-800 hover:text-[#cc1818] truncate transition-colors"
                    >
                      {r.title}
                    </Link>
                    {r.suggestions[0] && (
                      <p className="text-xs text-orange-600">{r.suggestions[0]}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Simulateur SERP */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-800">Simulateur SERP</h2>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Titre (70 max)</label>
              <input
                type="text"
                value={serpTitle}
                onChange={(e) => setSerpTitle(e.target.value)}
                placeholder="Titre de la page…"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Description (155 max)</label>
              <textarea
                rows={3}
                value={serpDesc}
                onChange={(e) => setSerpDesc(e.target.value)}
                placeholder="Description meta…"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
              />
            </div>

            {/* Prévisualisation */}
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 font-sans text-sm">
              <p className={`text-lg font-medium leading-tight ${titleTruncated ? "text-red-600" : "text-blue-700"} hover:underline cursor-pointer`}>
                {serpPreviewTitle || "Titre de la page"}
                {titleTruncated && <span className="ml-1 text-xs text-red-500">⚠ tronqué</span>}
              </p>
              <p className="mt-0.5 text-xs text-green-700">
                https://prodes.fr/product/exemple
              </p>
              <p className={`mt-1 text-xs leading-relaxed ${descTruncated ? "text-orange-600" : "text-gray-600"}`}>
                {serpPreviewDesc || "Description de la page dans les résultats de recherche…"}
                {descTruncated && <span className="ml-1 text-red-500">⚠ tronquée</span>}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Actions IA */}
      <section className="mt-6 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-800">Optimisation IA</h2>
        </div>
        <div className="flex flex-wrap gap-3 p-5">
          <Link
            href="/admin/ia"
            className="flex items-center gap-2 rounded-md bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
          >
            ✨ Générer les descriptions manquantes
          </Link>
          <Link
            href="/admin/catalogue"
            className="flex items-center gap-2 rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            📊 Vue Excel — modifier en masse
          </Link>
        </div>
      </section>
    </div>
  );
}
