"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { adminFetch } from "lib/admin/fetch";

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
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchLogs = async () => {
    const res = await adminFetch("/api/admin/import-logs");
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
    setUploadProgress(null);
    try {
      // ── Étape 1: Upload vers Supabase Storage ─────────────────────────────
      setUploadProgress("Envoi du fichier vers le stockage…");
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await adminFetch("/api/admin/import-upload", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      const fileUrl: string | null = uploadData.url ?? null;
      const storageFallback: boolean = uploadData.fallback === true;

      if (storageFallback) {
        console.warn("[import] Storage indisponible:", uploadData.reason);
      }

      // ── Étape 2: Créer l'entrée de log avec file_url ──────────────────────
      setUploadProgress("Enregistrement du log d'import…");
      const logRes = await adminFetch("/api/admin/import-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          ...(fileUrl ? { file_url: fileUrl } : {}),
        }),
      });
      const logData = await logRes.json();
      const logId: string | null = logData.id ?? null;

      // ── Étape 3: Déclencher le webhook n8n ────────────────────────────────
      setUploadProgress("Déclenchement du traitement n8n…");
      const webhookRes = await adminFetch("/api/admin/trigger-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhook: "import_supplier",
          payload: {
            filename: file.name,
            logId,
            file_url: fileUrl,
            uploadedAt: new Date().toISOString(),
            storage_available: !storageFallback,
          },
        }),
      });
      const webhookData = await webhookRes.json();

      if (storageFallback) {
        toast.warning("Fichier envoyé à n8n — stockage Storage non disponible, file_url absent.");
      } else {
        toast[webhookData.success ? "success" : "warning"](
          webhookData.message ?? "Import envoyé à n8n pour traitement",
        );
      }

      setFile(null);
      fetchLogs();
    } catch (err) {
      console.error("[import] Erreur upload:", err);
      toast.error("Erreur lors de l'envoi.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
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
        <div className="flex flex-col gap-2">
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="flex items-center gap-2 rounded-lg bg-[#cc1818] px-6 py-3 text-sm font-semibold text-white hover:bg-[#aa1414] disabled:opacity-60 transition-colors"
          >
            {uploading ? "Envoi en cours…" : "📤 Envoyer à n8n pour traitement"}
          </button>
          {uploadProgress && (
            <p className="text-xs text-gray-500 animate-pulse">{uploadProgress}</p>
          )}
        </div>
      )}

      {/* Étapes du processus */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <p className="mb-2 text-xs font-semibold text-blue-800">Processus d&apos;import</p>
        <ol className="space-y-1 text-xs text-blue-700">
          <li>1. Le fichier est uploadé vers Supabase Storage (bucket: imports)</li>
          <li>2. Un log d&apos;import est créé avec l&apos;URL du fichier</li>
          <li>3. Le webhook n8n est déclenché avec la référence du fichier</li>
        </ol>
      </div>

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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Lien fichier</th>
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
                      <td className="px-4 py-3 text-xs">
                        {log.file_url ? (
                          <a
                            href={log.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline truncate block max-w-[120px]"
                            title={log.file_url}
                          >
                            📎 Voir fichier
                          </a>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
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
