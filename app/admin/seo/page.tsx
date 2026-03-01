"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Status local-only (localStorage, not DB) — quick triage tracking
type SeoStatus = "todo" | "in_progress" | "done";

const SEO_STATUS_LABELS: Record<SeoStatus, string> = {
  todo: "À corriger",
  in_progress: "En cours",
  done: "Corrigé",
};
const SEO_STATUS_COLORS: Record<SeoStatus, string> = {
  todo: "bg-red-100 text-red-700",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
};

interface SeoProductRow {
  id: string;
  title: string;
  slug: string;
  sku: string | null;
  short_description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  featured_image_url: string | null;
  score: number;
  suggestions: string[];
}

function computeScore(p: {
  title: string;
  short_description: string | null;
  featured_image_url: string | null;
  sku: string | null;
  seo_title: string | null;
  seo_description: string | null;
}): { score: number; suggestions: string[] } {
  const suggestions: string[] = [];
  let score = 0;
  if (p.title && p.title.length >= 30 && p.title.length <= 70) score += 20;
  else suggestions.push((p.title?.length ?? 0) < 30 ? "Titre trop court (<30)" : "Titre trop long (>70)");
  const descLen = (p.short_description ?? "").replace(/<[^>]*>/g, "").length;
  if (descLen >= 80 && descLen <= 300) score += 20;
  else suggestions.push(descLen < 80 ? "Description trop courte ou absente" : "Description trop longue");
  if (p.featured_image_url && !p.featured_image_url.includes("placeholder")) score += 20;
  else suggestions.push("Image principale manquante");
  if (p.sku && p.sku.trim()) score += 20;
  else suggestions.push("SKU manquant");
  if (p.seo_title && p.seo_title.length >= 30) score += 10;
  else suggestions.push("Titre SEO absent ou trop court");
  if (p.seo_description && p.seo_description.length >= 80) score += 10;
  else suggestions.push("Meta description absente ou trop courte");
  return { score, suggestions };
}

