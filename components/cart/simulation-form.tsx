"use client";

// Demande de devis / commande -> SIMULATEUR CONTRACTUEL (/api/site/quote|order).
// Envoie exactement les lignes affichées ; le serveur les revalide.
import Price from "components/price";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useCart } from "./cart-context";

type Kind = "quote" | "order";

type SimResponse = {
  simulation?: boolean;
  persistence?: string;
  ok?: boolean;
  receipt_id?: string;
  kind?: string;
  idempotent_replay?: boolean;
  as_of_utc?: string;
  totals?: { currency: string; tax_basis_or_status: string; lines_amount: string }[];
  not_qualified?: string[];
  notice?: string;
  error?: { code: string; detail: string };
  line_errors?: { line: number; code: string; detail: string; expected?: unknown }[];
};

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SimulationForm() {
  const { displayed } = useCart();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<Kind | null>(null);
  const [result, setResult] = useState<{ status: number; body: SimResponse } | null>(null);

  const payloadLines = useMemo(
    () =>
      displayed.map((l) => ({
        public_item_key: l.public_item_key,
        variant_axes: l.variant_axes,
        quantity: l.quantity,
        rate_id: l.price.ok ? l.price.price.rate_id : null,
        unit_amount: l.price.ok ? l.price.price.unit_amount : null,
      })),
    [displayed],
  );
  const linesSignature = JSON.stringify(payloadLines);

  // Une clé d'idempotence par contenu de panier : renvoyer le même panier
  // rejoue le même reçu ; modifier le panier génère une nouvelle clé.
  const [idemKey, setIdemKey] = useState<string>("");
  useEffect(() => {
    setIdemKey(newKey());
    setResult(null);
  }, [linesSignature]);

  const missingPrice = displayed.some((l) => !l.price.ok);

  async function submit(kind: Kind, e?: FormEvent) {
    e?.preventDefault();
    setPending(kind);
    try {
      const res = await fetch(`/api/site/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: `${kind}-${idemKey}`,
          contact: { name, email },
          lines: payloadLines,
        }),
      });
      setResult({ status: res.status, body: (await res.json()) as SimResponse });
    } catch {
      setResult({ status: 0, body: { error: { code: "NETWORK", detail: "requête impossible" } } });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded-lg border-2 border-dashed border-amber-500 bg-amber-50 p-5">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-800">
        Simulation — aucune persistance
      </p>
      <p className="mb-4 text-xs text-amber-900">
        Devis et commande passent par un simulateur contractuel : rien n&apos;est enregistré ni
        transmis (NONE_CONTRACTUAL_SIMULATION).
      </p>
      <form className="space-y-3" onSubmit={(e) => submit("quote", e)}>
        <div>
          <label htmlFor="sim-name" className="mb-1 block text-sm font-medium text-gray-700">
            Nom
          </label>
          <input
            id="sim-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="sim-email" className="mb-1 block text-sm font-medium text-gray-700">
            E-mail
          </label>
          <input
            id="sim-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        {missingPrice && (
          <p className="text-sm font-medium text-amber-800">
            Au moins une ligne n&apos;a pas de prix disponible : envoi impossible.
          </p>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={pending !== null || missingPrice}
            className="w-full rounded-md bg-[#cc1818] py-3 text-sm font-semibold text-white hover:bg-[#aa1414] disabled:opacity-60"
          >
            {pending === "quote" ? "Simulation en cours…" : "Simuler une demande de devis"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              const form = (e.currentTarget as HTMLButtonElement).form;
              if (form && !form.reportValidity()) return;
              void submit("order");
            }}
            disabled={pending !== null || missingPrice}
            className="w-full rounded-md border border-[#cc1818] py-2.5 text-sm font-semibold text-[#cc1818] hover:bg-red-50 disabled:opacity-60"
          >
            {pending === "order" ? "Simulation en cours…" : "Simuler une commande"}
          </button>
        </div>
      </form>

      {result && (
        <div role="status" aria-live="polite" className="mt-4 rounded-md border border-gray-300 bg-white p-4 text-sm">
          <p className="mb-2 text-xs font-bold uppercase text-amber-800">
            SIMULATION · {result.body.persistence ?? "NONE_CONTRACTUAL_SIMULATION"} · HTTP {result.status}
          </p>
          {result.body.ok ? (
            <>
              <p className="font-semibold text-gray-900">
                Reçu simulé {result.body.kind === "ORDER" ? "de commande" : "de devis"} :{" "}
                <span className="font-mono">{result.body.receipt_id}</span>
                {result.body.idempotent_replay ? " (rejeu idempotent : même reçu)" : ""}
              </p>
              {result.body.totals?.map((t) => (
                <div key={t.currency} className="mt-1 flex justify-between">
                  <span>Somme des lignes revalidée</span>
                  <Price amount={t.lines_amount} currencyCode={t.currency} taxBasis={t.tax_basis_or_status} />
                </div>
              ))}
              <p className="mt-2 text-xs text-gray-500">
                Non qualifié : {result.body.not_qualified?.join(", ")}. Instant serveur :{" "}
                {result.body.as_of_utc}.
              </p>
              <p className="mt-1 text-xs text-gray-500">{result.body.notice}</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-red-700">
                Refusé : <span className="font-mono">{result.body.error?.code}</span>
              </p>
              <p className="text-gray-700">{result.body.error?.detail}</p>
              {result.body.line_errors?.map((le) => (
                <p key={le.line} className="mt-1 text-xs text-gray-600">
                  Ligne {le.line + 1} : {le.code} — {le.detail}
                  {le.expected ? ` (attendu : ${JSON.stringify(le.expected)})` : ""}
                </p>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
