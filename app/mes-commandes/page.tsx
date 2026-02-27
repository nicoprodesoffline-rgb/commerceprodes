"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface StoredOrder {
  orderId: string;
  date: string;
  items: Array<{ title: string; sku?: string; quantity: number; price?: number }>;
  totalHT?: number;
  status: string;
  mode?: string;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:   { label: "En attente", cls: "bg-gray-100 text-gray-600" },
  contacted: { label: "Contacté",   cls: "bg-amber-100 text-amber-700" },
  confirmed: { label: "Confirmé",   cls: "bg-green-100 text-green-700" },
  cancelled: { label: "Annulé",     cls: "bg-red-100 text-red-600" },
  nouveau:   { label: "Reçu",       cls: "bg-blue-100 text-blue-700" },
  en_cours:  { label: "En cours",   cls: "bg-amber-100 text-amber-700" },
  traite:    { label: "Traité",     cls: "bg-green-100 text-green-700" },
};

export default function MesCommandesPage() {
  const [orders, setOrders] = useState<StoredOrder[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("prodes_orders");
      if (stored) {
        const parsed: StoredOrder[] = JSON.parse(stored);
        // Sort by date descending
        setOrders(parsed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
    } catch {}
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Mes demandes de devis</h1>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <div className="mb-4 text-5xl">📋</div>
          <p className="text-lg font-medium text-gray-700">
            Vous n&apos;avez pas encore passé de commande.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Vos demandes de devis seront conservées ici.
          </p>
          <Link
            href="/search"
            className="mt-6 inline-flex items-center rounded-lg bg-[#cc1818] px-6 py-3 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
          >
            Voir le catalogue
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const s = STATUS_MAP[order.status] ?? { label: order.status, cls: "bg-gray-100 text-gray-600" };
            const date = new Date(order.date).toLocaleDateString("fr-FR", {
              day: "numeric", month: "long", year: "numeric",
            });
            const summary = order.items
              .slice(0, 3)
              .map((i) => i.title)
              .join(", ");
            const skuList = order.items.map((i) => i.sku).filter(Boolean).join(",");

            return (
              <div
                key={order.orderId}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-gray-800">
                        #{order.orderId.slice(0, 8).toUpperCase()}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
                        {s.label}
                      </span>
                      {order.mode && (
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
                          {order.mode}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">{date}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-gray-600">{summary}</p>
                    {order.totalHT && (
                      <p className="mt-1 text-sm font-semibold text-gray-800">
                        {new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(order.totalHT)}{" "}
                        € HT
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 flex-none">
                    <Link
                      href={`/mon-devis/${order.orderId}`}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-[#cc1818] hover:text-[#cc1818] transition-colors whitespace-nowrap"
                    >
                      👁 Voir le suivi
                    </Link>
                    <Link
                      href={`/devis-express?${skuList ? `ref=${encodeURIComponent(skuList)}` : ""}`}
                      className="rounded-lg bg-[#cc1818] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#aa1414] transition-colors whitespace-nowrap text-center"
                    >
                      🔁 Recommander
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
