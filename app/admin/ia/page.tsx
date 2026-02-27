"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";

interface ThematicProduct {
  id: string;
  handle: string;
  title: string;
  image_url: string | null;
}

interface ThematicResult {
  title: string;
  intro: string;
  products: ThematicProduct[];
}

interface AuditResult {
  noDescription: { count: number; items: Array<{ id: string; title: string; handle: string }> };
  noPrice: { count: number; items: Array<{ id: string; title: string; handle: string }> };
  noImage: { count: number; items: Array<{ id: string; title: string; handle: string }> };
  noCategory: { count: number; items: Array<{ id: string; title: string; handle: string }> };
  noSku: { count: number; items: Array<{ id: string; title: string; handle: string }> };
}

interface DuplicateGroup {
  products: Array<{ id: string; title: string; handle: string; sku: string | null }>;
  similarity: "title" | "sku";
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

function useAdminPassword() {
  const [password, setPassword] = useState("");
  useEffect(() => {
    // Try to retrieve from session if stored
    const stored = sessionStorage.getItem("admin_password_cache");
    if (stored) setPassword(stored);
  }, []);
  return { password, setPassword };
}

export default function AdminIAPage() {
  const { password, setPassword } = useAdminPassword();
  const [categories, setCategories] = useState<Category[]>([]);

  // Module 1 — Audit
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditModal, setAuditModal] = useState<{
    title: string;
    items: Array<{ id: string; title: string; handle: string }>;
  } | null>(null);

  // Module 2 — Descriptions
  const [descCategory, setDescCategory] = useState("");
  const [descLimit, setDescLimit] = useState(5);
  const [descLoading, setDescLoading] = useState(false);
  const [descProgress, setDescProgress] = useState(0);
  const [descResult, setDescResult] = useState<{
    generated: number;
    errors: string[];
    products: Array<{ title: string; description: string }>;
  } | null>(null);

  // Module 3 — Doublons
  const [dupLoading, setDupLoading] = useState(false);
  const [dupGroups, setDupGroups] = useState<DuplicateGroup[] | null>(null);
  const [dupOpen, setDupOpen] = useState<number | null>(null);

