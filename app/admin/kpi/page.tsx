import { supabaseServer } from "lib/supabase/client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "KPI Business — Admin PRODES",
};

type KpiValue = number | null;

function KpiCard({
  label,
  value,
  sub,
  color = "blue",
}: {
  label: string;
  value: KpiValue | string;
  sub?: string;
  color?: "blue" | "green" | "amber" | "gray";
}) {
  const colors = {
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    green: "bg-green-50 border-green-200 text-green-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    gray: "bg-gray-50 border-gray-200 text-gray-600",
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-bold">
        {value === null ? <span className="text-lg font-normal opacity-50">N/A</span> : value}
      </p>
      {sub && <p className="mt-1 text-xs opacity-60">{sub}</p>}
    </div>
  );
}

async function fetchKpi() {
  try {
    const client = supabaseServer();
    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * 86400_000).toISOString();
    const since30d = new Date(now.getTime() - 30 * 86400_000).toISOString();

    const [r7d, r30d, rTotal, rTraites, rComptes, rSaved, rProducts] = await Promise.all([
      client.from("devis_requests").select("id", { count: "exact", head: true }).gte("created_at", since7d),
      client.from("devis_requests").select("id", { count: "exact", head: true }).gte("created_at", since30d),
      client.from("devis_requests").select("id", { count: "exact", head: true }),
      client.from("devis_requests").select("id", { count: "exact", head: true }).eq("status", "traite"),
      (async () => { try { return await client.from("customer_accounts").select("id", { count: "exact", head: true }).gte("created_at", since7d); } catch { return { count: null }; } })(),
      (async () => { try { return await client.from("saved_carts").select("id", { count: "exact", head: true }).gte("created_at", since7d); } catch { return { count: null }; } })(),
      client.from("products").select("id", { count: "exact", head: true }).eq("status", "publish"),
    ]);

    const devis7d = r7d.error?.code === "42P01" ? null : (r7d.count ?? 0);
    const devis30d = r30d.error?.code === "42P01" ? null : (r30d.count ?? 0);
    const devisTotal = rTotal.error?.code === "42P01" ? null : (rTotal.count ?? 0);
    const devisTraites = rTraites.error?.code === "42P01" ? null : (rTraites.count ?? 0);
    const tauxTraitement = devisTotal && devisTotal > 0 && devisTraites !== null
      ? Math.round((devisTraites / devisTotal) * 100) : null;
    const comptes7d = (rComptes as { count: number | null }).count ?? null;
    const saved7d = (rSaved as { count: number | null }).count ?? null;
    const products = rProducts.count ?? null;

    return { devis7d, devis30d, devisTotal, devisTraites, tauxTraitement, comptes7d, saved7d, products };
  } catch {
    return { devis7d: null, devis30d: null, devisTotal: null, devisTraites: null, tauxTraitement: null, comptes7d: null, saved7d: null, products: null };
  }
}

export default async function KpiPage() {
  const d = await fetchKpi();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard KPI</h1>
        <p className="text-sm text-gray-400">Données temps réel</p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Devis & Commandes</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Devis 7 jours" value={d.devis7d} color="blue" />
          <KpiCard label="Devis 30 jours" value={d.devis30d} color="blue" />
          <KpiCard label="Total devis" value={d.devisTotal} sub={`dont ${d.devisTraites ?? "?"} traités`} color="green" />
          <KpiCard
            label="Taux traitement"
            value={d.tauxTraitement !== null ? `${d.tauxTraitement} %` : null}
            color={d.tauxTraitement !== null && d.tauxTraitement >= 50 ? "green" : "amber"}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Comptes & Paniers</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Nvx comptes B2B 7j" value={d.comptes7d} color="green" />
          <KpiCard label="Paniers sauvegardés 7j" value={d.saved7d} color="blue" />
          <KpiCard label="Produits publiés" value={d.products} color="gray" />
        </div>
      </section>

      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
        <p className="font-medium text-gray-700 mb-1">Étendre les KPI</p>
        <p>Pour des données avancées (CA, taux conversion, top produits), connectez un outil analytics ou enrichissez
        la table <code className="bg-gray-100 px-1 rounded">analytics_events</code> via le hook tracker existant.</p>
      </div>
    </div>
  );
}
