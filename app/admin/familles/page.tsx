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
  branch_summary?: {
    total_skus: number;
    roots: Array<{
      root: string;
      branches: Array<{
        price_branch: string;
        count: number;
        style_examples: string[];
        samples: string[];
      }>;
    }>;
  };
}

interface AuditResult {
  total_active_families: number;
  pending_candidates: number;
  native_candidates?: number;
  parents_without_children: Array<{ id: string; name: string }>;
  orphan_products: Array<{ id: string; name: string; sku: string; parent_sku: string }>;
  large_families: Array<{ id: string; name: string; count: number }>;
  potential_suggestions?: number;
  potential_breakdown?: Record<string, number>;
  potential_examples?: Suggestion[];
  native_examples?: Array<{ id: string; name: string; sku: string | null; variants: number }>;
  issues: number;
  scope?: {
    mode: "all" | "latest_import" | string;
    since?: string | null;
    products_considered?: number;
  };
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

interface FamilyPricingAttribute {
  id: string;
  name: string;
  slug: string | null;
  terms: string[];
  impacts_price: boolean;
  auto_impacts_price: boolean;
}

interface FamilyPricingState {
  loading: boolean;
  saving: boolean;
  loaded: boolean;
  error: string | null;
  attributes: FamilyPricingAttribute[];
  selectedIds: string[];
  autoIds: string[];
}

const STRATEGY_LABELS: Record<string, string> = {
  auto: "Auto",
  parent_sku: "Parent SKU",
  sku_root: "Racine SKU",
  title_root: "Titre similaire",
  native_variants: "Variantes natives",
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
  const [suggestStrategy, setSuggestStrategy] = useState("auto");
  const [createDedicatedMother, setCreateDedicatedMother] = useState(true);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [applyingIdx, setApplyingIdx] = useState<Set<number>>(new Set());
  const [bulkApplyLoading, setBulkApplyLoading] = useState(false);
  const [bulkDeactivateLoading, setBulkDeactivateLoading] = useState(false);
  const [dragMember, setDragMember] = useState<{ familyId: string; memberId: string } | null>(null);
  const [tab, setTab] = useState<"list" | "audit" | "suggest">("list");
  const [familyPricing, setFamilyPricing] = useState<Record<string, FamilyPricingState>>({});
  const [focusLatestImport, setFocusLatestImport] = useState(false);

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
      if (focusLatestImport) params.set("scope", "latest_import");
      const res = await adminFetch(`/api/admin/families?${params}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erreur"); return; }
      setFamilies(data.families ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [dbStatus, activeOnly, search, focusLatestImport]);

  useEffect(() => { loadFamilies(); }, [loadFamilies]);

  // ── Load audit ───────────────────────────────────────────────────────────────
  async function runAudit() {
    if (!dbStatus?.available) return;
    setAuditLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (focusLatestImport) params.set("scope", "latest_import");
      const suffix = params.toString();
      const res = await adminFetch(`/api/admin/families/audit${suffix ? `?${suffix}` : ""}`);
      if (res.ok) setAudit(await res.json());
      else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erreur audit");
      }
    } finally {
      setAuditLoading(false);
    }
  }

  // ── Run suggestions ──────────────────────────────────────────────────────────
  async function runSuggest() {
    if (!dbStatus?.available) return;
    setSuggestLoading(true);
    setSuggestions([]);
    setSelectedSuggestions(new Set());
    setError(null);
    try {
      const res = await adminFetch("/api/admin/families/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy: suggestStrategy,
          limit: 50,
          import_scope: focusLatestImport ? "latest_import" : "all",
        }),
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
          parent_product_id: createDedicatedMother ? undefined : suggestion.parent.id,
          member_product_ids: suggestion.children.map((c) => c.id),
          create_parent_product: createDedicatedMother,
          parent_name: suggestion.parent.name,
          strategy: suggestion.strategy,
          name: suggestion.parent.name,
        }),
      });
      if (res.ok) {
        setSuggestions((prev) => prev.filter((_, i) => i !== idx));
        setSelectedSuggestions((prev) => {
          const next = new Set<number>();
          [...prev].forEach((i) => {
            if (i === idx) return;
            next.add(i > idx ? i - 1 : i);
          });
          return next;
        });
        loadFamilies();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Impossible d'assembler la suggestion");
      }
    } finally {
      setApplyingIdx((prev) => { const n = new Set(prev); n.delete(idx); return n; });
    }
  }

  async function applySelectedSuggestions() {
    if (selectedSuggestions.size === 0) return;
    setBulkApplyLoading(true);
    const selected = [...selectedSuggestions].sort((a, b) => b - a);
    try {
      for (const idx of selected) {
        const suggestion = suggestions[idx];
        if (!suggestion) continue;
        await applySuggestion(idx, suggestion);
      }
      setSelectedSuggestions(new Set());
    } finally {
      setBulkApplyLoading(false);
    }
  }

  async function deactivateSelectedFamilies() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Désactiver ${selectedIds.size} famille(s) sélectionnée(s) ?`)) return;
    setBulkDeactivateLoading(true);
    try {
      for (const id of selectedIds) {
        if (id.startsWith("native-")) continue;
        await adminFetch("/api/admin/families/disassemble", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ family_id: id }),
        });
      }
      setSelectedIds(new Set());
      await loadFamilies();
    } finally {
      setBulkDeactivateLoading(false);
    }
  }

  async function reorderMembers(familyId: string, orderedIds: string[]) {
    if (familyId.startsWith("native-")) return;
    const res = await adminFetch(`/api/admin/families/${familyId}/members/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordered_ids: orderedIds }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? "Impossible de réordonner");
    }
  }

  async function loadFamilyPricing(familyId: string) {
    setFamilyPricing((prev) => ({
      ...prev,
      [familyId]: {
        loading: true,
        saving: prev[familyId]?.saving ?? false,
        loaded: prev[familyId]?.loaded ?? false,
        error: null,
        attributes: prev[familyId]?.attributes ?? [],
        selectedIds: prev[familyId]?.selectedIds ?? [],
        autoIds: prev[familyId]?.autoIds ?? [],
      },
    }));

    try {
      const res = await adminFetch(`/api/admin/families/${familyId}/pricing-attributes`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFamilyPricing((prev) => ({
          ...prev,
          [familyId]: {
            loading: false,
            saving: prev[familyId]?.saving ?? false,
            loaded: prev[familyId]?.loaded ?? false,
            error: data.error ?? "Erreur chargement règles tarifaires",
            attributes: prev[familyId]?.attributes ?? [],
            selectedIds: prev[familyId]?.selectedIds ?? [],
            autoIds: prev[familyId]?.autoIds ?? [],
          },
        }));
        return;
      }

      const attributes: FamilyPricingAttribute[] = data.attributes ?? [];
      const selectedIds: string[] =
        data.selected_attribute_ids ??
        attributes.filter((a) => a.impacts_price).map((a) => a.id);
      const autoIds: string[] =
        data.auto_suggested_attribute_ids ??
        attributes.filter((a) => a.auto_impacts_price).map((a) => a.id);

      setFamilyPricing((prev) => ({
        ...prev,
        [familyId]: {
          loading: false,
          saving: false,
          loaded: true,
          error: null,
          attributes,
          selectedIds,
          autoIds,
        },
      }));
    } catch {
      setFamilyPricing((prev) => ({
        ...prev,
        [familyId]: {
          loading: false,
          saving: prev[familyId]?.saving ?? false,
          loaded: prev[familyId]?.loaded ?? false,
          error: "Erreur réseau",
          attributes: prev[familyId]?.attributes ?? [],
          selectedIds: prev[familyId]?.selectedIds ?? [],
          autoIds: prev[familyId]?.autoIds ?? [],
        },
      }));
    }
  }

  function toggleFamilyPricingAttribute(familyId: string, attributeId: string, checked: boolean) {
    setFamilyPricing((prev) => {
      const current = prev[familyId];
      if (!current) return prev;
      const selected = new Set(current.selectedIds);
      if (checked) selected.add(attributeId);
      else selected.delete(attributeId);
      return {
        ...prev,
        [familyId]: {
          ...current,
          selectedIds: [...selected],
        },
      };
    });
  }

  function applyFamilyAutoPricing(familyId: string) {
    setFamilyPricing((prev) => {
      const current = prev[familyId];
      if (!current) return prev;
      return {
        ...prev,
        [familyId]: {
          ...current,
          selectedIds: [...current.autoIds],
        },
      };
    });
  }

  async function saveFamilyPricing(familyId: string) {
    const current = familyPricing[familyId];
    if (!current) return;

    setFamilyPricing((prev) => ({
      ...prev,
      [familyId]: { ...current, saving: true, error: null },
    }));

    try {
      const res = await adminFetch(`/api/admin/families/${familyId}/pricing-attributes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attribute_ids: current.selectedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFamilyPricing((prev) => ({
          ...prev,
          [familyId]: {
            ...current,
            saving: false,
            error: data.error ?? "Impossible d'enregistrer les règles",
          },
        }));
        return;
      }
      await loadFamilyPricing(familyId);
    } catch {
      setFamilyPricing((prev) => ({
        ...prev,
        [familyId]: {
          ...current,
          saving: false,
          error: "Erreur réseau",
        },
      }));
    }
  }

  async function handleDropMember(family: Family, targetMemberId: string) {
    if (!dragMember || dragMember.familyId !== family.id || dragMember.memberId === targetMemberId) {
      return;
    }
    const members = [...(family.product_family_members ?? [])]
      .filter((m) => m.active)
      .sort((a, b) => a.position - b.position);
    const from = members.findIndex((m) => m.id === dragMember.memberId);
    const to = members.findIndex((m) => m.id === targetMemberId);
    if (from < 0 || to < 0 || from === to) {
      setDragMember(null);
      return;
    }

    const reordered = [...members];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved!);

    // Optimistic UI update
    setFamilies((prev) =>
      prev.map((f) => {
        if (f.id !== family.id) return f;
        const byId = new Map(reordered.map((m, i) => [m.id, { ...m, position: i }]));
        return {
          ...f,
          product_family_members: (f.product_family_members ?? []).map(
            (m) => byId.get(m.id) ?? m,
          ),
        };
      }),
    );

    try {
      await reorderMembers(family.id, reordered.map((m) => m.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de réordonnancement");
      await loadFamilies();
    } finally {
      setDragMember(null);
    }
  }

  // ── Deactivate family ────────────────────────────────────────────────────────
  async function deactivateFamily(familyId: string) {
    if (familyId.startsWith("native-")) return;
    if (!confirm("Désactiver cette famille ?")) return;
    const res = await adminFetch("/api/admin/families/disassemble", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ family_id: familyId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Impossible de désactiver la famille");
      return;
    }
    loadFamilies();
  }

  // ── Remove member ────────────────────────────────────────────────────────────
  async function removeMember(familyId: string, memberId: string) {
    if (familyId.startsWith("native-")) return;
    const res = await adminFetch(`/api/admin/families/${familyId}/members/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: memberId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Impossible de détacher la fille");
      return;
    }
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
            <h1 className="text-2xl font-bold text-gray-900">Produits mères</h1>
            <p className="text-sm text-gray-500 mt-1">Structure mère / filles</p>
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
          <h1 className="text-2xl font-bold text-gray-900">Produits mères</h1>
          <p className="text-sm text-gray-500 mt-1">Structure mère / filles</p>
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
          <h1 className="text-2xl font-bold text-gray-900">Mères / Filles produits</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} mère{total !== 1 ? "s" : ""} · Arbres produits éditables
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
            <input
              type="checkbox"
              className="mr-1 align-middle"
              checked={focusLatestImport}
              onChange={(e) => setFocusLatestImport(e.target.checked)}
            />
            Scope: dernier import
          </label>
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
        {([["list", "Mères"], ["audit", "Audit"], ["suggest", "Suggestions Mères/Filles IA"]] as const).map(([t, label]) => (
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
                placeholder="Rechercher une mère…"
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
          {focusLatestImport && (
            <p className="text-xs text-indigo-700">
              Affichage limité aux mères/filles liées aux produits modifiés depuis le dernier import.
            </p>
          )}

          {selectedIds.size > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
              <span className="font-medium text-blue-800">
                {selectedIds.size} mère(s) sélectionnée(s)
              </span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-blue-700 underline"
              >
                Réinitialiser la sélection
              </button>
              <button
                onClick={deactivateSelectedFamilies}
                disabled={bulkDeactivateLoading}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDeactivateLoading ? "Désactivation…" : "Désactiver les mères sélectionnées"}
              </button>
            </div>
          )}

          {loading && <p className="text-sm text-gray-400">Chargement…</p>}

          {/* Family tree */}
          <div className="space-y-2">
            {families.length === 0 && !loading && (
              <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400">
                <div className="text-3xl mb-2">🔗</div>
                <p className="text-sm">Aucune mère trouvée.</p>
                <p className="text-xs mt-1">Utilisez l&apos;onglet "Suggestions Mères/Filles IA" pour en créer automatiquement.</p>
              </div>
            )}

            {families.map((family) => {
              const expanded = expandedIds.has(family.id);
              const selected = selectedIds.has(family.id);
              const activeMembers = (family.product_family_members ?? []).filter((m) => m.active);
              const isNative = family.id.startsWith("native-") || family.strategy === "native_variants";

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
                      disabled={isNative}
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
                          {isNative && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                              virtuel
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Mère: <strong>{(family.products as { sku: string } | null)?.sku ?? "sans SKU"}</strong>
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
                        disabled={isNative}
                        className="text-xs text-red-400 hover:text-red-600 disabled:cursor-not-allowed disabled:text-gray-300"
                      >
                        {isNative ? "Natif" : "Désactiver"}
                      </button>
                    </div>
                  </div>

                  {/* Members list */}
                  {expanded && (
                    <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                      <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                          Arbre SKU / PUID (racine → branche prix → styles)
                        </p>
                        {!family.branch_summary || family.branch_summary.total_skus === 0 ? (
                          <p className="text-xs text-indigo-700/80">
                            Aucun SKU exploitable détecté sur les filles de cette mère.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {family.branch_summary.roots.map((root) => (
                              <div key={root.root} className="rounded border border-indigo-100 bg-white p-2">
                                <p className="text-xs font-semibold text-indigo-800">
                                  Racine: <span className="font-mono">{root.root}</span>
                                </p>
                                <div className="mt-1 space-y-1">
                                  {root.branches.map((branch) => (
                                    <div
                                      key={`${root.root}-${branch.price_branch}`}
                                      className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-xs"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-gray-700">
                                          Branche prix: <span className="font-mono">{branch.price_branch}</span>
                                        </span>
                                        <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-700">
                                          {branch.count} refs
                                        </span>
                                      </div>
                                      {branch.style_examples.length > 0 && (
                                        <p className="mt-1 text-[11px] text-gray-500">
                                          Styles: {branch.style_examples.join(", ")}
                                        </p>
                                      )}
                                      {branch.samples.length > 0 && (
                                        <p className="mt-1 font-mono text-[10px] text-gray-400">
                                          Ex: {branch.samples.join(" · ")}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {!isNative && (
                        <div className="mb-3 rounded-lg border border-purple-200 bg-purple-50 p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
                              Attributs qui impactent le prix (famille)
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => loadFamilyPricing(family.id)}
                                className="rounded border border-purple-300 px-2 py-1 text-[11px] text-purple-700 hover:bg-purple-100"
                              >
                                {familyPricing[family.id]?.loading ? "Chargement…" : "Charger / Rafraîchir"}
                              </button>
                              {familyPricing[family.id]?.loaded && (
                                <button
                                  onClick={() => applyFamilyAutoPricing(family.id)}
                                  className="rounded border border-amber-300 px-2 py-1 text-[11px] text-amber-700 hover:bg-amber-50"
                                >
                                  Suggestion auto
                                </button>
                              )}
                              {familyPricing[family.id]?.loaded && (
                                <button
                                  onClick={() => saveFamilyPricing(family.id)}
                                  disabled={familyPricing[family.id]?.saving}
                                  className="rounded bg-purple-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                                >
                                  {familyPricing[family.id]?.saving ? "Enregistrement…" : "Enregistrer"}
                                </button>
                              )}
                            </div>
                          </div>

                          {familyPricing[family.id]?.error && (
                            <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                              {familyPricing[family.id]?.error}
                            </p>
                          )}

                          {!familyPricing[family.id]?.loaded ? (
                            <p className="text-xs text-purple-700/80">
                              Chargez les attributs de la famille pour définir ce qui pilote la grille tarifaire.
                            </p>
                          ) : familyPricing[family.id]?.attributes.length === 0 ? (
                            <p className="text-xs text-purple-700/80">
                              Aucun attribut de variation disponible sur la mère de cette famille.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                              {familyPricing[family.id]?.attributes.map((attr) => (
                                <label key={attr.id} className="flex items-center gap-2 text-xs text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={familyPricing[family.id]?.selectedIds.includes(attr.id)}
                                    onChange={(e) =>
                                      toggleFamilyPricingAttribute(family.id, attr.id, e.target.checked)
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
                          )}
                        </div>
                      )}

                      {activeMembers.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">Aucune fille active.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {/* Axis header: Options → Coloris → Lots */}
                          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">
                            Filles — ordre: Options › Coloris › Lots · glisser-déposer pour réordonner
                          </div>
                          {activeMembers
                            .sort((a, b) => a.position - b.position)
                            .map((member) => {
                              const mp = member.products ?? member.variants;
                              const memberName = mp ? (mp as { name: string }).name : "Inconnu";
                              const memberSku = mp ? (mp as { sku: string }).sku : "—";

                              return (
                                <div
                                  key={member.id}
                                  draggable={!isNative}
                                  onDragStart={() => !isNative && setDragMember({ familyId: family.id, memberId: member.id })}
                                  onDragEnd={() => setDragMember(null)}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={() => !isNative && handleDropMember(family, member.id)}
                                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                                    dragMember?.memberId === member.id
                                      ? "bg-blue-100 ring-1 ring-blue-300"
                                      : "bg-gray-50"
                                  }`}
                                >
                                  <span className="cursor-move text-gray-300" title="Glisser pour réordonner">
                                    ⋮⋮
                                  </span>
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
                                    disabled={isNative}
                                    className="text-xs text-gray-400 hover:text-red-500 disabled:cursor-not-allowed disabled:text-gray-300"
                                  >
                                    {isNative ? "—" : "Détacher"}
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
            <h2 className="font-semibold text-gray-900">Audit Mères / Filles</h2>
            <button
              onClick={runAudit}
              disabled={auditLoading}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {auditLoading ? "Analyse…" : "Relancer"}
            </button>
          </div>
          {audit?.scope?.mode === "latest_import" && (
            <p className="text-xs text-indigo-700">
              Scope actif: dernier import
              {audit.scope.since ? ` (depuis ${new Date(audit.scope.since).toLocaleString("fr-FR")})` : ""}
              {typeof audit.scope.products_considered === "number"
                ? ` · ${audit.scope.products_considered} produit(s) considérés`
                : ""}
            </p>
          )}

          {audit && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
              {[
                {
                  label: "Mères actives",
                  value: audit.total_active_families,
                  wrapper: "rounded-xl border border-green-200 bg-green-50 p-4",
                  valueClass: "text-2xl font-bold text-green-700",
                  labelClass: "mt-0.5 text-xs text-green-600",
                },
                {
                  label: "Candidats en attente",
                  value: audit.pending_candidates,
                  wrapper: "rounded-xl border border-blue-200 bg-blue-50 p-4",
                  valueClass: "text-2xl font-bold text-blue-700",
                  labelClass: "mt-0.5 text-xs text-blue-600",
                },
                {
                  label: "Problèmes",
                  value: audit.issues,
                  wrapper:
                    audit.issues > 0
                      ? "rounded-xl border border-red-200 bg-red-50 p-4"
                      : "rounded-xl border border-green-200 bg-green-50 p-4",
                  valueClass: audit.issues > 0 ? "text-2xl font-bold text-red-700" : "text-2xl font-bold text-green-700",
                  labelClass: audit.issues > 0 ? "mt-0.5 text-xs text-red-600" : "mt-0.5 text-xs text-green-600",
                },
                {
                  label: "Orphelines",
                  value: audit.orphan_products.length,
                  wrapper:
                    audit.orphan_products.length > 0
                      ? "rounded-xl border border-orange-200 bg-orange-50 p-4"
                      : "rounded-xl border border-green-200 bg-green-50 p-4",
                  valueClass:
                    audit.orphan_products.length > 0
                      ? "text-2xl font-bold text-orange-700"
                      : "text-2xl font-bold text-green-700",
                  labelClass:
                    audit.orphan_products.length > 0 ? "mt-0.5 text-xs text-orange-600" : "mt-0.5 text-xs text-green-600",
                },
                {
                  label: "Suggestions potentielles",
                  value: audit.potential_suggestions ?? 0,
                  wrapper: "rounded-xl border border-indigo-200 bg-indigo-50 p-4",
                  valueClass: "text-2xl font-bold text-indigo-700",
                  labelClass: "mt-0.5 text-xs text-indigo-600",
                },
                {
                  label: "Mères natives",
                  value: audit.native_candidates ?? 0,
                  wrapper: "rounded-xl border border-purple-200 bg-purple-50 p-4",
                  valueClass: "text-2xl font-bold text-purple-700",
                  labelClass: "mt-0.5 text-xs text-purple-600",
                },
              ].map((kpi) => (
                <div key={kpi.label} className={kpi.wrapper}>
                  <p className={kpi.valueClass}>{kpi.value}</p>
                  <p className={kpi.labelClass}>{kpi.label}</p>
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
                Mères sans filles ({audit.parents_without_children.length})
              </h3>
              <div className="space-y-1">
                {audit.parents_without_children.map((f) => (
                  <div key={f.id} className="text-xs text-gray-700">{f.name}</div>
                ))}
              </div>
            </div>
          )}

          {audit && (audit.potential_examples ?? []).length > 0 && (
            <div className="rounded-xl border border-indigo-200 bg-white p-4">
              <h3 className="mb-2 font-medium text-gray-900">
                Exemples de groupements potentiels ({audit.potential_examples?.length})
              </h3>
              <div className="space-y-1.5 text-xs">
                {(audit.potential_examples ?? []).map((s, idx) => (
                  <div key={`${s.parent.id}-${idx}`} className="rounded bg-indigo-50 px-2 py-1 text-indigo-900">
                    <strong>{s.parent.name}</strong> ({s.parent.sku ?? "—"}) · {s.children.length} fille(s) ·{" "}
                    <span className="text-indigo-700">{s.strategy}</span>
                  </div>
                ))}
              </div>
              {audit.potential_breakdown && (
                <p className="mt-3 text-xs text-gray-500">
                  Détail: parent_sku {audit.potential_breakdown.parent_sku ?? 0} · sku_root{" "}
                  {audit.potential_breakdown.sku_root ?? 0} · title_root {audit.potential_breakdown.title_root ?? 0}
                </p>
              )}
            </div>
          )}

          {audit && (audit.native_examples ?? []).length > 0 && (
            <div className="rounded-xl border border-purple-200 bg-white p-4">
              <h3 className="mb-2 font-medium text-gray-900">
                Exemples familles natives (produits avec variantes)
              </h3>
              <div className="space-y-1.5 text-xs">
                {(audit.native_examples ?? []).map((n) => (
                  <div key={n.id} className="rounded bg-purple-50 px-2 py-1 text-purple-900">
                    <strong>{n.name}</strong> ({n.sku ?? "—"}) · {n.variants} variante(s)
                  </div>
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
            <h2 className="font-semibold text-gray-900">Suggestions de mères</h2>
            <select
              value={suggestStrategy}
              onChange={(e) => setSuggestStrategy(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none"
            >
              <option value="auto">Stratégie: auto (recommandée)</option>
              <option value="parent_sku">Stratégie: parent_sku (prioritaire)</option>
              <option value="sku_root">Stratégie: sku_root</option>
              <option value="title_root">Stratégie: title_root</option>
            </select>
            <button
              onClick={runSuggest}
              disabled={suggestLoading}
              className="rounded-lg bg-[#cc1818] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#b01414] disabled:opacity-50"
            >
              {suggestLoading ? "Analyse…" : "Analyser"}
            </button>
            <label className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-700">
              <input
                type="checkbox"
                className="mr-1 align-middle"
                checked={createDedicatedMother}
                onChange={(e) => setCreateDedicatedMother(e.target.checked)}
              />
              Créer une mère dédiée
            </label>
            {selectedSuggestions.size > 0 && (
              <button
                onClick={applySelectedSuggestions}
                disabled={bulkApplyLoading}
                className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {bulkApplyLoading
                  ? "Assemblage…"
                  : `Assembler la sélection (${selectedSuggestions.size})`}
              </button>
            )}
          </div>

          <p className="text-sm text-gray-500">
            {suggestions.length > 0
              ? `${suggestions.length} suggestion${suggestions.length > 1 ? "s" : ""} — cliquez "Assembler" pour créer une mère`
              : "Lancez l'analyse pour détecter les structures mère/filles potentielles."}
          </p>
          {focusLatestImport && (
            <p className="text-xs text-indigo-700">
              Analyse limitée au dernier import (produits modifiés récemment).
            </p>
          )}
          {suggestions.length > 0 && (
            <p className="text-xs text-gray-400">
              Astuce: la stratégie <code>auto</code> combine <code>parent_sku</code>, <code>sku_root</code> et{" "}
              <code>title_root</code> puis priorise les groupes les plus fiables.
            </p>
          )}

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
