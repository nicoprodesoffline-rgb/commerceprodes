import Link from "next/link";
import KpiCard from "components/admin/kpi-card";
import StatusBadge from "components/admin/status-badge";
import { getAdminStats, getDevisRequests } from "lib/supabase/index";
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

export default async function AdminDashboard() {
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Stats
  const stats = await getAdminStats();

  // Recent devis (will fail gracefully if table missing)
  let recentDevis: DevisRequest[] = [];
  let devisTableMissing = false;
  try {
    const result = await getDevisRequests({ limit: 10 });
    recentDevis = result.data;
  } catch {
    devisTableMissing = true;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Tableau de bord
        </h1>
        <p className="mt-1 text-sm text-gray-500 capitalize">{today}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Produits actifs"
          value={stats.totalProducts}
          icon="📦"
          color="blue"
        />
        <KpiCard
          title="Catégories"
          value={stats.totalCategories}
          icon="🗂️"
          color="purple"
        />
        <KpiCard
          title="Variantes"
          value={stats.totalVariants}
          icon="🧩"
          color="green"
        />
        <KpiCard
          title="Nouvelles demandes"
          value={stats.devisNew}
          icon="📋"
          color={stats.devisNew > 0 ? "orange" : "gray"}
          subtitle={`${stats.devisThisMonth} ce mois`}
        />
      </div>

      {/* Devis récents */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Demandes de devis récentes
          </h2>
          <Link
            href="/admin/devis"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Voir toutes →
          </Link>
        </div>

        {devisTableMissing ? (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
            <p className="font-medium text-orange-800">
              ⚠️ La table devis_requests n&apos;existe pas encore.
            </p>
            <p className="mt-1 text-sm text-orange-700">
              Exécutez le fichier{" "}
              <code className="font-mono bg-orange-100 px-1 rounded">
                docs/sql-backoffice.sql
              </code>{" "}
              dans le dashboard Supabase.
            </p>
            <a
              href="https://supabase.com/dashboard/project/mvnaeddtvyaqkdliivdk/sql"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline"
            >
              Ouvrir le SQL Editor →
            </a>
          </div>
        ) : recentDevis.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
            <p>Aucune demande pour l&apos;instant.</p>
            <p className="mt-1 text-sm">
              Les demandes apparaîtront ici une fois le formulaire de devis utilisé.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Nom</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Produit</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentDevis.map((d) => (
                  <tr
                    key={d.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { href: "/admin/products", label: "Gérer les produits", icon: "📦" },
            { href: "/admin/categories", label: "Gérer les catégories", icon: "🗂️" },
            { href: "/admin/devis", label: "Toutes les demandes", icon: "📋" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-sm transition-all"
            >
              <span className="text-2xl">{item.icon}</span>
              <span className="font-medium text-gray-800">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
