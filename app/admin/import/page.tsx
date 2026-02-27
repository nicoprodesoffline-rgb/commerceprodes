"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

interface ImportLog {
  id: string;
  filename: string;
  file_url: string | null;
  status: "pending" | "processing" | "done" | "error";
  rows_processed: number;
  notes: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending:    { label: "En attente", cls: "bg-gray-100 text-gray-700" },
  processing: { label: "En cours",   cls: "bg-amber-100 text-amber-700" },
  done:       { label: "Terminé",    cls: "bg-green-100 text-green-700" },
  error:      { label: "Erreur",     cls: "bg-red-100 text-red-700" },
};

export default function AdminImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const password =
    typeof window !== "undefined"
      ? sessionStorage.getItem("admin_password") ?? ""
      : "";

  const fetchLogs = async () => {
    const res = await fetch("/api/admin/import-logs", {
      headers: { Authorization: `Bearer ${password}` },
    });
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs ?? []);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleFile = (f: File) => {
    const allowed = [".xlsx", ".xls", ".csv", ".ods"];
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!allowed.includes(ext)) {
      toast.error("Format non supporté. Utilisez Excel (.xlsx, .xls) ou CSV.");
      return;
    }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      // Upload to Supabase Storage via the API
      const formData = new FormData();
      formData.append("file", file);

      // First create a log entry
      const logRes = await fetch("/api/admin/import-logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify({ filename: file.name }),
      });
      const logData = await logRes.json();
      const logId = logData.id;

      // Trigger n8n webhook
      const webhookRes = await fetch("/api/admin/trigger-webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify({
          webhook: "import_supplier",
          payload: { filename: file.name, logId, uploadedAt: new Date().toISOString() },
        }),
      });
      const webhookData = await webhookRes.json();
      toast[webhookData.success ? "success" : "warning"](
        webhookData.message ?? "Import envoyé à n8n pour traitement",
      );
      setFile(null);
      fetchLogs();
    } catch {
      toast.error("Erreur lors de l'envoi.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Import fournisseur</h1>

      {/* Zone drag-drop */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          dragging ? "border-[#cc1818] bg-red-50" : "border-gray-300 bg-white hover:border-gray-400"
        }`}
      >
        {file ? (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg bg-green-100 px-4 py-2 text-sm font-medium text-green-800">
              📄 {file.name}{" "}
              <span className="text-green-600">({(file.size / 1024).toFixed(0)} Ko)</span>
            </div>
            <button
              onClick={() => setFile(null)}
              className="text-xs text-gray-400 hover:text-red-600 transition-colors"
              aria-label="Supprimer le fichier"
            >
              ✕ Supprimer
            </button>
          </div>
        ) : (
          <>
            <div className="mb-2 text-4xl">📁</div>
            <p className="text-sm font-medium text-gray-700">
              Déposez votre fichier Excel ou CSV ici
            </p>
            <p className="mt-1 text-xs text-gray-400">.xlsx, .xls, .csv, .ods</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors"
            >
              Parcourir…
            </button>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.ods"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {file && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="flex items-center gap-2 rounded-lg bg-[#cc1818] px-6 py-3 text-sm font-semibold text-white hover:bg-[#aa1414] disabled:opacity-60 transition-colors"
        >
          {uploading ? "Envoi en cours…" : "📤 Envoyer à n8n pour traitement"}
        </button>
      )}

      {/* Config info */}
      {!process.env.NEXT_PUBLIC_N8N_CONFIGURED && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚙️ Configurez <code className="rounded bg-amber-100 px-1">N8N_WEBHOOK_IMPORT</code> pour
          activer le traitement automatique des imports.
        </div>
      )}

      {/* Logs récents */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Imports récents</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun import enregistré.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Fichier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Statut</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Lignes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => {
                  const s = STATUS_LABELS[log.status] ?? { label: log.status, cls: "bg-gray-100 text-gray-700" };
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-[200px] truncate">
                        {log.filename ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {log.rows_processed > 0 ? log.rows_processed : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[180px] truncate">
                        {log.notes ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
