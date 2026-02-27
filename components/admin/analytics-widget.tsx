"use client";

import { useEffect, useState } from "react";

interface DayData {
  date: string;
  views: number;
}

interface AnalyticsData {
  totalViews: number;
  cartAdds: number;
  cartRemovals: number;
  topProducts: { handle: string; views: number }[];
  chartData: DayData[];
}

function MiniChart({ data }: { data: DayData[] }) {
  if (!data.length) return <p className="text-xs text-gray-400">Aucune donnée</p>;

  const max = Math.max(...data.map((d) => d.views), 1);
  const height = 60;
  const width = 280;
  const barW = Math.floor(width / data.length) - 2;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height + 20}`} className="w-full" style={{ maxWidth: width }}>
        {data.map((d, i) => {
          const barH = Math.max(2, Math.round((d.views / max) * height));
          const x = i * (barW + 2);
          const y = height - barH;
          const label = d.date.slice(5); // MM-DD
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={2}
                fill={d.views > 0 ? "#cc1818" : "#e5e7eb"}
                opacity={0.85}
              />
              <text
                x={x + barW / 2}
                y={height + 14}
                textAnchor="middle"
                fontSize="7"
                fill="#9ca3af"
              >
                {label}
              </text>
              {d.views > 0 && (
                <text
                  x={x + barW / 2}
                  y={y - 2}
                  textAnchor="middle"
                  fontSize="7"
                  fill="#6b7280"
                >
                  {d.views}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function AnalyticsWidget() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const password = sessionStorage.getItem("admin_password") ?? "";
    fetch("/api/admin/analytics", {
      headers: { Authorization: `Bearer ${password}` },
    })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-gray-200" />
          <div className="h-16 w-full rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">
        📈 Analytics — 7 derniers jours
      </h2>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-gray-50 p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{data.totalViews}</p>
          <p className="text-xs text-gray-500 mt-0.5">Vues produits</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3 text-center">
          <p className="text-xl font-bold text-green-600">{data.cartAdds}</p>
          <p className="text-xs text-gray-500 mt-0.5">Ajouts panier</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3 text-center">
          <p className="text-xl font-bold text-gray-400">{data.cartRemovals}</p>
          <p className="text-xs text-gray-500 mt-0.5">Suppressions</p>
        </div>
      </div>

      {/* Graphique vues/jour */}
      <div>
        <p className="mb-2 text-xs font-medium text-gray-500">Vues / jour</p>
        <MiniChart data={data.chartData} />
      </div>

      {/* Top produits */}
      {data.topProducts.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-gray-500">Top produits vus</p>
          <ul className="space-y-1.5">
            {data.topProducts.map((p, i) => (
              <li key={p.handle} className="flex items-center gap-2">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">
                  {i + 1}
                </span>
                <a
                  href={`/product/${p.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate text-xs text-gray-700 hover:text-[#cc1818] transition-colors"
                >
                  {p.handle}
                </a>
                <span className="flex-none rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-[#cc1818]">
                  {p.views} vues
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.totalViews === 0 && (
        <p className="text-xs text-gray-400 text-center py-2">
          Aucune vue enregistrée — les données apparaîtront après les premières visites.
        </p>
      )}
    </div>
  );
}
