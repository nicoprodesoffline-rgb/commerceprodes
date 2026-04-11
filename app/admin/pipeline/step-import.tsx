"use client";

import { useState } from "react";
import { adminFetch } from "lib/admin/fetch";

interface Props {
  name: string;
}

interface ImportResult {
  success: boolean;
  dry_run: boolean;
  stdout: string;
  stderr?: string;
  error?: string;
}

export default function StepImport({ name }: Props) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runImport(dryRun: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(
        `/api/admin/pipeline/extractions/${encodeURIComponent(name)}/import`,
        { method: "POST", body: JSON.stringify({ dry_run: dryRun }) },
      );
      const data = await res.json();
      if (!data.success && data.error) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  // Auto-run dry-run on mount
  if (!result && !loading && !error) {
    void runImport(true);
  }

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-8 text-center text-sm text-gray-500 shadow-sm border border-gray-200">
        {result?.dry_run === false
          ? "Import en cours…"
          : "Calcul du plan d'import (dry-run)…"}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
        <button
          onClick={() => void runImport(true)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          Relancer dry-run
        </button>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-4">
          {result.dry_run ? (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
              DRY-RUN
            </span>
          ) : (
            <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
              IMPORTÉ
            </span>
          )}
          <span className="text-sm text-gray-600">
            {result.success
              ? "Terminé avec succès"
              : "Terminé avec des erreurs"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void runImport(true)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
          >
            Relancer dry-run
          </button>
          {result.dry_run && result.success && (
            <button
              onClick={() => {
                if (
                  confirm(
                    "Lancer l'import réel dans Supabase ? Cette action est irréversible.",
                  )
                ) {
                  void runImport(false);
                }
              }}
              className="rounded-lg bg-[#cc1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#aa1414]"
            >
              Importer dans Supabase
            </button>
          )}
        </div>
      </div>

      {/* Output */}
      <div className="rounded-lg border border-gray-200 bg-gray-900 p-4">
        <pre className="max-h-[500px] overflow-auto text-xs text-green-300 font-mono whitespace-pre-wrap">
          {result.stdout}
        </pre>
        {result.stderr && (
          <pre className="mt-2 text-xs text-red-400 font-mono whitespace-pre-wrap">
            {result.stderr}
          </pre>
        )}
      </div>
    </div>
  );
}
