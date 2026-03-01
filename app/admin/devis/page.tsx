import Link from "next/link";
import { getDevisRequests } from "lib/supabase/index";
import type { DevisRequest } from "lib/supabase/types";
import DevisListClient from "./devis-list-client";

const STATUSES = [
  { value: "all", label: "Tous" },
  { value: "nouveau", label: "Nouvelles" },
  { value: "en_cours", label: "En cours" },
  { value: "traite", label: "Traitées" },
  { value: "archive", label: "Archivées" },
  { value: "refuse", label: "Refusées" },
];

const PER_PAGE = 20;

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Demandes de devis</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/api/admin/export-devis?status=${encodeURIComponent(currentStatus)}&format=xls`}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-300 transition-colors"
          >
            Export Excel
          </Link>
          <Link
            href={`/api/admin/export-devis?status=${encodeURIComponent(currentStatus)}&format=csv`}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-300 transition-colors"
          >
            Export CSV
          </Link>
        </div>
      </div>

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
          <DevisListClient initialData={data} />

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
