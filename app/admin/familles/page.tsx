"use client";

import { useState, useEffect, useCallback } from "react";
import { adminFetch } from "lib/admin/fetch";

interface FamilyMember {
  id: string;
  member_type: "product" | "variant" | "autonomous";
  member_product_id: string | null;
  member_variant_id: string | null;
  position: number;
  active: boolean;
  axes_summary: string | null;
  products?: { id: string; name: string; slug: string; sku: string; status: string } | null;
  variants?: { id: string; name: string; sku: string; stock_status: string; regular_price: number } | null;
}

interface Family {
  id: string;
  name: string;
  slug: string;
  strategy: string;
  active: boolean;
  published_at: string | null;
  created_at: string;
  parent_product_id: string;
  products?: { id: string; name: string; slug: string; sku: string; status: string } | null;
  product_family_members?: FamilyMember[];
}

interface AuditResult {
  total_active_families: number;
  pending_candidates: number;
  parents_without_children: Array<{ id: string; name: string }>;
  orphan_products: Array<{ id: string; name: string; sku: string; parent_sku: string }>;
  large_families: Array<{ id: string; name: string; count: number }>;
  issues: number;
}

interface Suggestion {
  parent: { id: string; name: string; sku: string };
  children: Array<{ id: string; name: string; sku: string }>;
  strategy: string;
  score: number;
  reasons: string[];
}

interface DbStatus {
  available: boolean;
  reason?: string;
  migration?: string;
}

const STRATEGY_LABELS: Record<string, string> = {
  parent_sku: "Parent SKU",
  sku_root: "Racine SKU",
  title_root: "Titre similaire",
  manual: "Manuel",
};

