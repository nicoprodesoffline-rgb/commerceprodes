import Link from "next/link";
import StatusBadge from "components/admin/status-badge";
import type { DevisRequest } from "lib/supabase/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface StatBlock {
  title: string;
  value: number | string;
  icon: string;
  href: string;
  highlight?: boolean;
  color?: "amber" | "red" | "green" | "orange";
}

async function fetchDashboardStats() {
  const { supabaseServer } = await import("lib/supabase/client");
  const client = supabaseServer();

  const results = await Promise.allSettled([
    // 0 — produits actifs
    client.from("products").select("id", { count: "exact", head: true }).eq("status", "publish"),
    // 1 — devis en attente
    client.from("devis_requests").select("id", { count: "exact", head: true }).eq("status", "nouveau"),
    // 2 — paniers abandonnés 7j
    client
      .from("abandoned_carts")
      .select("id", { count: "exact", head: true })
      .gt("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .is("recovered_at", null),
    // 3 — nouvelles demandes 24h
    client
      .from("devis_requests")
      .select("id", { count: "exact", head: true })
      .gt("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    // 4 — catégories
    client.from("categories").select("id", { count: "exact", head: true }),
    // 5 — produits sans image
    client
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("status", "publish")
      .or("featured_image_url.is.null,featured_image_url.eq."),
    // 6 — derniers devis
    client
      .from("devis_requests")
      .select("id, nom, email, produit, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  function getCount(r: (typeof results)[number]): number {
    if (r.status === "fulfilled") return (r.value as any).count ?? 0;
    return 0;
  }

  function getData(r: (typeof results)[number]): any[] {
    if (r.status === "fulfilled") return (r.value as any).data ?? [];
    return [];
  }

  return {
    totalProducts: getCount(results[0]!),
    devisPending: getCount(results[1]!),
    abandonedCarts: getCount(results[2]!),
    newRequests24h: getCount(results[3]!),
    totalCategories: getCount(results[4]!),
    missingImages: getCount(results[5]!),
    recentDevis: getData(results[6]!) as DevisRequest[],
  };
}

export default async function AdminDashboard() {
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const stats = await fetchDashboardStats();

  const statBlocks: StatBlock[] = [
    {
      title: "Produits actifs",
      value: stats.totalProducts.toLocaleString("fr-FR"),
      icon: "📦",
      href: "/admin/produits",
    },
    {
      title: "Devis en attente",
      value: stats.devisPending,
      icon: "📋",
      href: "/admin/devis",
      highlight: stats.devisPending > 0,
      color: "amber",
    },
    {
      title: "Paniers abandonnés (7j)",
      value: stats.abandonedCarts,
      icon: "🛒",
      href: "/admin/paniers-abandonnes",
      highlight: stats.abandonedCarts > 0,
      color: "red",
    },
    {
      title: "Nouvelles demandes (24h)",
      value: stats.newRequests24h,
      icon: "⚡",
      href: "/admin/devis",
      highlight: stats.newRequests24h > 0,
      color: "green",
    },
    {
      title: "Catégories",
      value: stats.totalCategories,
      icon: "🗂️",
      href: "/admin/categories",
    },
    {
      title: "Produits sans image",
      value: stats.missingImages,
      icon: "⚠️",
      href: "/admin/produits",
      highlight: stats.missingImages > 0,
      color: "orange",
    },
  ];

  const colorClasses: Record<string, string> = {
    amber: "border-amber-200 bg-amber-50",
    red: "border-red-200 bg-red-50",
    green: "border-green-200 bg-green-50",
    orange: "border-orange-200 bg-orange-50",
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="mt-1 text-sm text-gray-500 capitalize">{today}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {statBlocks.map((s) => {
          const cls =
            s.highlight && s.color ? colorClasses[s.color] : "border-gray-200 bg-white";
          return (
            <Link
              key={s.title}
              href={s.href}
              className={`rounded-xl border ${cls} p-4 hover:shadow-sm transition-shadow`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500">{s.title}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{s.value}</p>
                </div>
                <span className="text-2xl">{s.icon}</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Derniers devis */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Dernières demandes de devis</h2>
          <Link href="/admin/devis" className="text-sm text-[#cc1818] hover:underline">
            Voir toutes →
          </Link>
        </div>

        {stats.recentDevis.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
            <p>Aucune demande pour l&apos;instant.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Nom</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Produit</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.recentDevis.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {formatDate(d.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{d.nom}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{d.email}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{d.produit}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={d.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Accès rapides</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {[
            { href: "/admin/produits", label: "Gérer les produits", icon: "📦" },
            { href: "/admin/categories", label: "Gérer les catégories", icon: "🗂️" },
            { href: "/admin/devis", label: "Toutes les demandes", icon: "📋" },
            { href: "/admin/ia", label: "Outils IA", icon: "🤖" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-[#cc1818] hover:shadow-sm transition-all"
            >
              <span className="text-2xl">{item.icon}</span>
              <span className="font-medium text-gray-800 text-sm">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
