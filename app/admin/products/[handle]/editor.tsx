"use client";

import { useState } from "react";

export default function ProductDescriptionEditor({
  handle,
  description,
  shortDescription,
}: {
  handle: string;
  description: string;
  shortDescription: string;
}) {
  const [desc, setDesc] = useState(description);
  const [shortDesc, setShortDesc] = useState(shortDescription);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/products/${handle}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: desc,
          short_description: shortDesc,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const data = await res.json();
        setError(data.error || "Erreur lors de la sauvegarde");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <h2 className="font-semibold text-gray-900">Éditer la description</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description courte
        </label>
        <textarea
          value={shortDesc}
          onChange={(e) => setShortDesc(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
          placeholder="Description courte affichée sur la fiche produit…"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description complète (HTML)
        </label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={8}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none resize-y"
          placeholder="Description HTML complète…"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
      >
        {saving ? "Enregistrement…" : saved ? "✓ Enregistré" : "Enregistrer"}
      </button>
    </div>
  );
}
