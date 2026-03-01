import { supabaseServer } from "lib/supabase/client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Journal d'audit — Admin PRODES",
};

type AuditEntry = {
  id: string;
  actor: string;
  role: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  payload_summary: string | null;
  success: boolean;
  created_at: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTION_LABELS: Record<string, string> = {
  "product.update": "Produit modifié",
  "product.rollback": "Rollback produit",
  "devis.bulk_status": "Statut devis bulk",
  "webhook.trigger": "Webhook déclenché",
  "devis.status_update": "Statut devis",
};

export default async function AuditPage(props: {
  searchParams?: Promise<{ action?: string; entity?: string }>;
}) {
  const sp = await props.searchParams;
  const filterAction = sp?.action;
  const filterEntity = sp?.entity;

  let entries: AuditEntry[] = [];
  let tableError = false;

  try {
    const client = supabaseServer();
    let q = client
      .from("admin_audit_log")
      .select("id, actor, role, action, entity, entity_id, payload_summary, success, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (filterAction) q = q.eq("action", filterAction);
    if (filterEntity) q = q.eq("entity", filterEntity);

    const { data, error } = await q;
    if (error?.code === "42P01") {
      tableError = true;
    } else if (!error) {
      entries = (data ?? []) as AuditEntry[];
    }
  } catch {
    tableError = true;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Journal d&apos;audit</h1>

      {tableError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-800">⚠️ Table admin_audit_log absente</p>
          <p className="mt-1 text-sm text-amber-700">
            Exécutez <code className="rounded bg-amber-100 px-1">docs/sql-migrations/012-admin-audit-log.sql</code> dans Supabase.
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          Aucune entrée d&apos;audit pour le moment.
          <p className="mt-1 text-xs text-gray-400">
            Les actions admin (modifications produit, rollbacks, bulk devis) sont enregistrées ici.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Action</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Entité</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 hidden lg:table-cell">Résumé</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(e.created_at)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-800">
                    {ACTION_LABELS[e.action] ?? e.action}
                    <span className="ml-1 text-gray-400">({e.actor}/{e.role})</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 hidden md:table-cell">
                    {e.entity && <span className="font-medium">{e.entity}</span>}
                    {e.entity_id && <span className="ml-1 text-gray-400 font-mono">{e.entity_id.slice(0, 8)}…</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate hidden lg:table-cell">
                    {e.payload_summary ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      e.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {e.success ? "OK" : "Échec"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
