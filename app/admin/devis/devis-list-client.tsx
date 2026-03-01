"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import StatusBadge from "components/admin/status-badge";
import type { DevisRequest } from "lib/supabase/types";

const VALID_STATUSES = [
  { value: "nouveau", label: "Nouvelle" },
  { value: "en_cours", label: "En cours" },
  { value: "traite", label: "Traitee" },
  { value: "archive", label: "Archivee" },
  { value: "refuse", label: "Refusee" },
] as const;

const RELANCE_TEMPLATES = [
  {
    id: "standard",
    label: "Relance standard",
    buildSubject: (produit?: string) => `Relance devis${produit ? ` - ${produit}` : ""}`,
    buildBody: (nom?: string, produit?: string) =>
      `Bonjour ${nom || ""},\n\nNous revenons vers vous au sujet de votre demande de devis${produit ? ` pour : ${produit}` : ""}.\n\nNotre equipe est disponible pour repondre a vos questions et finaliser votre besoin.\n\nCordialement,\nL'equipe PRODES\ncontact@prodes.fr - 04 67 24 30 34`,
  },
  {
    id: "need_info",
    label: "Demande precision",
    buildSubject: (produit?: string) => `Devis - precision requise${produit ? ` - ${produit}` : ""}`,
    buildBody: (nom?: string, produit?: string) =>
      `Bonjour ${nom || ""},\n\nPour finaliser votre devis${produit ? ` concernant ${produit}` : ""}, nous avons besoin de quelques precisions (quantite, delai, adresse de livraison, contraintes techniques).\n\nVous pouvez nous repondre directement a ce message.\n\nCordialement,\nL'equipe PRODES`,
  },
  {
    id: "last_call",
    label: "Dernier rappel",
    buildSubject: (produit?: string) => `Dernier rappel devis${produit ? ` - ${produit}` : ""}`,
    buildBody: (nom?: string, produit?: string) =>
      `Bonjour ${nom || ""},\n\nSans retour de votre part, nous cloturerons prochainement votre demande de devis${produit ? ` (${produit})` : ""}.\n\nSi votre besoin est toujours d'actualite, repondez simplement a cet email et nous reprenons le dossier immediatement.\n\nCordialement,\nL'equipe PRODES`,
  },
] as const;

