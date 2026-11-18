"use client";

/**
 * Consultation d'un reçu (cercle 5, 5.22 : `POST /api/site/receipt`, le code dans le CORPS, jamais dans une adresse, attendu P03). La référence et le code d'accès sont lus
 * dans le FRAGMENT (`#ref=…&code=…`, jamais envoyé au serveur avec l'adresse de la page) ou saisis. Référence
 * inconnue et code faux sont indiscernables (même message, C0) ; aucune donnée de contact n'est affichée.
 * Après chaque consultation (revue BC3 F-04) : le fragment est retiré de l'adresse et de l'historique
 * (`history.replaceState` vers `/recu`), le champ du code est vidé, et un retour arrière (y compris depuis le cache
 * de navigation du navigateur) n'affiche plus le reçu sans nouvelle saisie.
 */
import { useEffect, useRef, useState } from "react";
import { codeMessage, reportCodes } from "@/components/site/codes";
import { ReceiptDetails, type ReceiptData } from "@/components/checkout/receipt-details";

type Found = { kind: string; status: string; receipt_ref: string; receipt: ReceiptData; number?: string | null; transmission_label?: string; document?: { kind: string; sha256: string } | null };
const KIND_LABEL: Record<string, string> = { order: "Commande", quote_request: "Demande de devis", message: "Demande" };
type State = { kind: "idle" } | { kind: "loading" } | { kind: "found"; data: Found } | { kind: "refused"; code: string };

