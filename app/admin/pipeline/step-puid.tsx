"use client";

import { useState, useEffect, useRef } from "react";
import { adminFetch } from "lib/admin/fetch";
import type { PuidData } from "lib/admin/pipeline-types";

interface Props {
  name: string;
  puidData: PuidData | null;
  setPuidData: (data: PuidData | null) => void;
  onValidated: () => void;
  forceGenerate?: boolean;
}

export default function StepPuid({
  name,
  puidData,
  setPuidData,
  onValidated,
  forceGenerate = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctionsApplied, setCorrectionsApplied] = useState(0);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    new Set(),
  );
  const didAutoRun = useRef(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(
        `/api/admin/pipeline/extractions/${encodeURIComponent(name)}/puid`,
        { method: "POST", body: JSON.stringify({}) },
      );
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error ?? json.stderr ?? "Erreur PUID generation");
      setPuidData(json.data);
      setCorrectionsApplied(json.corrections_applied ?? 0);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadExisting() {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(
        `/api/admin/pipeline/extractions/${encodeURIComponent(name)}/puid`,
      );
      const json = await res.json();
      if (json.exists && json.data) {
        setPuidData(json.data);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }

  // Auto-run on mount: if forceGenerate, always POST. Otherwise try loading existing first.
  useEffect(() => {
    if (didAutoRun.current) return;
    if (puidData || loading) return;
    didAutoRun.current = true;

    if (forceGenerate) {
      void generate();
    } else {
      void loadExisting().then((found) => {
        if (!found) void generate();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleProduct(ref: string) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      next.has(ref) ? next.delete(ref) : next.add(ref);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-8 text-center text-sm text-gray-500 shadow-sm border border-gray-200">
        Génération des PUIDs en cours (corrections appliquées)…
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
          onClick={() => void generate()}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!puidData) return null;

  const { products, variants, puid_collisions, summary } = puidData;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-6 text-sm">
          <span>
            <strong>{summary.total_products}</strong> produits
          </span>
          <span>
            <strong>{summary.total_variants}</strong> variantes
          </span>
          <span>
            Collisions :{" "}
            <strong
              className={
                summary.puid_collisions > 0 ? "text-red-600" : "text-green-600"
              }
            >
              {summary.puid_collisions}
            </strong>
          </span>
          <span>
            Liens résolus : <strong>{summary.produits_lies_resolved}</strong>
          </span>
          {summary.produits_lies_unresolved > 0 && (
            <span className="text-amber-600">
              Non résolus : <strong>{summary.produits_lies_unresolved}</strong>
            </span>
          )}
          {correctionsApplied > 0 && (
            <span className="text-blue-600">
              {correctionsApplied} correction(s) appliquées
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void generate()}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
          >
            Re-générer
          </button>
          <button
            onClick={onValidated}
            disabled={summary.puid_collisions > 0}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            Valider & préparer import
          </button>
        </div>
      </div>

      {/* Collisions alert */}
      {puid_collisions.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-red-800">
            Collisions PUID ({puid_collisions.length})
          </h3>
          {puid_collisions.map((c, i) => (
            <div key={i} className="mb-2 text-xs text-red-700">
              <span className="font-mono font-bold">{c.puid}</span>
              <span className="ml-2">
                {c.variants
                  .map((v) => v.reference ?? v.designation)
                  .join(" / ")}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Products table */}
      <div className="space-y-1">
        {products.map((product) => {
          const isExpanded = expandedProducts.has(product.ref);
          const productVariants = variants.filter(
            (v) => v.product_ref === product.ref,
          );

          return (
            <div
              key={product.ref}
              className="rounded-lg border border-gray-200 bg-white"
            >
              <div
                className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50"
                onClick={() => toggleProduct(product.ref)}
              >
                <span className="text-gray-400">{isExpanded ? "▼" : "▶"}</span>
                <span className="font-mono text-xs font-bold text-purple-700">
                  {product.puid_root}
                </span>
                <span className="flex-1 text-sm">{product.nom_gamme}</span>
                <span className="text-xs text-gray-500">
                  {productVariants.length} variante
                  {productVariants.length > 1 ? "s" : ""}
                </span>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 pb-3">
                  <table className="mt-2 w-full text-xs">
                    <thead className="border-b bg-gray-50">
                      <tr>
                        <th className="px-2 py-2 text-left font-medium text-gray-500">
                          PUID
                        </th>
                        <th className="px-2 py-2 text-left font-medium text-gray-500">
                          Réf
                        </th>
                        <th className="px-2 py-2 text-left font-medium text-gray-500">
                          Désignation
                        </th>
                        <th className="px-2 py-2 text-right font-medium text-gray-500">
                          Prix HT
                        </th>
                        <th className="px-2 py-2 text-left font-medium text-gray-500">
                          Price tokens
                        </th>
                        <th className="px-2 py-2 text-left font-medium text-gray-500">
                          Style tokens
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {productVariants.map((v, i) => (
                        <tr
                          key={i}
                          className="border-b border-gray-50 hover:bg-gray-50"
                        >
                          <td className="px-2 py-2 font-mono text-purple-600">
                            {v.puid}
                          </td>
                          <td className="px-2 py-2 font-mono text-gray-700">
                            {v.reference ?? "—"}
                          </td>
                          <td className="px-2 py-2">{v.designation}</td>
                          <td className="px-2 py-2 text-right">
                            {v.prix_ht != null
                              ? `${v.prix_ht.toFixed(2)} €`
                              : "—"}
                          </td>
                          <td className="px-2 py-2">
                            {v.price_tokens.length > 0 ? (
                              <span className="rounded bg-purple-50 px-1.5 py-0.5 text-purple-700">
                                {v.price_tokens.join(" ")}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {v.style_tokens.length > 0 ? (
                              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
                                {v.style_tokens.join(" ")}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