type RelanceTemplateId = (typeof RELANCE_TEMPLATES)[number]["id"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRelanceTemplate(templateId: RelanceTemplateId) {
  return RELANCE_TEMPLATES.find((t) => t.id === templateId) ?? RELANCE_TEMPLATES[0];
}

function buildRelanceMailto(d: DevisRequest, templateId: RelanceTemplateId): string {
  const template = getRelanceTemplate(templateId);
  const subject = encodeURIComponent(template.buildSubject(d.produit));
  const body = encodeURIComponent(template.buildBody(d.nom, d.produit));
  return `mailto:${d.email}?subject=${subject}&body=${body}`;
}

function exportDevisCsv(rows: DevisRequest[]) {
  const cols = ["id", "date", "nom", "email", "telephone", "produit", "quantite", "status"];
  const lines = [cols.join(";")];

  for (const r of rows) {
    lines.push([
      r.id,
      r.created_at,
      `"${String(r.nom || "").replace(/"/g, '""')}"`,
      `"${String(r.email || "").replace(/"/g, '""')}"`,
      `"${String(r.telephone || "").replace(/"/g, '""')}"`,
      `"${String(r.produit || "").replace(/"/g, '""')}"`,
      String(r.quantite ?? ""),
      String(r.status || ""),
    ].join(";"));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `devis-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportDevisXls(rows: DevisRequest[]) {
  const cols = ["id", "date", "nom", "email", "telephone", "produit", "quantite", "status"];
  const lines = [cols.join("\t")];

  for (const r of rows) {
    lines.push([
      String(r.id ?? ""),
      String(r.created_at ?? ""),
      String(r.nom ?? "").replace(/\r?\n/g, " "),
      String(r.email ?? "").replace(/\r?\n/g, " "),
      String(r.telephone ?? "").replace(/\r?\n/g, " "),
      String(r.produit ?? "").replace(/\r?\n/g, " "),
      String(r.quantite ?? ""),
      String(r.status ?? ""),
    ].join("\t"));
  }

  const blob = new Blob([`\uFEFF${lines.join("\n")}`], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `devis-${new Date().toISOString().slice(0, 10)}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  initialData: DevisRequest[];
}

export default function DevisListClient({ initialData }: Props) {
  const [data, setData] = useState<DevisRequest[]>(initialData);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<(typeof VALID_STATUSES)[number]["value"]>("traite");
  const [relanceTemplate, setRelanceTemplate] = useState<RelanceTemplateId>("standard");
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const visibleData = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((d) => {
      const haystack = `${d.nom || ""} ${d.email || ""} ${d.produit || ""} ${d.telephone || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [data, query]);

  const allVisibleSelected =
    visibleData.length > 0 && visibleData.every((d) => selected.has(d.id));
  const someVisibleSelected =
    visibleData.some((d) => selected.has(d.id)) && !allVisibleSelected;

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const d of visibleData) next.delete(d.id);
      } else {
        for (const d of visibleData) next.add(d.id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function launchBulkRelance() {
    if (selected.size === 0) {
      setFeedback({ type: "error", message: "Selection vide pour relance." });
      return;
    }

    const recipients = Array.from(
      new Set(
        data
          .filter((d) => selected.has(d.id))
          .map((d) => (d.email || "").trim())
          .filter(Boolean),
      ),
    );

    if (recipients.length === 0) {
      setFeedback({ type: "error", message: "Aucun email valide dans la selection." });
      return;
    }

    const capped = recipients.slice(0, 30);
    const template = getRelanceTemplate(relanceTemplate);
    const subject = encodeURIComponent(template.buildSubject(undefined));
    const body = encodeURIComponent(template.buildBody(undefined, undefined));
    window.location.href = `mailto:?bcc=${encodeURIComponent(capped.join(","))}&subject=${subject}&body=${body}`;

    if (recipients.length > capped.length) {
      setFeedback({
        type: "success",
        message: `Relance ouverte pour ${capped.length} destinataires (sur ${recipients.length}, limite URL).`,
      });
      return;
    }

    setFeedback({
      type: "success",
      message: `Relance ouverte pour ${recipients.length} destinataire(s).`,
    });
  }

  function applyBulkStatus() {
    if (selected.size === 0) return;

    startTransition(async () => {
      setFeedback(null);
      try {
        const res = await fetch("/api/admin/devis/bulk-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: Array.from(selected), status: bulkStatus }),
        });

        const json = await res.json();
        if (!res.ok) {
          setFeedback({ type: "error", message: json.error ?? "Erreur" });
          return;
        }

        setData((prev) =>
          prev.map((d) =>
            selected.has(d.id)
              ? { ...d, status: bulkStatus as DevisRequest["status"] }
              : d,
          ),
        );

        setFeedback({
          type: "success",
          message: `${json.updated ?? selected.size} demande(s) mises a jour`,
        });
        setSelected(new Set());
      } catch {
        setFeedback({ type: "error", message: "Erreur de connexion" });
      }
    });
  }

  return (
    <div className="space-y-4">
      {data.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrer nom, email, produit, telephone..."
              className="min-w-64 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => exportDevisCsv(visibleData)}
              disabled={visibleData.length === 0}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Export CSV (filtres)
            </button>
            <button
              onClick={() => exportDevisXls(visibleData)}
              disabled={visibleData.length === 0}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Export Excel (filtres)
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500">
              {selected.size > 0
                ? `${selected.size} selectionne(s)`
                : `${visibleData.length} visible(s) / ${data.length} total`}
            </span>
            <button
              onClick={toggleAllVisible}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              {allVisibleSelected ? "Desel. filtres" : "Sel. filtres"}
            </button>
            <button
              onClick={clearSelection}
              disabled={selected.size === 0}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Vider selection
            </button>
            <select
              value={bulkStatus}
              onChange={(e) =>
                setBulkStatus(e.target.value as (typeof VALID_STATUSES)[number]["value"])
              }
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
              {isPending ? "..." : "Appliquer"}
            </button>
            <select
              value={relanceTemplate}
              onChange={(e) => setRelanceTemplate(e.target.value as RelanceTemplateId)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {RELANCE_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              onClick={launchBulkRelance}
              disabled={selected.size === 0}
              className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40 transition-colors"
            >
              Relance selection
            </button>
          </div>
        </div>
      )}

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

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected;
                  }}
                  onChange={toggleAllVisible}
                  className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                  aria-label="Tout selectionner"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Nom</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 hidden lg:table-cell">Email</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Tel.</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Produit</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Qte</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleData.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-gray-400">
                  Aucun devis ne correspond au filtre.
                </td>
              </tr>
            ) : (
              visibleData.map((d) => (
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
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{d.telephone || "-"}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">{d.produit}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{d.quantite || "-"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/devis/${d.id}`}
                        className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                      >
                        Voir {">"}
                      </Link>
                      <a
                        href={buildRelanceMailto(d, relanceTemplate)}
                        title="Envoyer relance par email"
                        className="text-xs font-medium text-gray-500 hover:text-[#cc1818] transition-colors whitespace-nowrap"
                      >
                        Relance
                      </a>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