export function ReceiptLookup() {
  const [ref, setRef] = useState("");
  const [code, setCode] = useState("");
  const result = useRef<HTMLHeadingElement>(null);
  const error = useRef<HTMLParagraphElement>(null);
  const [missing, setMissing] = useState({ ref: false, code: false });
  const [state, setState] = useState<State>({ kind: "idle" });
  // Le couple référence + code de la dernière consultation réussie, gardé en mémoire seulement pour télécharger le PDF (jamais affiché ni stocké).
  const access = useRef<{ ref: string; code: string } | null>(null);
  const [pdfError, setPdfError] = useState(false);

  async function lookup(r: string, c: string) {
    const empty = { ref: !r.trim(), code: !c.trim() };
    setMissing(empty);
    if (empty.ref || empty.code) {
      setState({ kind: "refused", code: "MISSING_FIELDS" });
      return;
    }
    setState({ kind: "loading" });
    // Le code ne doit persister ni dans l'adresse, ni dans l'historique, ni dans le champ.
    // État d'historique de Next conservé (sinon le routeur ne sait plus restaurer la page au retour).
    if (window.location.hash !== "") window.history.replaceState(window.history.state, "", "/recu");
    setCode("");
    try {
      const body = JSON.stringify({ ref: r.trim(), code: c.trim() });
      const res = await fetch("/api/site/receipt", { method: "POST", body, headers: { "content-type": "application/json" }, cache: "no-store", credentials: "same-origin" });
      const j = (await res.json().catch(() => null)) as (Found & { error_codes?: string[]; outcome?: string }) | null;
      setPdfError(false);
      if (res.status === 200 && j?.receipt_ref) {
        access.current = { ref: r.trim(), code: c.trim() };
        setState({ kind: "found", data: j });
      } else {
        access.current = null;
        setState({ kind: "refused", code: j?.error_codes?.[0] ?? (j?.outcome === "TRANSPORT_ERROR" ? "TRANSPORT_ERROR" : "NOT_FOUND") });
      }
    } catch {
      setState({ kind: "refused", code: "NETWORK" });
    }
  }

  // Lien de consultation : lu au chargement ET à chaque changement de fragment (même page, autre lien collé).
  useEffect(() => {
    const fromHash = () => {
      const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const r = h.get("ref") ?? "";
      const c = h.get("code") ?? "";
      if (r) setRef(r);
      if (c) setCode(c);
      if (r && c) void lookup(r, c);
    };
    // Page restaurée depuis le cache de navigation (retour arrière) : rien n'est réaffiché sans ressaisie.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setState({ kind: "idle" });
        setCode("");
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  useEffect(() => {
    if (state.kind === "found") result.current?.focus();
    if (state.kind === "refused") {
      error.current?.focus();
      reportCodes("receipt-lookup", [state.code]);
    }
  }, [state]);

  async function downloadPdf(number: string) {
    if (access.current === null) return;
    setPdfError(false);
    try {
      const res = await fetch("/api/site/receipt/document", { method: "POST", body: JSON.stringify(access.current), headers: { "content-type": "application/json" }, cache: "no-store", credentials: "same-origin" });
      if (res.status !== 200) throw new Error("document");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${number}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setPdfError(true);
    }
  }

  const d = state.kind === "found" ? state.data : null;
  return (
    <div className="min-w-0 space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(ref, code);
        }}
        noValidate
        className="grid max-w-2xl gap-4 rounded-[14px] border border-line bg-white p-4 sm:grid-cols-2"
      >
        <div className="min-w-0">
          <label htmlFor="r-ref" className="block text-sm font-medium">Référence</label>
          <input required aria-invalid={missing.ref || undefined} aria-describedby={state.kind === "refused" ? "receipt-error" : undefined} id="r-ref" value={ref} maxLength={64} autoComplete="off" onChange={(e) => setRef(e.target.value)} className="mt-1 block h-[44px] w-full rounded-[9px] border border-line-strong px-3 font-mono text-sm" />
        </div>
        <div className="min-w-0">
          <label htmlFor="r-code" className="block text-sm font-medium">Code d&apos;accès</label>
          <input required aria-invalid={missing.code || undefined} aria-describedby={state.kind === "refused" ? "receipt-error" : undefined} id="r-code" type="password" value={code} maxLength={128} autoComplete="off" onChange={(e) => setCode(e.target.value)} className="mt-1 block h-[44px] w-full rounded-[9px] border border-line-strong px-3 font-mono text-sm" />
        </div>
        <button type="submit" disabled={state.kind === "loading"} className="h-[44px] rounded-[9px] bg-brand hover:bg-brand-dark px-5 font-semibold text-white sm:col-span-2 sm:justify-self-start">Consulter</button>
      </form>
      <div aria-live="polite">
        {state.kind === "loading" && <p className="text-ink-3">Recherche du reçu…</p>}
        {state.kind === "refused" && (
          <p id="receipt-error" ref={error} tabIndex={-1} role="alert" className="rounded-[9px] border-2 border-signal bg-white p-3" data-testid="receipt-refused" data-code={state.code}>{state.code === "MISSING_FIELDS" ? "Saisissez la référence et le code d’accès pour consulter un reçu." : codeMessage(state.code)}</p>
        )}
        {d && (
          <section aria-labelledby="rc-h" className="min-w-0 rounded-[14px] border border-line bg-white p-4" data-testid="receipt-found">
            <h2 id="rc-h" ref={result} tabIndex={-1} className="break-all text-lg font-semibold">
              {KIND_LABEL[d.kind] ?? "Demande"} <span className="font-mono">{d.number ?? d.receipt_ref}</span>
            </h2>
            <p className="text-sm text-ink-2" data-testid="receipt-transmission">
              État : {d.transmission_label ?? (d.status === "RECEIVED" ? "Reçue" : d.status)}
            </p>
            {d.document && (
              <p className="mt-2">
                <button type="button" onClick={() => void downloadPdf(d.number ?? d.receipt_ref)} className="h-[44px] rounded-[9px] border border-line-strong px-4 font-medium" data-testid="receipt-pdf">
                  Télécharger le PDF
                </button>
                {pdfError && <span role="alert" className="ml-3 text-sm">Le PDF n&apos;a pas pu être téléchargé. Réessayez.</span>}
              </p>
            )}
            <div className="mt-3"><ReceiptDetails receipt={d.receipt} isOrder={d.kind === "order"} /></div>
          </section>
        )}
      </div>
    </div>
  );
}
