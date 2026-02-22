"use client";

import { useState } from "react";
import StatusBadge from "components/admin/status-badge";
import type { DevisRequest } from "lib/supabase/types";

const STATUSES: { value: DevisRequest["status"]; label: string }[] = [
  { value: "nouveau", label: "Nouveau" },
  { value: "en_cours", label: "En cours" },
  { value: "traite", label: "Traité" },
  { value: "archive", label: "Archivé" },
  { value: "refuse", label: "Refusé" },
];

export default function DevisDetailActions({ devis }: { devis: DevisRequest }) {
  const [status, setStatus] = useState<DevisRequest["status"]>(devis.status);
  const [notes, setNotes] = useState(devis.notes_internes || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/devis/${devis.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes_internes: notes }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
      <h2 className="font-semibold text-gray-900 border-b pb-2">
        Gestion interne
      </h2>

      {/* Changer le statut */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Statut
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as DevisRequest["status"])}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="mt-1">
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Notes internes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Notes internes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="Notes visibles uniquement par l'équipe PRODES…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
      >
        {saving ? "Enregistrement…" : saved ? "✓ Enregistré" : "Enregistrer"}
      </button>

      {/* Email rapide */}
      <a
        href={`mailto:${devis.email}?subject=Votre demande de devis – ${devis.produit}`}
        className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        ✉️ Envoyer un email
      </a>
    </div>
  );
}