export default function FamillesPage() {
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [families, setFamilies] = useState<Family[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestStrategy, setSuggestStrategy] = useState("parent_sku");
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [applyingIdx, setApplyingIdx] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<"list" | "audit" | "suggest">("list");

  // ── Check DB status ──────────────────────────────────────────────────────────
useEffect(() => {
    adminFetch("/api/admin/families/status")
      .then(async (r: Response) => {
        if (!r.ok) {
          if (r.status === 401) {
            setDbStatus({ available: false, reason: "UNAUTHORIZED" });
            return;
          }
          setDbStatus({ available: false, reason: `HTTP_${r.status}` });
          return;
        }
        const d: DbStatus = await r.json();
        setDbStatus(d);
      })
      .catch(() => setDbStatus({ available: false, reason: "FETCH_ERROR" }));
  }, []);

  // ── Load families ────────────────────────────────────────────────────────────
  const loadFamilies = useCallback(async () => {
    if (!dbStatus?.available) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        active: activeOnly ? "true" : "false",
        limit: "50",
      });
      if (search) params.set("q", search);
      const res = await adminFetch(`/api/admin/families?${params}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erreur"); return; }
      setFamilies(data.families ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [dbStatus, activeOnly, search]);

  useEffect(() => { loadFamilies(); }, [loadFamilies]);

  // ── Load audit ───────────────────────────────────────────────────────────────
  async function runAudit() {
    if (!dbStatus?.available) return;
    setAuditLoading(true);
    try {
      const res = await adminFetch("/api/admin/families/audit");
      if (res.ok) setAudit(await res.json());
    } finally {
      setAuditLoading(false);
    }
  }

  // ── Run suggestions ──────────────────────────────────────────────────────────
  async function runSuggest() {
    if (!dbStatus?.available) return;
    setSuggestLoading(true);
    setSuggestions([]);
    try {
      const res = await adminFetch("/api/admin/families/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: suggestStrategy, limit: 50 }),
      });
      const data = await res.json();
      if (res.ok) setSuggestions(data.suggestions ?? []);
      else setError(data.error ?? "Erreur suggestion");
    } finally {
      setSuggestLoading(false);
    }
  }

  // ── Apply selected suggestions ───────────────────────────────────────────────
  async function applySuggestion(idx: number, suggestion: Suggestion) {
    setApplyingIdx((prev) => new Set([...prev, idx]));
    try {
      const res = await adminFetch("/api/admin/families/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent_product_id: suggestion.parent.id,
          member_product_ids: suggestion.children.map((c) => c.id),
          strategy: suggestion.strategy,
          name: suggestion.parent.name,
        }),
      });
      if (res.ok) {
        setSuggestions((prev) => prev.filter((_, i) => i !== idx));
        loadFamilies();
      }
    } finally {
      setApplyingIdx((prev) => { const n = new Set(prev); n.delete(idx); return n; });
    }
  }

  // ── Deactivate family ────────────────────────────────────────────────────────
  async function deactivateFamily(familyId: string) {
    if (!confirm("Désactiver cette famille ?")) return;
    await adminFetch("/api/admin/families/disassemble", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ family_id: familyId }),
    });
    loadFamilies();
  }

  // ── Remove member ────────────────────────────────────────────────────────────
  async function removeMember(familyId: string, memberId: string) {
    await adminFetch(`/api/admin/families/${familyId}/members/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: memberId }),
    });
    loadFamilies();
  }

  // ── Export CSV ───────────────────────────────────────────────────────────────
  async function exportCsv() {
    const res = await adminFetch("/api/admin/families/export?format=csv");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `familles-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const activeMemberCount = (f: Family) =>
    (f.product_family_members ?? []).filter((m) => m.active).length;

  // ── Migration gate ───────────────────────────────────────────────────────────
  if (dbStatus === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-gray-400">
          <div className="text-4xl mb-3">🔗</div>
          <p>Vérification de la base de données…</p>
        </div>
      </div>
    );
  }

  if (!dbStatus.available) {
    if (dbStatus.reason === "UNAUTHORIZED") {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Familles produits</h1>
            <p className="text-sm text-gray-500 mt-1">Groupement mères / filles</p>
          </div>
          <div className="rounded-xl border border-red-300 bg-red-50 p-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <h2 className="font-semibold text-red-900">Session admin expirée</h2>
                <p className="text-red-800 mt-1">
                  Reconnectez-vous sur <code className="rounded bg-red-100 px-1">/admin/login</code> pour recharger le token de session.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Familles produits</h1>
          <p className="text-sm text-gray-500 mt-1">Groupement mères / filles</p>
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h2 className="font-semibold text-amber-900">Migration requise</h2>
              <p className="mt-1 text-sm text-amber-800">
                La table <code className="rounded bg-amber-100 px-1">product_families</code> n&apos;existe pas encore.
              </p>
              <p className="mt-2 text-sm text-amber-700">
                Appliquez la migration <strong>016-product-families.sql</strong> dans Supabase Dashboard &gt; SQL Editor.
              </p>
              <div className="mt-3 rounded bg-amber-100 p-3 font-mono text-xs text-amber-900">
                -- Fichier: commerce/docs/sql-migrations/016-product-families.sql
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Familles produits</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} famille{total !== 1 ? "s" : ""} · Groupement mères / filles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Exporter CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([["list", "Familles"], ["audit", "Audit"], ["suggest", "Suggestions IA"]] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => { setTab(t); if (t === "audit" && !audit) runAudit(); if (t === "suggest") runSuggest(); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? "border-blue-500 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            {t === "audit" && audit && audit.issues > 0 && (
              <span className="ml-1.5 rounded-full bg-red-100 px-1.5 text-[10px] font-medium text-red-700">
                {audit.issues}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── LIST TAB ────────────────────────────────────────────────────────── */}
      {tab === "list" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une famille…"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none flex-1 min-w-48"
            />
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
              Actives uniquement
            </label>
            <button onClick={loadFamilies} className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
              Actualiser
            </button>
          </div>

          {loading && <p className="text-sm text-gray-400">Chargement…</p>}

          {/* Family tree */}
          <div className="space-y-2">
            {families.length === 0 && !loading && (
              <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400">
                <div className="text-3xl mb-2">🔗</div>
                <p className="text-sm">Aucune famille trouvée.</p>
                <p className="text-xs mt-1">Utilisez l&apos;onglet "Suggestions IA" pour en créer automatiquement.</p>
              </div>
            )}

            {families.map((family) => {
              const expanded = expandedIds.has(family.id);
              const selected = selectedIds.has(family.id);
              const activeMembers = (family.product_family_members ?? []).filter((m) => m.active);

              return (
                <div
                  key={family.id}
                  className={`rounded-xl border transition-all ${
                    selected ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white"
                  }`}
                >
                  {/* Family header */}
                  <div className="flex items-center gap-3 p-4">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelect(family.id)}
                      className="rounded"
                    />
                    <button
                      onClick={() => toggleExpand(family.id)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      <span className="text-gray-400 text-xs">{expanded ? "▼" : "▶"}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{family.name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            family.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                          }`}>
                            {family.active ? "active" : "inactive"}
                          </span>
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                            {STRATEGY_LABELS[family.strategy] ?? family.strategy}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Mère: <strong>{(family.products as { sku: string } | null)?.sku ?? "?"}</strong>
                          {" · "}
                          {activeMemberCount(family)} fille{activeMemberCount(family) !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/product/${(family.products as { slug: string } | null)?.slug ?? ""}`}
                        target="_blank"
                        className="text-xs text-gray-400 hover:text-blue-600"
                      >
                        Voir
                      </a>
                      <button
                        onClick={() => deactivateFamily(family.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Désactiver
                      </button>
                    </div>
                  </div>

                  {/* Members list */}
                  {expanded && (
                    <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                      {activeMembers.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">Aucune fille active.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {/* Axis header: Options → Coloris → Lots */}
                          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">
                            Filles — ordre: Options › Coloris › Lots
                          </div>
                          {activeMembers
                            .sort((a, b) => a.position - b.position)
                            .map((member) => {
                              const mp = member.products ?? member.variants;
                              const memberName = mp ? (mp as { name: string }).name : "Inconnu";
                              const memberSku = mp ? (mp as { sku: string }).sku : "—";

                              return (
                                <div key={member.id} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                                  <span className="text-gray-300">┗</span>
                                  <div className="flex-1">
                                    <span className="font-medium text-gray-800">{memberName}</span>
                                    <span className="ml-2 text-xs text-gray-400">{memberSku}</span>
                                    {member.axes_summary && (
                                      <span className="ml-2 text-xs text-indigo-600">[{member.axes_summary}]</span>
                                    )}
                                    <span className="ml-2 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                                      {member.member_type}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => removeMember(family.id, member.id)}
                                    className="text-xs text-gray-400 hover:text-red-500"
                                  >
                                    Détacher
                                  </button>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── AUDIT TAB ────────────────────────────────────────────────────────── */}
      {tab === "audit" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-900">Audit familles</h2>
            <button
              onClick={runAudit}
              disabled={auditLoading}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {auditLoading ? "Analyse…" : "Relancer"}
            </button>
          </div>

          {audit && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Familles actives", value: audit.total_active_families, color: "green" },
                { label: "Candidats en attente", value: audit.pending_candidates, color: "blue" },
                { label: "Problèmes", value: audit.issues, color: audit.issues > 0 ? "red" : "green" },
                { label: "Orphelines", value: audit.orphan_products.length, color: audit.orphan_products.length > 0 ? "orange" : "green" },
              ].map((kpi) => (
                <div key={kpi.label} className={`rounded-xl border p-4 bg-${kpi.color}-50 border-${kpi.color}-200`}>
                  <p className={`text-2xl font-bold text-${kpi.color}-700`}>{kpi.value}</p>
                  <p className={`text-xs text-${kpi.color}-600 mt-0.5`}>{kpi.label}</p>
                </div>
              ))}
            </div>
          )}

          {audit && audit.orphan_products.length > 0 && (
            <div className="rounded-xl border border-orange-200 bg-white p-4">
              <h3 className="font-medium text-gray-900 mb-2">
                Produits orphelins ({audit.orphan_products.length})
              </h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {audit.orphan_products.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 text-xs text-gray-700 py-1 border-b border-gray-50">
                    <span className="font-mono text-gray-400">{p.sku}</span>
                    <span className="flex-1">{p.name}</span>
                    <span className="text-gray-400">parent_sku: {p.parent_sku}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {audit && audit.parents_without_children.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-white p-4">
              <h3 className="font-medium text-gray-900 mb-2">
                Familles sans filles ({audit.parents_without_children.length})
              </h3>
              <div className="space-y-1">
                {audit.parents_without_children.map((f) => (
                  <div key={f.id} className="text-xs text-gray-700">{f.name}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SUGGEST TAB ──────────────────────────────────────────────────────── */}
      {tab === "suggest" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-900">Suggestions de familles</h2>
            <select
              value={suggestStrategy}
              onChange={(e) => setSuggestStrategy(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none"
            >
              <option value="parent_sku">Stratégie: parent_sku (prioritaire)</option>
              <option value="sku_root">Stratégie: sku_root</option>
            </select>
            <button
              onClick={runSuggest}
              disabled={suggestLoading}
              className="rounded-lg bg-[#cc1818] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#b01414] disabled:opacity-50"
            >
              {suggestLoading ? "Analyse…" : "Analyser"}
            </button>
          </div>

          <p className="text-sm text-gray-500">
            {suggestions.length > 0
              ? `${suggestions.length} suggestion${suggestions.length > 1 ? "s" : ""} — cliquez "Assembler" pour créer la famille`
              : "Lancez l'analyse pour détecter les familles potentielles."}
          </p>

          <div className="space-y-3">
            {suggestions.map((s, idx) => (
              <div key={idx} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <input
                      type="checkbox"
                      checked={selectedSuggestions.has(idx)}
                      onChange={() => setSelectedSuggestions((prev) => {
                        const n = new Set(prev);
                        n.has(idx) ? n.delete(idx) : n.add(idx);
                        return n;
                      })}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">👑 {s.parent.name}</span>
                        <span className="font-mono text-xs text-gray-400">{s.parent.sku}</span>
                        <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
                          score {s.score}
                        </span>
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                          {STRATEGY_LABELS[s.strategy] ?? s.strategy}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {s.children.map((c) => (
                          <span key={c.id} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                            {c.name} <span className="text-gray-400">{c.sku}</span>
                          </span>
                        ))}
                      </div>
                      <div className="mt-1 text-[10px] text-gray-400">
                        Raisons: {s.reasons.join(", ")}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => applySuggestion(idx, s)}
                    disabled={applyingIdx.has(idx)}
                    className="whitespace-nowrap rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {applyingIdx.has(idx) ? "…" : "Assembler"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