  // Module 4 — Prix
  const [priceCategory, setPriceCategory] = useState("");
  const [pricePercent, setPricePercent] = useState(0);
  const [priceConfirm, setPriceConfirm] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceResult, setPriceResult] = useState<{
    updated: number;
    products: Array<{ title: string; oldPrice: number; newPrice: number }>;
  } | null>(null);

  // Load categories on mount
  useEffect(() => {
    fetch("/api/admin/ia/categories-list")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => {});
  }, []);

  function authHeaders() {
    return { Authorization: `Bearer ${password}`, "Content-Type": "application/json" };
  }

  async function runAudit() {
    setAuditLoading(true);
    setAuditResult(null);
    try {
      const res = await fetch("/api/admin/ia/audit", { headers: authHeaders() });
      if (res.ok) setAuditResult(await res.json());
      else alert("Erreur audit — vérifiez le mot de passe admin");
    } finally {
      setAuditLoading(false);
    }
  }

  async function runGenerateDescriptions() {
    setDescLoading(true);
    setDescResult(null);
    setDescProgress(0);
    const timer = setInterval(() => setDescProgress((p) => Math.min(p + 10, 90)), 500);
    try {
      const res = await fetch("/api/admin/ia/generate-descriptions", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ categorySlug: descCategory, limit: descLimit }),
      });
      clearInterval(timer);
      setDescProgress(100);
      if (res.ok) setDescResult(await res.json());
      else alert("Erreur génération — vérifiez la configuration ANTHROPIC_API_KEY");
    } finally {
      clearInterval(timer);
      setDescLoading(false);
    }
  }

  async function runDetectDuplicates() {
    setDupLoading(true);
    setDupGroups(null);
    try {
      const res = await fetch("/api/admin/ia/detect-duplicates", { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setDupGroups(d.groups);
      } else {
        alert("Erreur détection — vérifiez le mot de passe admin");
      }
    } finally {
      setDupLoading(false);
    }
  }

  async function runBulkPriceUpdate() {
    if (!priceConfirm) return;
    setPriceLoading(true);
    setPriceResult(null);
    try {
      const res = await fetch("/api/admin/ia/bulk-price-update", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ categorySlug: priceCategory, percentage: pricePercent }),
      });
      if (res.ok) setPriceResult(await res.json());
      else alert("Erreur mise à jour — vérifiez les paramètres");
    } finally {
      setPriceLoading(false);
      setPriceConfirm(false);
    }
  }

  // MODULE 5 — CTA Thématique
  const [themeInput, setThemeInput] = useState("");
  const [themeLoading, setThemeLoading] = useState(false);
  const [themeResult, setThemeResult] = useState<ThematicResult | null>(null);
  const [publishing, setPublishing] = useState(false);

  const CHIPS = ["rentrée scolaire", "fête nationale", "élections municipales", "marchés de Noël", "aménagement terrasse"];

  async function generateThematic() {
    if (!themeInput.trim()) return;
    setThemeLoading(true);
    setThemeResult(null);
    try {
      const res = await fetch("/api/admin/ia/thematic-cta", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ theme: themeInput }),
      });
      if (res.ok) setThemeResult(await res.json());
      else alert("Erreur génération — vérifiez ANTHROPIC_API_KEY");
    } finally {
      setThemeLoading(false);
    }
  }

  async function publishSection() {
    if (!themeResult) return;
    setPublishing(true);
    try {
      const productIds = themeResult.products.map((p) => p.id);
      const res = await fetch("/api/admin/homepage-sections", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: themeResult.title, intro: themeResult.intro, product_ids: productIds, position: 0 }),
      });
      if (res.ok) alert("✅ Section publiée ! Elle apparaît en 1ère position sur la homepage.");
      else alert("Erreur publication");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Outils IA</h1>
        <p className="mt-1 text-sm text-gray-500">Optimisation automatique du catalogue</p>
      </div>

      {/* Mot de passe admin */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-medium text-amber-800 mb-2">
          Authentification requise pour les opérations IA
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            sessionStorage.setItem("admin_password_cache", e.target.value);
          }}
          placeholder="Mot de passe admin"
          className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none w-full max-w-xs"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* MODULE 1 — Audit */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="font-semibold text-gray-900">🔍 Audit du catalogue</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Détecte les produits incomplets ou problématiques
              </p>
            </div>
          </div>
          <button
            onClick={runAudit}
            disabled={auditLoading}
            className="mt-3 rounded-lg bg-[#cc1818] px-4 py-2 text-sm font-medium text-white hover:bg-[#b01414] disabled:opacity-60 transition-colors"
          >
            {auditLoading ? "Audit en cours…" : "Lancer l'audit"}
          </button>
          {auditResult && (
            <div className="mt-4 space-y-2">
              {[
                { label: "Sans description", data: auditResult.noDescription, color: "orange" },
                { label: "Avec prix à 0", data: auditResult.noPrice, color: "red" },
                { label: "Sans image", data: auditResult.noImage, color: "orange" },
                { label: "Sans catégorie", data: auditResult.noCategory, color: "red" },
                { label: "Variants sans SKU", data: auditResult.noSku, color: "gray" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-700">{row.label}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full bg-${row.color}-100 px-2 py-0.5 text-xs font-medium text-${row.color}-700`}
                    >
                      {row.data.count}
                    </span>
                    {row.data.count > 0 && (
                      <button
                        onClick={() =>
                          setAuditModal({ title: row.label, items: row.data.items })
                        }
                        className="text-xs text-[#cc1818] hover:underline"
                      >
                        Voir
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {auditModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">{auditModal.title}</h3>
                  <button onClick={() => setAuditModal(null)} className="text-gray-400 hover:text-gray-700">✕</button>
                </div>
                <div className="space-y-1">
                  {auditModal.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 line-clamp-1">{item.title}</span>
                      <a
                        href={`/product/${item.handle}`}
                        target="_blank"
                        className="text-[#cc1818] hover:underline text-xs"
                      >
                        Voir →
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODULE 2 — Descriptions */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="font-semibold text-gray-900">✍️ Génération de descriptions</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Génère des descriptions manquantes avec l&apos;IA Claude
          </p>
          <div className="mt-3 space-y-3">
            <select
              value={descCategory}
              onChange={(e) => setDescCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
            >
              <option value="">Toutes les catégories</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 whitespace-nowrap">
                Générer pour
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={descLimit}
                onChange={(e) => setDescLimit(Math.min(20, Math.max(1, Number(e.target.value))))}
                className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm focus:outline-none text-center"
              />
              <label className="text-xs text-gray-600">produits</label>
            </div>
            <button
              onClick={runGenerateDescriptions}
              disabled={descLoading}
              className="w-full rounded-lg bg-[#cc1818] px-4 py-2 text-sm font-medium text-white hover:bg-[#b01414] disabled:opacity-60 transition-colors"
            >
              {descLoading ? "Génération…" : "Générer les descriptions"}
            </button>
            {descLoading && (
              <div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-[#cc1818] transition-all duration-500"
                    style={{ width: `${descProgress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Génération en cours…
                </p>
              </div>
            )}
            {descResult && (
              <div className="mt-2">
                <p className="text-sm font-medium text-green-700 mb-2">
                  ✅ {descResult.generated} description(s) générée(s)
                </p>
                {descResult.errors.length > 0 && (
                  <p className="text-xs text-red-600">{descResult.errors.length} erreur(s)</p>
                )}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {descResult.products.map((p, i) => (
                    <div key={i} className="rounded-lg bg-gray-50 p-2">
                      <p className="text-xs font-medium text-gray-800 line-clamp-1">{p.title}</p>
                      <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">
                        {p.description.slice(0, 120)}…
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MODULE 3 — Doublons */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="font-semibold text-gray-900">🔄 Détection de doublons</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Repère les produits similaires potentiellement dupliqués
          </p>
          <button
            onClick={runDetectDuplicates}
            disabled={dupLoading}
            className="mt-3 rounded-lg bg-[#cc1818] px-4 py-2 text-sm font-medium text-white hover:bg-[#b01414] disabled:opacity-60 transition-colors"
          >
            {dupLoading ? "Scan en cours…" : "Scanner les doublons"}
          </button>
          {dupGroups !== null && (
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-2">
                {dupGroups.length === 0
                  ? "✅ Aucun doublon détecté."
                  : `${dupGroups.length} groupe(s) suspect(s)`}
              </p>
              <p className="text-xs text-gray-400 mb-3 italic">
                Vérification manuelle requise — aucune suppression automatique
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {dupGroups.map((g, i) => (
                  <div key={i} className="rounded-lg border border-gray-100">
                    <button
                      className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-gray-50"
                      onClick={() => setDupOpen(dupOpen === i ? null : i)}
                    >
                      <span className="font-medium text-gray-700">
                        Groupe {i + 1} — {g.similarity === "title" ? "Titre similaire" : "SKU similaire"}
                      </span>
                      <span className="text-gray-400">{dupOpen === i ? "▲" : "▼"}</span>
                    </button>
                    {dupOpen === i && (
                      <div className="border-t border-gray-100 px-3 pb-2">
                        {g.products.map((p) => (
                          <div key={p.id} className="flex items-center justify-between py-1">
                            <span className="text-xs text-gray-700 line-clamp-1">{p.title}</span>
                            <a
                              href={`/product/${p.handle}`}
                              target="_blank"
                              className="text-xs text-[#cc1818] hover:underline"
                            >
                              Voir →
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* MODULE 4 — Prix en masse */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="font-semibold text-gray-900">💰 Mise à jour prix en masse</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Applique une hausse ou remise sur une sélection
          </p>
          <div className="mt-3 space-y-3">
            <select
              value={priceCategory}
              onChange={(e) => setPriceCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
            >
              <option value="">Choisir une catégorie…</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 whitespace-nowrap">Variation (%)</label>
              <input
                type="number"
                min={-50}
                max={100}
                value={pricePercent}
                onChange={(e) => setPricePercent(Number(e.target.value))}
                className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-sm focus:outline-none text-center"
              />
              <span className="text-xs text-gray-400">
                {pricePercent > 0 ? `+${pricePercent}%` : `${pricePercent}%`}
              </span>
            </div>
            <label className="flex items-start gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={priceConfirm}
                onChange={(e) => setPriceConfirm(e.target.checked)}
                className="mt-0.5 accent-[#cc1818]"
              />
              <span>J&apos;ai bien vérifié les produits concernés et je confirme l&apos;opération</span>
            </label>
            <button
              onClick={runBulkPriceUpdate}
              disabled={!priceConfirm || !priceCategory || priceLoading}
              className="w-full rounded-lg bg-[#cc1818] px-4 py-2 text-sm font-medium text-white hover:bg-[#b01414] disabled:opacity-40 transition-colors"
            >
              {priceLoading ? "Mise à jour…" : "Appliquer"}
            </button>
          </div>
          {priceResult && (
            <div className="mt-4">
              <p className="text-sm font-medium text-green-700 mb-2">
                ✅ {priceResult.updated} prix mis à jour
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="py-1 text-left text-gray-500">Produit</th>
                      <th className="py-1 text-right text-gray-500">Ancien</th>
                      <th className="py-1 text-right text-gray-500">Nouveau</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceResult.products.slice(0, 20).map((p, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-0.5 line-clamp-1 text-gray-700">{p.title}</td>
                        <td className="py-0.5 text-right text-gray-500">{p.oldPrice.toFixed(2)} €</td>
                        <td className="py-0.5 text-right font-medium text-gray-900">{p.newPrice.toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* MODULE 5 — CTA Thématique IA */}
        <div className="col-span-full rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="font-semibold text-gray-900">✨ CTA Thématique IA</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Tapez un thème → l&apos;IA sélectionne les produits et génère l&apos;accroche pour la homepage.
          </p>

          {/* Chips suggestions */}
          <div className="mt-3 flex flex-wrap gap-2">
            {CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => setThemeInput(chip)}
                className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:border-[#cc1818] hover:text-[#cc1818] transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={themeInput}
              onChange={(e) => setThemeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generateThematic()}
              placeholder="Votre thème…"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#cc1818] focus:outline-none"
            />
            <button
              onClick={generateThematic}
              disabled={themeLoading || !themeInput.trim()}
              className="rounded-lg bg-[#cc1818] px-4 py-2 text-sm font-medium text-white hover:bg-[#b01414] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {themeLoading ? "…" : "✨ Générer"}
            </button>
          </div>

          {themeResult && (
            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="font-semibold text-gray-900">{themeResult.title}</h3>
              <p className="mt-1 text-sm text-gray-600">{themeResult.intro}</p>
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                {themeResult.products.map((p) => (
                  <div key={p.id} className="flex flex-col items-center gap-1">
                    <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-gray-200">
                      {p.image_url && (
                        <Image src={p.image_url} alt={p.title} fill className="object-cover" sizes="64px" />
                      )}
                    </div>
                    <p className="line-clamp-2 text-center text-[10px] text-gray-500">{p.title}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={publishSection}
                  disabled={publishing}
                  className="rounded-lg bg-[#cc1818] px-4 py-2 text-sm font-medium text-white hover:bg-[#b01414] disabled:opacity-60 transition-colors"
                >
                  {publishing ? "Publication…" : "🚀 Publier sur la homepage"}
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(themeResult, null, 2))}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  📋 Copier le JSON
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