function stripHtml(input: string | null): string {
  return String(input ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withMaxLen(input: string, max: number): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function suggestSeoTitle(row: SeoProductRow): string {
  const base = row.title?.trim() || "Produit PRODES";
  const skuPart = row.sku ? ` | ${row.sku}` : "";
  return withMaxLen(`${base}${skuPart} - PRODES`, 70);
}

function suggestSeoDescription(row: SeoProductRow): string {
  const short = stripHtml(row.short_description);
  const base =
    short.length >= 40
      ? short
      : `Decouvrez ${row.title} pour collectivites et professionnels. Demandez votre devis rapide avec accompagnement expert PRODES.`;
  return withMaxLen(base, 155);
}

function Voyant({ score }: { score: number }) {
  const cls =
    score >= 90 ? "text-green-600" : score >= 70 ? "text-yellow-600" : score >= 40 ? "text-orange-600" : "text-red-600";
  return <span className={`font-mono text-sm font-bold ${cls}`}>● {score}</span>;
}

function exportCSV(rows: SeoProductRow[], statuses: Record<string, SeoStatus>) {
  const cols = ["id", "titre", "slug", "sku", "score", "status", "suggestions", "seo_title", "seo_description"];
  const lines = [cols.join(";")];
  for (const r of rows) {
    lines.push([
      r.id,
      `"${r.title.replace(/"/g, '""')}"`,
      r.slug,
      r.sku ?? "",
      r.score,
      statuses[r.id] ?? "todo",
      `"${r.suggestions.join(" | ").replace(/"/g, '""')}"`,
      `"${(r.seo_title ?? "").replace(/"/g, '""')}"`,
      `"${(r.seo_description ?? "").replace(/"/g, '""')}"`,
    ].join(";"));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `seo-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SeoPage() {
  const [rows, setRows] = useState<SeoProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SeoStatus>("all");
  const [bulkStatus, setBulkStatus] = useState<SeoStatus>("in_progress");
  const [autoMode, setAutoMode] = useState<"missing" | "all">("missing");
  const [autoApplying, setAutoApplying] = useState(false);
  const [autoFeedback, setAutoFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [serpTitle, setSerpTitle] = useState("");
  const [serpDesc, setSerpDesc] = useState("");

  // Quick edit inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{ seo_title: string; seo_description: string }>({ seo_title: "", seo_description: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved] = useState<string | null>(null);

  // Status tracking (localStorage)
  const [statuses, setStatuses] = useState<Record<string, SeoStatus>>({});
  const statusesRef = useRef<Record<string, SeoStatus>>({});

  const password = typeof window !== "undefined" ? sessionStorage.getItem("admin_password") ?? "" : "";

  useEffect(() => {
    // Load statuses from localStorage
    try {
      const raw = localStorage.getItem("prodes_seo_statuses");
      if (raw) {
        const parsed = JSON.parse(raw);
        setStatuses(parsed);
        statusesRef.current = parsed;
      }
    } catch {}

    // Load products
    fetch("/api/admin/products-list?page=0&limit=500&status=all", {
      headers: { Authorization: `Bearer ${password}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const products = data.products ?? [];
        const scored: SeoProductRow[] = products.map((p: any) => {
          const { score, suggestions } = computeScore(p);
          return {
            id: p.id,
            title: p.title,
            slug: p.handle,
            sku: p.sku ?? null,
            short_description: p.short_description ?? null,
            seo_title: p.seo_title ?? null,
            seo_description: p.seo_description ?? null,
            featured_image_url: p.featured_image_url ?? null,
            score,
            suggestions,
          };
        });
        scored.sort((a, b) => a.score - b.score);
        setRows(scored);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [password]);

  const persistStatuses = (next: Record<string, SeoStatus>) => {
    statusesRef.current = next;
    setStatuses(next);
    try { localStorage.setItem("prodes_seo_statuses", JSON.stringify(next)); } catch {}
  };

  const saveStatus = (id: string, status: SeoStatus) => {
    persistStatuses({ ...statusesRef.current, [id]: status });
  };

  const openEdit = (r: SeoProductRow) => {
    setEditingId(r.id);
    setEditFields({ seo_title: r.seo_title ?? "", seo_description: r.seo_description ?? "" });
    setEditSaved(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/products/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${password}` },
        body: JSON.stringify({ seo_title: editFields.seo_title, seo_description: editFields.seo_description }),
      });
      if (res.ok) {
        setRows((prev) => prev.map((r) => {
          if (r.id !== editingId) return r;
          const updated = { ...r, seo_title: editFields.seo_title, seo_description: editFields.seo_description };
          const { score, suggestions } = computeScore(updated);
          return { ...updated, score, suggestions };
        }));
        setEditSaved(editingId);
        setTimeout(() => { setEditingId(null); setEditSaved(null); }, 1200);
      }
    } finally {
      setEditSaving(false);
    }
  };

  const green = rows.filter((r) => r.score >= 90).length;
  const orange = rows.filter((r) => r.score >= 40 && r.score < 90).length;
  const red = rows.filter((r) => r.score < 40).length;
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;

  const serpPreviewTitle = serpTitle.slice(0, 70);
  const serpPreviewDesc = serpDesc.slice(0, 155);
  const titleTruncated = serpTitle.length > 70;
  const descTruncated = serpDesc.length > 155;

  // Filtered rows
  const filtered = rows.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      if (!r.title.toLowerCase().includes(q) && !(r.sku ?? "").toLowerCase().includes(q)) return false;
    }
    if (statusFilter !== "all") {
      const s = statuses[r.id] ?? "todo";
      if (s !== statusFilter) return false;
    }
    return true;
  });

  const applyStatusToFiltered = (status: SeoStatus) => {
    if (filtered.length === 0) return;
    const next = { ...statusesRef.current };
    for (const row of filtered) next[row.id] = status;
    persistStatuses(next);
  };

  const applyAutoSeoToFiltered = async () => {
    if (filtered.length === 0) {
      setAutoFeedback({ type: "error", message: "Aucun produit a traiter." });
      return;
    }

    const candidates = filtered.filter((row) => {
      if (autoMode === "all") return true;
      return !row.seo_title || !row.seo_description;
    });

    if (candidates.length === 0) {
      setAutoFeedback({
        type: "success",
        message: "Aucun champ SEO manquant sur les produits filtres.",
      });
      return;
    }

    setAutoApplying(true);
    setAutoFeedback(null);

    const updatesById = new Map<string, { seo_title: string | null; seo_description: string | null }>();
    let updated = 0;
    let failed = 0;

    try {
      for (const row of candidates) {
        const shouldSetTitle = autoMode === "all" || !row.seo_title;
        const shouldSetDesc = autoMode === "all" || !row.seo_description;
        if (!shouldSetTitle && !shouldSetDesc) continue;

        const nextTitle = shouldSetTitle ? suggestSeoTitle(row) : row.seo_title;
        const nextDescription = shouldSetDesc ? suggestSeoDescription(row) : row.seo_description;
        const body: Record<string, string> = {};
        if (shouldSetTitle && nextTitle) body.seo_title = nextTitle;
        if (shouldSetDesc && nextDescription) body.seo_description = nextDescription;
        if (Object.keys(body).length === 0) continue;

        const res = await fetch(`/api/admin/products/${row.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${password}`,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          failed += 1;
          continue;
        }

        updatesById.set(row.id, {
          seo_title: nextTitle ?? null,
          seo_description: nextDescription ?? null,
        });
        updated += 1;
      }

      if (updatesById.size > 0) {
        setRows((prev) =>
          prev
            .map((row) => {
              const patch = updatesById.get(row.id);
              if (!patch) return row;
              const patched = {
                ...row,
                seo_title: patch.seo_title,
                seo_description: patch.seo_description,
              };
              const { score, suggestions } = computeScore(patched);
              return { ...patched, score, suggestions };
            })
            .sort((a, b) => a.score - b.score),
        );
      }

      setAutoFeedback({
        type: failed > 0 ? "error" : "success",
        message:
          failed > 0
            ? `SEO auto applique: ${updated} ok / ${failed} en echec.`
            : `SEO auto applique sur ${updated} produit(s).`,
      });
    } finally {
      setAutoApplying(false);
    }
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">SEO Global — Cockpit</h1>
        <div className="flex gap-2">
          <button
            onClick={() => exportCSV(rows, statuses)}
            disabled={rows.length === 0}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            ⬇ Export CSV
          </button>
          <button
            onClick={() => exportCSV(filtered, statuses)}
            disabled={filtered.length === 0}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            ⬇ Export filtres
          </button>
        </div>
      </div>

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
            <span>Score moyen global ({rows.length} produits)</span>
            <span className="font-semibold">{avg}/100</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${avg >= 70 ? "bg-green-500" : avg >= 40 ? "bg-orange-400" : "bg-red-500"}`}
              style={{ width: `${avg}%` }}
            />
          </div>
          {/* Status summary */}
          <div className="mt-2 flex gap-3 text-xs text-gray-500">
            <span>
              <span className="font-medium text-red-600">{Object.values(statuses).filter(s => s === "todo").length + (rows.length - Object.keys(statuses).filter(id => rows.some(r => r.id === id)).length)}</span> à corriger
            </span>
            <span>
              <span className="font-medium text-amber-600">{Object.values(statuses).filter(s => s === "in_progress").length}</span> en cours
            </span>
            <span>
              <span className="font-medium text-green-600">{Object.values(statuses).filter(s => s === "done").length}</span> corrigés
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
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
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 font-sans text-sm">
              <p className={`text-lg font-medium leading-tight ${titleTruncated ? "text-red-600" : "text-blue-700"} hover:underline cursor-pointer`}>
                {serpPreviewTitle || "Titre de la page"}
                {titleTruncated && <span className="ml-1 text-xs text-red-500">⚠ tronqué</span>}
              </p>
              <p className="mt-0.5 text-xs text-green-700">https://prodes.fr/product/exemple</p>
              <p className={`mt-1 text-xs leading-relaxed ${descTruncated ? "text-orange-600" : "text-gray-600"}`}>
                {serpPreviewDesc || "Description de la page dans les résultats de recherche…"}
                {descTruncated && <span className="ml-1 text-red-500">⚠ tronquée</span>}
              </p>
            </div>
          </div>
        </section>

        {/* Actions IA */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-800">Actions rapides</h2>
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
            <button
              onClick={() => exportCSV(rows, statuses)}
              disabled={rows.length === 0}
              className="flex items-center gap-2 rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              ⬇ Exporter rapport CSV
            </button>
          </div>
        </section>
      </div>

      {/* Tableau cockpit */}
      <section className="mt-6 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-800">Cockpit produits ({filtered.length})</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Filtrer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | SeoStatus)}
              className="rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none"
            >
              <option value="all">Tous statuts</option>
              {(Object.keys(SEO_STATUS_LABELS) as SeoStatus[]).map((s) => (
                <option key={s} value={s}>{SEO_STATUS_LABELS[s]}</option>
              ))}
            </select>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as SeoStatus)}
              className="rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none"
            >
              {(Object.keys(SEO_STATUS_LABELS) as SeoStatus[]).map((s) => (
                <option key={s} value={s}>{SEO_STATUS_LABELS[s]}</option>
              ))}
            </select>
            <button
              onClick={() => applyStatusToFiltered(bulkStatus)}
              disabled={filtered.length === 0}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Appliquer aux filtres
            </button>
            <select
              value={autoMode}
              onChange={(e) => setAutoMode(e.target.value as "missing" | "all")}
              className="rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none"
            >
              <option value="missing">SEO auto: champs manquants</option>
              <option value="all">SEO auto: ecraser tout</option>
            </select>
            <button
              onClick={applyAutoSeoToFiltered}
              disabled={filtered.length === 0 || autoApplying}
              className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-40"
            >
              {autoApplying ? "Auto SEO..." : "Auto SEO filtres"}
            </button>
          </div>
        </div>
        {autoFeedback && (
          <div
            className={`mx-5 mt-3 rounded-md px-3 py-2 text-xs ${
              autoFeedback.type === "success"
                ? "border border-green-200 bg-green-50 text-green-700"
                : "border border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {autoFeedback.message}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-4 py-2 text-left w-8">Score</th>
                <th className="px-4 py-2 text-left">Produit</th>
                <th className="px-4 py-2 text-left">Suggestions</th>
                <th className="px-4 py-2 text-left w-28">Statut</th>
                <th className="px-4 py-2 text-center w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={5} className="py-8 text-center text-gray-400">Chargement…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-gray-400">Aucun résultat</td></tr>
              ) : (
                filtered.map((r) => {
                  const st = (statuses[r.id] ?? "todo") as SeoStatus;
                  const isEditing = editingId === r.id;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <Voyant score={r.score} />
                      </td>
                      <td className="px-4 py-2.5 min-w-0 max-w-[200px]">
                        <Link
                          href={`/admin/produits/${r.id}`}
                          className="block font-medium text-gray-800 hover:text-[#cc1818] truncate transition-colors"
                        >
                          {r.title}
                        </Link>
                        {r.sku && <p className="text-[10px] text-gray-400">{r.sku}</p>}
                        {/* Inline edit SEO fields */}
                        {isEditing && (
                          <div className="mt-2 space-y-1.5">
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Titre SEO</label>
                              <input
                                type="text"
                                maxLength={70}
                                value={editFields.seo_title}
                                onChange={(e) => setEditFields((f) => ({ ...f, seo_title: e.target.value }))}
                                className="w-full rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs focus:outline-none"
                                placeholder="Titre SEO…"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Meta description</label>
                              <textarea
                                maxLength={155}
                                rows={2}
                                value={editFields.seo_description}
                                onChange={(e) => setEditFields((f) => ({ ...f, seo_description: e.target.value }))}
                                className="w-full rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs focus:outline-none resize-none"
                                placeholder="Meta description…"
                              />
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={saveEdit}
                                disabled={editSaving}
                                className="rounded bg-[#cc1818] px-2 py-0.5 text-[10px] font-semibold text-white disabled:opacity-60"
                              >
                                {editSaved === r.id ? "✓" : editSaving ? "…" : "Sauver"}
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="rounded border border-gray-200 px-2 py-0.5 text-[10px] text-gray-400"
                              >
                                Annuler
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 max-w-[220px]">
                        {r.suggestions.length === 0 ? (
                          <span className="text-green-600">✓ OK</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {r.suggestions.slice(0, 3).map((s) => (
                              <li key={s} className="text-orange-600">⚠ {s}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={st}
                          onChange={(e) => saveStatus(r.id, e.target.value as SeoStatus)}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium border-0 focus:outline-none cursor-pointer ${SEO_STATUS_COLORS[st]}`}
                        >
                          {(Object.keys(SEO_STATUS_LABELS) as SeoStatus[]).map((s) => (
                            <option key={s} value={s}>{SEO_STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex justify-center gap-1.5">
                          <button
                            onClick={() => isEditing ? setEditingId(null) : openEdit(r)}
                            className="text-[#cc1818] hover:underline"
                            title="Modifier SEO"
                          >
                            {isEditing ? "✕" : "✏️"}
                          </button>
                          <Link
                            href={`/admin/produits/${r.id}`}
                            className="text-gray-400 hover:text-gray-700"
                            title="Fiche complète"
                          >
                            →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
