"use client";

import { useEffect, useState, useCallback } from "react";
import { adminFetch } from "lib/admin/fetch";
import type { ExtractionListItem } from "lib/admin/pipeline-types";
import StepReview from "./step-review";

export default function PipelinePage() {
  // ── Landing state ──
  const [extractions, setExtractions] = useState<ExtractionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ExtractionListItem | null>(null);

  // ── Load extraction list ──
  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/pipeline/extractions");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setExtractions(data.extractions ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // ── Select an extraction ──
  function selectExtraction(item: ExtractionListItem) {
    setSelected(item);
    setError(null);
  }

  function goBack() {
    setSelected(null);
  }

  // ── Landing: extraction list ──
  if (!selected) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            Pipeline ingestion
          </h1>
          <button
            onClick={() => void loadList()}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            Actualiser
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Cette version du pipeline commerce est branchée sur le repo{" "}
          <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">
            retab-extraction
          </code>{" "}
          et s'arrête à la revue post-engine. Les étapes PUID, preview produit
          et import Supabase restent hors périmètre migré.
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Chargement…</p>
        ) : extractions.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aucune extraction validée trouvée.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Fournisseur
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Date
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  Familles
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  Variantes
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">
                  Étape
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {extractions.map((ex) => (
                <tr
                  key={ex.name}
                  className="border-b hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{ex.fournisseur}</td>
                  <td className="px-4 py-3 text-gray-600">{ex.date}</td>
                  <td className="px-4 py-3 text-right">{ex.familles_count}</td>
                  <td className="px-4 py-3 text-right">{ex.variantes_count}</td>
                  <td className="px-4 py-3 text-center">
                    <StageBadge stage={ex.stage} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => selectExtraction(ex)}
                      disabled={ex.stage === "extraction"}
                      className="rounded-lg bg-[#cc1818] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#aa1414] disabled:opacity-40 disabled:cursor-not-allowed"
                      title={
                        ex.stage === "extraction"
                          ? "Lancez d'abord expand.py"
                          : undefined
                      }
                    >
                      {ex.stage === "extraction"
                        ? "Pas encore expanded"
                        : "Ouvrir"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ── Stepper view ──
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={goBack}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          Retour
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {selected.fournisseur}
        </h1>
        <span className="text-sm text-gray-500">{selected.name}</span>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        La séparation du repo Retab est active ici. Cette page couvre uniquement
        la revue post-engine et l'enregistrement des corrections associées.
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <StepReview
        name={selected.name}
        onValidated={() => {
          void loadList();
          goBack();
        }}
      />
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const styles: Record<string, string> = {
    extraction: "bg-gray-100 text-gray-700",
    expanded: "bg-blue-100 text-blue-700",
    puid: "bg-purple-100 text-purple-700",
    imported: "bg-green-100 text-green-700",
  };
  const labels: Record<string, string> = {
    extraction: "Extraction",
    expanded: "Expanded",
    puid: "PUID",
    imported: "Importé",
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[stage] ?? styles.extraction}`}
    >
      {labels[stage] ?? stage}
    </span>
  );
}
