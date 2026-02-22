import Link from "next/link";
import StatusBadge from "components/admin/status-badge";
import { getDevisRequests } from "lib/supabase/index";
import type { DevisRequest } from "lib/supabase/types";

const STATUSES = [
  { value: "all", label: "Tous" },
  { value: "nouveau", label: "Nouvelles" },
  { value: "en_cours", label: "En cours" },
  { value: "traite", label: "Traitées" },
  { value: "archive", label: "Archivées" },
  { value: "refuse", label: "Refusées" },
];

const PER_PAGE = 20;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DevisListPage(props: {
  searchParams?: Promise<{ status?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const currentStatus = searchParams?.status || "all";
  const currentPage = Math.max(1, parseInt(searchParams?.page || "1"));
  const offset = (currentPage - 1) * PER_PAGE;

  let data: DevisRequest[] = [];
  let total = 0;
  let tableError = false;

  try {
    const result = await getDevisRequests({
      status: currentStatus === "all" ? undefined : currentStatus,
      limit: PER_PAGE,
      offset,
    });
    data = result.data;
    total = result.count;
  } catch {
    tableError = true;
  }

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Demandes de devis</h1>

      {/* Filtres statut */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s.value}
            href={`/admin/devis?status=${s.value}`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              currentStatus === s.value
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {tableError ? (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
          <p className="font-medium text-orange-800">
            ⚠️ La table devis_requests n&apos;existe pas encore.
          </p>
          <p className="mt-1 text-sm text-orange-700">
            Exécutez <code className="font-mono bg-orange-100 px-1 rounded">docs/sql-backoffice.sql</code> dans Supabase.
          </p>
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          Aucune demande dans cette catégorie.
          <div className="mt-2">
            <Link href="/product/panneau-electoral-1-candidat" target="_blank"
              className="text-sm text-blue-600 hover:underline">
              Tester le formulaire de devis →
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Nom</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 hidden lg:table-cell">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Tél.</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Produit</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Qté</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {formatDate(d.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{d.nom}</td>
                    <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{d.email}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{d.telephone || "—"}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">{d.produit}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{d.quantite || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/devis/${d.id}`}
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        Voir →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              {currentPage > 1 && (
                <Link
                  href={`/admin/devis?status=${currentStatus}&page=${currentPage - 1}`}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  ← Précédent
                </Link>
              )}
              <span className="text-sm text-gray-500">
                Page {currentPage} / {totalPages} ({total} demandes)
              </span>
              {currentPage < totalPages && (
                <Link
                  href={`/admin/devis?status=${currentStatus}&page=${currentPage + 1}`}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  Suivant →
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
