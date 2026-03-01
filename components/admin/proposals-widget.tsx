"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "lib/admin/fetch";

type ProposalStatus = "proposed" | "approved" | "standby" | "rejected";
type Priority = "high" | "medium" | "low";

interface Proposal {
  id: string;
  title: string;
  description: string;
  source: string;
  status: ProposalStatus;
  priority: Priority;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS: Record<ProposalStatus, string> = {
  proposed: "Proposé",
  approved: "Approuvé",
  standby: "En attente",
  rejected: "Refusé",
};

const STATUS_COLORS: Record<ProposalStatus, string> = {
  proposed: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  standby: "bg-amber-100 text-amber-700",
  rejected: "bg-gray-100 text-gray-400 line-through",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  high: "text-red-600",
  medium: "text-amber-600",
  low: "text-gray-400",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  high: "haute",
  medium: "moyenne",
  low: "basse",
};

export function ProposalsWidget() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestCount, setSuggestCount] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | ProposalStatus>("proposed");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/proposals");
      const data = await res.json();
      setProposals(data.items ?? []);
    } catch {
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (id: string, status: ProposalStatus) => {
    setUpdating(id);
    try {
      const res = await adminFetch("/api/admin/proposals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        setProposals((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status, updated_at: new Date().toISOString() } : p))
        );
      }
    } finally {
      setUpdating(null);
    }
  };

  const runSuggest = async () => {
    setSuggestLoading(true);
    setSuggestCount(null);
    try {
      const res = await adminFetch("/api/admin/proposals/suggest");
      const data = await res.json();
      const suggestions: Proposal[] = data.suggestions ?? [];
      if (suggestions.length > 0) {
        await adminFetch("/api/admin/proposals/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suggestions }),
        });
        setSuggestCount(suggestions.length);
        await load();
      } else {
        setSuggestCount(0);
      }
    } finally {
      setSuggestLoading(false);
    }
  };

  const filtered = filter === "all" ? proposals : proposals.filter((p) => p.status === filter);
  const pendingCount = proposals.filter((p) => p.status === "proposed").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Propositions autonomes</h2>
          {pendingCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
              {pendingCount} en attente
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | ProposalStatus)}
            className="rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none"
          >
            <option value="all">Tous</option>
            {(Object.keys(STATUS_LABELS) as ProposalStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <button
            onClick={runSuggest}
            disabled={suggestLoading}
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            {suggestLoading ? "Analyse…" : "✦ Générer suggestions"}
          </button>
          {suggestCount !== null && (
            <span className="text-xs text-gray-500">
              {suggestCount === 0 ? "Aucune nouvelle suggestion" : `${suggestCount} suggestion(s) ajoutée(s)`}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400 text-sm">
          Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500 text-sm">
          Aucune proposition{filter !== "all" ? ` avec ce statut` : ""}.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <div
              key={p.id}
              className={`rounded-xl border bg-white p-4 transition-opacity ${p.status === "rejected" ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                    <span className={`text-[10px] font-medium ${PRIORITY_COLORS[p.priority]}`}>
                      priorité {PRIORITY_LABELS[p.priority]}
                    </span>
                    <span className="text-[10px] text-gray-300">
                      {p.source}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{p.title}</p>
                  <p className="mt-1 text-xs text-gray-500 leading-relaxed">{p.description}</p>
                </div>

                {/* Action buttons */}
                {p.status !== "rejected" && (
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {p.status !== "approved" && (
                      <button
                        onClick={() => updateStatus(p.id, "approved")}
                        disabled={updating === p.id}
                        className="rounded-md bg-green-50 border border-green-200 px-2.5 py-1 text-[10px] font-semibold text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        ✓ Approuver
                      </button>
                    )}
                    {p.status !== "standby" && (
                      <button
                        onClick={() => updateStatus(p.id, "standby")}
                        disabled={updating === p.id}
                        className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        ⏸ Standby
                      </button>
                    )}
                    <button
                      onClick={() => updateStatus(p.id, "rejected")}
                      disabled={updating === p.id}
                      className="rounded-md border border-gray-200 px-2.5 py-1 text-[10px] text-gray-400 hover:bg-gray-50 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      ✕ Refuser
                    </button>
                  </div>
                )}

                {p.status === "rejected" && (
                  <button
                    onClick={() => updateStatus(p.id, "proposed")}
                    disabled={updating === p.id}
                    className="shrink-0 rounded-md border border-gray-200 px-2.5 py-1 text-[10px] text-gray-400 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    ↩ Remettre
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
