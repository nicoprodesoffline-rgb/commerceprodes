import Link from "next/link";
import { notFound } from "next/navigation";
import StatusBadge from "components/admin/status-badge";
import DevisDetailActions from "./actions";
import { getDevisRequests } from "lib/supabase/index";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DevisDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  let devis = null;
  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();
    const { data } = await client
      .from("devis_requests")
      .select("*")
      .eq("id", id)
      .single();
    devis = data;
  } catch {
    return notFound();
  }

  if (!devis) return notFound();

  return (
    <div className="space-y-6 max-w-4xl">
      {/* En-tête */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/devis"
          className="text-sm text-gray-500 hover:text-blue-600"
        >
          ← Retour à la liste
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Demande #{id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Reçue le {formatDate(devis.created_at)}
          </p>
        </div>
        <StatusBadge status={devis.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Informations demande */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 border-b pb-2">
            Informations du contact
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Nom</dt>
              <dd className="font-medium text-gray-800 mt-0.5">{devis.nom}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Email</dt>
              <dd className="mt-0.5">
                <a
                  href={`mailto:${devis.email}?subject=Re: Demande de devis - ${devis.produit}`}
                  className="text-blue-600 hover:underline"
                >
                  {devis.email}
                </a>
              </dd>
            </div>
            {devis.telephone && (
              <div>
                <dt className="text-gray-500">Téléphone</dt>
                <dd className="font-medium text-gray-800 mt-0.5">
                  {devis.telephone}
                </dd>
              </div>
            )}
          </dl>

          <h2 className="font-semibold text-gray-900 border-b pb-2 pt-2">
            Produit demandé
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Produit</dt>
              <dd className="font-medium text-gray-800 mt-0.5">
                {devis.produit}
              </dd>
            </div>
            {devis.sku && (
              <div>
                <dt className="text-gray-500">Référence (SKU)</dt>
                <dd className="font-mono text-gray-800 mt-0.5">{devis.sku}</dd>
              </div>
            )}
            {devis.quantite && (
              <div>
                <dt className="text-gray-500">Quantité souhaitée</dt>
                <dd className="font-medium text-gray-800 mt-0.5">
                  {devis.quantite}
                </dd>
              </div>
            )}
            {devis.message && (
              <div>
                <dt className="text-gray-500">Message</dt>
                <dd className="mt-0.5 text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">
                  {devis.message}
                </dd>
              </div>
            )}
          </dl>

          {devis.ip_address && (
            <p className="text-xs text-gray-300 pt-2">
              IP : {devis.ip_address}
            </p>
          )}
        </div>

        {/* Gestion interne */}
        <DevisDetailActions devis={devis} />
      </div>
    </div>
  );
}
