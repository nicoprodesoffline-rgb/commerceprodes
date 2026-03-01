"use client";

import { useState } from "react";

type ToolStatus = {
  loading: boolean;
  result: string | null;
  error: string | null;
  lastRun: string | null;
};

type ToolId = "seo_audit" | "descriptions_missing" | "detect_duplicates" | "webhook_weekly";

const TOOLS: { id: ToolId; label: string; description: string; icon: string; endpoint: string; method: string; body?: object }[] = [
  {
    id: "seo_audit",
    label: "Audit SEO",
    description: "Lance l'audit SEO sur tous les produits publiés et retourne les scores.",
    icon: "🔍",
    endpoint: "/api/admin/ia/audit",
    method: "GET",
  },
  {
    id: "descriptions_missing",
    label: "Descriptions manquantes",
    description: "Liste les produits sans description et prépare les descriptions IA en attente.",
    icon: "📝",
    endpoint: "/api/admin/ia/generate-descriptions?mode=list",
    method: "GET",
  },
  {
    id: "detect_duplicates",
    label: "Détecter les doublons",
    description: "Détecte les produits potentiellement dupliqués par nom / SKU.",
    icon: "🔄",
    endpoint: "/api/admin/ia/detect-duplicates",
    method: "GET",
  },
  {
    id: "webhook_weekly",
    label: "Rapport hebdomadaire N8N",
    description: "Déclenche le webhook N8N pour le rapport hebdomadaire automatisé.",
    icon: "📊",
    endpoint: "/api/admin/trigger-webhook",
    method: "POST",
    body: { webhook: "weekly_report" },
  },
];

function ToolCard({ tool, status, onRun }: {
  tool: (typeof TOOLS)[number];
  status: ToolStatus;
  onRun: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{tool.icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm">{tool.label}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{tool.description}</p>
        </div>
        <button
          onClick={onRun}
          disabled={status.loading}
          className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {status.loading ? "…" : "Lancer"}
        </button>
      </div>

      {status.lastRun && (
        <p className="text-xs text-gray-400">Dernière exécution : {status.lastRun}</p>
      )}

      {status.error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {status.error}
        </div>
      )}

      {status.result && (
        <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap max-h-40 overflow-auto">{status.result}</pre>
        </div>
      )}
    </div>
  );
}

const initialStatus = (): ToolStatus => ({ loading: false, result: null, error: null, lastRun: null });

export default function AutomationPage() {
  const [statuses, setStatuses] = useState<Record<ToolId, ToolStatus>>({
    seo_audit: initialStatus(),
    descriptions_missing: initialStatus(),
    detect_duplicates: initialStatus(),
    webhook_weekly: initialStatus(),
  });

  async function runTool(tool: (typeof TOOLS)[number]) {
    setStatuses((prev) => ({
      ...prev,
      [tool.id]: { ...prev[tool.id], loading: true, error: null, result: null },
    }));

    try {
      const res = await fetch(tool.endpoint, {
        method: tool.method,
        headers: tool.body ? { "Content-Type": "application/json" } : undefined,
        body: tool.body ? JSON.stringify(tool.body) : undefined,
      });

      const data = await res.json().catch(() => ({}));
      const now = new Date().toLocaleTimeString("fr-FR");

      if (!res.ok) {
        setStatuses((prev) => ({
          ...prev,
          [tool.id]: { loading: false, error: data.error ?? `Erreur HTTP ${res.status}`, result: null, lastRun: now },
        }));
        return;
      }

      // Summarize result
      let summary = "";
      if (data.count !== undefined) summary += `${data.count} éléments. `;
      if (data.products) summary += `${Array.isArray(data.products) ? data.products.length : "?"} produits. `;
      if (data.duplicates) summary += `${Array.isArray(data.duplicates) ? data.duplicates.length : "?"} doublons. `;
      if (data.success !== undefined) summary += data.success ? "Succès." : "Échec.";
      if (data.reason) summary += ` ${data.reason}`;
      if (!summary) summary = JSON.stringify(data, null, 2).slice(0, 500);

      setStatuses((prev) => ({
        ...prev,
        [tool.id]: { loading: false, error: null, result: summary, lastRun: now },
      }));
    } catch (err) {
      const now = new Date().toLocaleTimeString("fr-FR");
      setStatuses((prev) => ({
        ...prev,
        [tool.id]: { loading: false, error: String(err), result: null, lastRun: now },
      }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Centre d&apos;automatisation IA</h1>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">Beta</span>
      </div>

      <p className="text-sm text-gray-500">
        Orchestrez les outils IA et automatisations existants. Chaque outil se branche sur les endpoints API déjà
        disponibles.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {TOOLS.map((tool) => (
          <ToolCard
            key={tool.id}
            tool={tool}
            status={statuses[tool.id]}
            onRun={() => runTool(tool)}
          />
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
        <p className="font-medium text-gray-700 mb-1">Ajouter un outil</p>
        <p>
          Créez de nouveaux endpoints dans <code className="bg-gray-100 px-1 rounded">app/api/admin/ia/</code> et
          ajoutez-les au tableau <code className="bg-gray-100 px-1 rounded">TOOLS</code> dans ce fichier.
        </p>
      </div>
    </div>
  );
}
