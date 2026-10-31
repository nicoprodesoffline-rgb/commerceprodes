"use client";

/**
 * Envoi d'une demande de devis / commande et lecture HONNÊTE de la réponse (BC4 `POSTGRESQL_SITE_LOCAL` ou A2
 * `NONE_UNTIL_BC4`). « Reçu » n'est affiché que pour `durable: true` + `receipt_ref` (UX-P10 : confirmation
 * seulement après persistance et identifiant réel). Idempotence : la même clé est réutilisée tant que le contenu
 * envoyé est identique (réessai après coupure réseau = rejeu) ; contenu changé → nouvelle clé.
 * Empreinte et clé seules survivent au rechargement dans la session de cet onglet si le stockage est disponible.
 */
import type { ReceiptData } from "@/components/checkout/receipt-details";
import { newIdempotencyKey, postJson } from "@/components/site/api";

export type Outcome =
  | { kind: "received"; durable: true; ref: string; token: string | null; replay: boolean; receipt: ReceiptData | null; objectKind: "quote_request" | "order" }
  | { kind: "accepted_not_durable"; persistence: string }
  | { kind: "refused"; status: number; codes: string[]; superseded: Record<string, string> }
  | { kind: "network" };

type Body = { contract_version: "site_business.v1"; kind: "quote_request" | "order"; idempotency_key?: string } & Record<string, unknown>;

export class Submitter {
  private last: { payload: string; key: string } | null = null;
  private inFlight: { payload: string; promise: Promise<Outcome> } | null = null;

  send(path: "/api/site/quote" | "/api/site/order", body: Body): Promise<Outcome> {
    const { idempotency_key: _ignored, ...rest } = body;
    const payload = JSON.stringify(rest);
    if (this.inFlight?.payload === payload) return this.inFlight.promise;
    const promise = this.sendOnce(path, rest, payload).finally(() => {
      if (this.inFlight?.promise === promise) this.inFlight = null;
    });
    this.inFlight = { payload, promise };
    return promise;
  }

  private async sendOnce(path: "/api/site/quote" | "/api/site/order", rest: Body, payload: string): Promise<Outcome> {
    if (this.last?.payload !== payload) this.last = { payload, key: newIdempotencyKey(rest.kind === "order" ? "order" : "quote") };
    const attempt = this.last;
    // Session de cet onglet seulement. Ni contenu personnel, ni reçu, ni code d'accès stockés.
    // Écrit AVANT le POST : même après une réponse perdue et un rechargement, le serveur reçoit la même clé.
    try {
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload))), (b) => b.toString(16).padStart(2, "0")).join("");
      const storageKey = `prodes_site_submission_v1:${path}`;
      const saved = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null") as { digest?: unknown; key?: unknown } | null;
      if (saved?.digest === digest && typeof saved.key === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(saved.key)) attempt.key = saved.key;
      window.sessionStorage.setItem(storageKey, JSON.stringify({ digest, key: attempt.key }));
    } catch {
      // Stockage/crypto indisponible : la même instance garde sa clé, sans stocker les coordonnées ailleurs.
    }
    const r = await postJson<Record<string, unknown>>(path, { ...rest, idempotency_key: attempt.key });
    if (r.network) return { kind: "network" };
    const j = r.json ?? {};
    const verdict = (j["verdict"] ?? null) as { accepted?: boolean; error_codes?: string[]; superseded_by?: Record<string, string> } | null;
    const accepted = j["accepted"] === true || (j["accepted"] === undefined && verdict?.accepted === true);
    if (r.status === 200 && accepted && j["durable"] === true && typeof j["receipt_ref"] === "string") {
      const outcome = j["outcome"];
      return {
        kind: "received",
        durable: true,
        ref: j["receipt_ref"] as string,
        token: typeof j["access_token"] === "string" ? (j["access_token"] as string) : null,
        replay: outcome === "REPLAY_SAME_RECEIPT",
        receipt: (j["receipt"] ?? null) as ReceiptData | null,
        objectKind: rest.kind,
      };
    }
    if (r.status === 200 && accepted) return { kind: "accepted_not_durable", persistence: String(j["persistence"] ?? "inconnue") };
    const codes = (Array.isArray(j["error_codes"]) && (j["error_codes"] as string[]).length > 0 ? j["error_codes"] : verdict?.error_codes) as string[] | undefined;
    const site = typeof j["site_status"] === "string" ? (j["site_status"] as string) : typeof j["outcome"] === "string" && j["outcome"] === "TRANSPORT_ERROR" ? "TRANSPORT_ERROR" : null;
    return {
      kind: "refused",
      status: r.status,
      codes: codes && codes.length > 0 ? codes : [site ?? "TRANSPORT_ERROR"],
      superseded: ((j["superseded_by"] ?? verdict?.superseded_by ?? {}) as Record<string, string>) ?? {},
    };
  }
}

/** Les refus qui demandent de revoir le panier (nouvel aperçu, nouvelle confirmation). */
export const RECONFIRM = new Set(["CART_STALE", "CATALOG_CHANGED", "PRICE_CHANGED", "PRICE_WINDOW_UNAVAILABLE", "ITEM_SUPERSEDED", "ITEM_RETIRED", "ITEM_NOT_PUBLISHED", "INVALID_VARIANT"]);
