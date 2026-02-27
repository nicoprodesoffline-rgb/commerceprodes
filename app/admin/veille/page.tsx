"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

interface CompetitorRow {
  id: string;
  our_sku: string;
  our_price: number;
  competitor_name: string;
  competitor_price: number;
  competitor_url: string | null;
  price_diff: number;
  price_diff_pct: number;
  scraped_at: string;
}

// Group rows by SKU
interface SeoRow {
  sku: string;
  our_price: number;
  competitors: { name: string; price: number; url: string | null; diff_pct: number; scraped_at: string }[];
  maxDiffPct: number;
}

export default function VeillePage() {
  const [rows, setRows] = useState<SeoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [triggeringWebhook, setTriggeringWebhook] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState<number>(10);
  const password = typeof window !== "undefined" ? sessionStorage.getItem("admin_password") ?? "" : "";

  const fetchData = () => {
    setLoading(true);
    fetch("/api/admin/competitive", {
      headers: { Authorization: `Bearer ${password}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const rawRows: CompetitorRow[] = data.data ?? [];
        // Group by SKU
        const skuMap: Record<string, SeoRow> = {};
        for (const row of rawRows) {
          if (!skuMap[row.our_sku]) {
            skuMap[row.our_sku] = {
              sku: row.our_sku,
              our_price: row.our_price,
              competitors: [],
              maxDiffPct: 0,
            };
          }
          const entry = skuMap[row.our_sku]!;
          entry.competitors.push({
            name: row.competitor_name,
            price: row.competitor_price,
            url: row.competitor_url,
            diff_pct: row.price_diff_pct,
            scraped_at: row.scraped_at,
          });
          entry.maxDiffPct = Math.max(entry.maxDiffPct, row.price_diff_pct);
        }
        const sorted = Object.values(skuMap).sort((a, b) => b.maxDiffPct - a.maxDiffPct);
        setRows(sorted);
        if (rawRows.length > 0) {
          setLastUpdate(rawRows[0]?.scraped_at ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const triggerAnalysis = async () => {
    setTriggeringWebhook(true);
    try {
      const res = await fetch("/api/admin/trigger-webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify({ webhook: "competitive_watch" }),
      });
      const data = await res.json();
      toast[data.success ? "success" : "warning"](data.message);
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setTriggeringWebhook(false);
    }
  };

  const cheaper = rows.filter((r) => r.maxDiffPct < -10).length;
  const moreExpensive = rows.filter((r) => r.maxDiffPct > 10).length;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Veille concurrentielle</h1>
        <button
          onClick={triggerAnalysis}
          disabled={triggeringWebhook}
          className="flex items-center gap-2 rounded-md bg-[#cc1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors disabled:opacity-60"
        >
          {triggeringWebhook ? "…" : "🔄 Lancer une analyse"}
        </button>
      </div>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
          <p className="mt-0.5 text-xs text-gray-500">SKU surveillés</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-2xl font-bold text-red-600">{moreExpensive}</p>
          <p className="mt-0.5 text-xs text-gray-500">On est + cher (&gt;10%)</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-2xl font-bold text-green-600">{cheaper}</p>
          <p className="mt-0.5 text-xs text-gray-500">On est - cher (&gt;10%)</p>
        </div>
      </div>

      {lastUpdate && (
        <p className="mb-4 text-xs text-gray-400">
          Dernière mise à jour : {new Date(lastUpdate).toLocaleString("fr-FR")}
        </p>
      )}

      {/* Seuil alerte */}
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <span className="text-sm text-gray-700">M&apos;alerter si on est &gt;</span>
        <input
          type="number"
          min={1}
          max={100}
          value={alertThreshold}
          onChange={(e) => setAlertThreshold(Number(e.target.value))}
          className="w-16 rounded border border-gray-300 px-2 py-1 text-sm focus:border-[#cc1818] focus:outline-none"
        />
        <span className="text-sm text-gray-700">% plus cher</span>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <p className="text-lg font-semibold text-gray-700">Aucune donnée de veille</p>
          <p className="mt-2 text-sm text-gray-500">
            Configurez <code className="text-xs bg-gray-100 px-1 rounded">N8N_WEBHOOK_COMPETITIVE</code> et lancez une analyse.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-right">Notre prix</th>
                <th className="px-4 py-3 text-right">Prozon</th>
                <th className="px-4 py-3 text-right">France-Coll.</th>
                <th className="px-4 py-3 text-right">Écart max</th>
                <th className="px-4 py-3 text-center">Alerte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row) => {
                const prozon = row.competitors.find((c) => c.name === "prozon");
                const fc = row.competitors.find((c) => c.name === "france-collectivites");
                const isAlert = row.maxDiffPct > alertThreshold;
                const isCompetitive = row.maxDiffPct < -alertThreshold;
                return (
                  <tr
                    key={row.sku}
                    className={`hover:bg-gray-50 transition-colors ${
                      isAlert ? "bg-red-50/50" : isCompetitive ? "bg-green-50/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800">
                      {row.sku}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {row.our_price.toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {prozon ? (
                        prozon.url ? (
                          <a href={prozon.url} target="_blank" rel="noopener noreferrer" className="hover:text-[#cc1818] underline">
                            {prozon.price.toFixed(2)} €
                          </a>
                        ) : `${prozon.price.toFixed(2)} €`
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {fc ? (
                        fc.url ? (
                          <a href={fc.url} target="_blank" rel="noopener noreferrer" className="hover:text-[#cc1818] underline">
                            {fc.price.toFixed(2)} €
                          </a>
                        ) : `${fc.price.toFixed(2)} €`
                      ) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${
                      row.maxDiffPct > 10 ? "text-red-600" : row.maxDiffPct < -10 ? "text-green-600" : "text-gray-600"
                    }`}>
                      {row.maxDiffPct > 0 ? "+" : ""}{row.maxDiffPct.toFixed(1)} %
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isAlert ? "🔴" : isCompetitive ? "🟢" : "🟡"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
