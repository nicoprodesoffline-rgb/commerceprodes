"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import StatusBadge from "components/admin/status-badge";
import type { DevisRequest } from "lib/supabase/types";

const VALID_STATUSES = [
  { value: "nouveau", label: "Nouvelle" },
  { value: "en_cours", label: "En cours" },
  { value: "traite", label: "Traitée" },
  { value: "archive", label: "Archivée" },
  { value: "refuse", label: "Refusée" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildRelanceMailto(d: DevisRequest): string {
  const subject = encodeURIComponent(`Relance devis — ${d.produit}`);
  const body = encodeURIComponent(
    `Bonjour ${d.nom},\n\nNous revenons vers vous au sujet de votre demande de devis pour : ${d.produit}.\n\nNotre équipe est disponible pour répondre à toutes vos questions.\n\nCordialement,\nL'équipe PRODES\ncontact@prodes.fr — 04 67 24 30 34`,
  );
  return `mailto:${d.email}?subject=${subject}&body=${body}`;
}

interface Props {
  initialData: DevisRequest[];
  adminPassword: string;
}

export default function DevisListClient({ initialData, adminPassword }: Props) {
  const [data, setData] = useState<DevisRequest[]>(initialData);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("traite");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // ── Select all / deselect all ───────────────────────────────
  const allSelected = data.length > 0 && selected.size === data.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.map((d) => d.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Bulk status apply ───────────────────────────────────────
  function applyBulkStatus() {
    if (selected.size === 0) return;
    startTransition(async () => {
      setFeedback(null);
      try {
        const res = await fetch("/api/admin/devis/bulk-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminPassword}`,
          },
          body: JSON.stringify({ ids: Array.from(selected), status: bulkStatus }),
        });
        const json = await res.json();
        if (!res.ok) {
          setFeedback({ type: "error", message: json.error ?? "Erreur" });
          return;
        }
        // Update local state
        setData((prev) =>
          prev.map((d) =>
            selected.has(d.id)
              ? { ...d, status: bulkStatus as DevisRequest["status"] }
              : d,
          ),
        );
        setFeedback({
          type: "success",
          message: `${json.updated ?? selected.size} demande(s) passées en « ${VALID_STATUSES.find((s) => s.value === bulkStatus)?.label ?? bulkStatus} »`,
        });
        setSelected(new Set());
      } catch {
        setFeedback({ type: "error", message: "Erreur de connexion" });
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* ── Barre d'actions bulk ── */}
      {data.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <span className="text-sm text-gray-500">
            {selected.size > 0 ? `${selected.size} sélectionné(s)` : "Sélectionner pour action groupée"}
          </span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {VALID_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            onClick={applyBulkStatus}
            disabled={selected.size === 0 || isPending}
            className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {isPending ? "…" : "Appliquer"}
          </button>
        </div>
      )}

      {/* ── Feedback ── */}
      {feedback && (
        <div
          className={`rounded-md px-4 py-2 text-sm ${
            feedback.type === "success"
              ? "border border-green-200 bg-green-50 text-green-800"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* ── Tableau ── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                  aria-label="Tout sélectionner"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Nom</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 hidden lg:table-cell">Email</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Tél.</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Produit</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Qté</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((d) => (
              <tr
                key={d.id}
                className={`hover:bg-gray-50 transition-colors ${selected.has(d.id) ? "bg-blue-50" : ""}`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggleOne(d.id)}
                    className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                  />
                </td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                  {formatDate(d.created_at)}
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">{d.nom}</td>
                <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{d.email}</td>
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{d.telephone || "—"}</td>
                <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">{d.produit}</td>
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{d.quantite || "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={d.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/devis/${d.id}`}
                      className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                    >
                      Voir →
                    </Link>
                    <a
                      href={buildRelanceMailto(d)}
                      title="Envoyer relance par email"
                      className="text-xs font-medium text-gray-500 hover:text-[#cc1818] transition-colors whitespace-nowrap"
                    >
                      ✉ Relance
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
