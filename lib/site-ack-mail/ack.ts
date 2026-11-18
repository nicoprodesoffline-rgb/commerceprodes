/**
 * Cercle 5, ligne 5.17 (décision B2 : l'accusé au client part du site ; docs/site_events_v2.md §7) : la file de l'accusé.
 *
 * - Fabriqué DANS la transaction de la demande (`enqueueAcknowledgement`), tout de suite, sans pièce jointe : numéro, récapitulatif et lien
 *   privé vers le reçu (`/recu#ref=…&code=…` : ni la référence ni le code ne voyagent dans une adresse envoyée au serveur, attendu P03).
 * - Textes : ceux de la boutique (`site_commerce.v1`, objet et corps par type, marques {numero}, {recapitulatif}, {lien_recu}).
 * - Un envoi par demande, jamais deux (une ligne par référence) ; états « gardé », « à envoyer », « envoyé », « refusé », « sans réponse » ;
 *   tentatives à 1, 5 et 30 minutes après le premier essai, puis toutes les heures pendant 48 h, puis « sans réponse » (attendus T03, T04).
 * - Mode « gardés » (`SITE_ACK_MAIL_MODE` absent ou `garde`) : le message est fabriqué, rangé, lisible, et RIEN NE SORT ; c'est le seul mode
 *   actif livré. Le mode `smtp` refuse de démarrer (« non livré ») : le service d'envoi est décidé au paquet B. Les accès d'envoi seront des
 *   variables du serveur, jamais une valeur dans Git.
 * Aucune coordonnée dans les journaux (P05) : on journalise la référence, le numéro et l'état, jamais le destinataire ni le corps.
 */
import type { Pool, PoolClient } from "pg";
import type { JsonObject } from "../../c0/ts/src/jsonc";
import { fillMarks, type CommerceDocument } from "../site-commerce/document";
import { readActiveCommerce } from "../site-commerce/store";
import { appendLog } from "../site-transactions/common";

export type AckMode = "garde" | "smtp";
export type AckEventType = "quote.requested" | "order.received" | "message.received";
export type AckState = "garde" | "a_envoyer" | "envoye" | "refuse" | "sans_reponse";
export const ACK_STATE_LABELS: Record<AckState, string> = { garde: "gardé", a_envoyer: "à envoyer", envoye: "envoyé", refuse: "refusé", sans_reponse: "sans réponse" };

export class AckMailConfigError extends Error {
  readonly code = "ACK_MAIL_CONFIG_INVALID";
}

/** Le mode de la file : absent ou `garde` -> « gardés » ; `smtp` -> refusé, non livré dans ce mandat ; autre valeur -> erreur. */
export function ackMailMode(env: Record<string, string | undefined> = process.env): AckMode {
  const raw = env["SITE_ACK_MAIL_MODE"];
  if (raw === undefined || raw === "" || raw === "garde") return "garde";
  if (raw === "smtp") throw new AckMailConfigError("SITE_ACK_MAIL_MODE=smtp : l'envoi réel n'est pas livré (paquet B) ; seul le mode « garde » est actif");
  throw new AckMailConfigError(`SITE_ACK_MAIL_MODE doit être absente ou « garde » (reçu : ${JSON.stringify(raw)})`);
}

export type SmtpSettings = { host: string; port: number; security: "starttls" | "tls"; user: string | null; passwordFile: string | null };

/**
 * Les réglages SMTP du serveur (paquet B), lus des variables d'environnement, jamais dans Git ni dans un journal : `SITE_SMTP_HOST`,
 * `SITE_SMTP_PORT` (défaut 587), `SITE_SMTP_SECURITY` (`starttls` par défaut, ou `tls`), `SITE_SMTP_USER` et `SITE_SMTP_PASSWORD_FILE`
 * (le mot de passe est dans un fichier, jamais dans une variable). `null` si aucun hôte n'est réglé. Aucun transport ne les utilise dans ce mandat.
 */
export function smtpSettings(env: Record<string, string | undefined> = process.env): SmtpSettings | null {
  const host = env["SITE_SMTP_HOST"];
  if (host === undefined || host === "") return null;
  if (!/^[A-Za-z0-9.-]{1,253}$/.test(host)) throw new AckMailConfigError("SITE_SMTP_HOST n'est pas un nom d'hôte");
  const rawPort = env["SITE_SMTP_PORT"] ?? "";
  const port = rawPort === "" ? 587 : /^[1-9][0-9]{0,4}$/.test(rawPort) && Number(rawPort) <= 65535 ? Number(rawPort) : NaN;
  if (Number.isNaN(port)) throw new AckMailConfigError("SITE_SMTP_PORT doit être un port de 1 à 65535");
  const rawSecurity = env["SITE_SMTP_SECURITY"] ?? "";
  if (!["", "starttls", "tls"].includes(rawSecurity)) throw new AckMailConfigError("SITE_SMTP_SECURITY doit être « starttls » ou « tls »");
  const user = env["SITE_SMTP_USER"] || null;
  const passwordFile = env["SITE_SMTP_PASSWORD_FILE"] || null;
  if ((user === null) !== (passwordFile === null)) throw new AckMailConfigError("SITE_SMTP_USER et SITE_SMTP_PASSWORD_FILE vont ensemble");
  return { host, port, security: rawSecurity === "tls" ? "tls" : "starttls", user, passwordFile };
}

/** Le transport d'envoi (paquet B : SMTP standard, sans fournisseur nommé). `refused` : l'adresse est refusée (T05) ; `failed` : le service ne répond pas (T03). */
export interface MailTransport {
  send(message: { to: string; subject: string; text: string; from: { name: string; address: string } | null }): Promise<{ outcome: "sent" } | { outcome: "refused"; code: string } | { outcome: "failed"; code: string }>;
}

// --- rendu ----------------------------------------------------------------------------------------------------------------------------

const ACK_KIND: Record<AckEventType, "quote" | "order" | "message"> = { "quote.requested": "quote", "order.received": "order", "message.received": "message" };

/** « 1234.50 » -> « 1 234,50 € » (espace insécable pour les milliers et avant l'unité). */
export function euros(amount: string): string {
  const [whole, cents] = amount.split(".") as [string, string];
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${cents} €`;
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** Le récapitulatif en texte : lignes (quantité, nom, lot, montant HT ou « prix sur devis »), livraison, totaux, marche à suivre du règlement. */
export function recapitulatif(eventType: AckEventType, payload: JsonObject): string {
  const out: string[] = [];
  if (eventType === "message.received") {
    const product = payload["product"] as JsonObject | null;
    out.push(product ? `Produit : ${str(product["label"])}` : "Demande libre");
    return out.join("\n");
  }
  for (const line of (payload["lines"] as JsonObject[]) ?? []) {
    const lot = line["lot"] as JsonObject | null;
    const lotText = lot ? ` (${String(lot["bought"])} achetés + ${String(lot["free"])} offerts)` : "";
    const amount = line["line_total_ht"] === null ? "prix sur devis" : `${euros(str(line["line_total_ht"]))} HT`;
    out.push(`- ${String(line["quantity"])} × ${str(line["item_label"])}${lotText} : ${amount}`);
  }
  const delivery = payload["delivery"] as JsonObject;
  out.push(`Livraison : ${str(delivery["label"])} — ${euros(str(delivery["amount_ht"]))} HT`);
  const amounts = payload["amounts"] as JsonObject;
  out.push(`Total HT : ${euros(str(amounts["total_ht"]))} ; TVA : ${euros(str(amounts["total_tva"]))} ; Total TTC : ${euros(str(amounts["total_ttc"]))}`);
  if (amounts["excludes_quote_lines"] === true) out.push("Les lignes « prix sur devis » ne sont pas comptées dans ces totaux.");
  if (eventType === "order.received") {
    const payment = payload["payment"] as JsonObject;
    out.push("", "Marche à suivre pour le règlement :", str(payment["instructions"]));
  }
  return out.join("\n");
}

/** Le lien privé vers le reçu : l'origine publique du site (`SITE_PUBLIC_ORIGIN`) quand elle est réglée, sinon un chemin. */
export function receiptLink(ref: string, accessToken: string, origin: string | undefined = process.env["SITE_PUBLIC_ORIGIN"]): string {
  const base = typeof origin === "string" && /^https?:\/\/[^/\s]+$/.test(origin.replace(/\/$/, "")) ? origin.replace(/\/$/, "") : "";
  return `${base}/recu#ref=${encodeURIComponent(ref)}&code=${encodeURIComponent(accessToken)}`;
}

export function renderAcknowledgement(doc: CommerceDocument, eventType: AckEventType, payload: JsonObject, ref: string, accessToken: string, origin?: string): { subject: string; body: string } {
  const template = doc.acknowledgement[ACK_KIND[eventType]];
  const values = { numero: str(payload["number"]), recapitulatif: recapitulatif(eventType, payload), lien_recu: receiptLink(ref, accessToken, origin) };
  return { subject: fillMarks(template.subject, values), body: fillMarks(template.body, values) };
}

// --- file -----------------------------------------------------------------------------------------------------------------------------

/** Délai avant la tentative suivante, après `failed` essais ratés : 1, 5, 30 minutes, puis une heure. */
export function retryDelayMs(failed: number): number {
  return [60_000, 5 * 60_000, 30 * 60_000][failed - 1] ?? 60 * 60_000;
}
export const RETRY_WINDOW_MS = 48 * 60 * 60_000;

export type EnqueueInput = { eventType: AckEventType; objectRef: string; payload: JsonObject; accessToken: string };

/**
 * À appeler DANS la transaction de la demande, après l'insertion de son événement v2 : fabrique l'accusé et le range. Une seule ligne par
 * référence (un rejeu ne fabrique pas un second accusé). Sans réglages de vente actifs, rien n'est rangé (la demande n'aurait pas été prise).
 */
export async function enqueueAcknowledgement(client: PoolClient | Pool, input: EnqueueInput, mode: AckMode = ackMailMode()): Promise<AckState | null> {
  const stored = await readActiveCommerce(client);
  if (stored === null) return null;
  const email = str((input.payload["contact"] as JsonObject | undefined)?.["email"]);
  const { subject, body } = renderAcknowledgement(stored.document, input.eventType, input.payload, input.objectRef, input.accessToken);
  const state: AckState = mode === "garde" ? "garde" : "a_envoyer";
  const { rowCount } = await client.query(
    `INSERT INTO site_ack_mail (object_ref, event_type, number, mode, state, recipient, subject, body, next_attempt_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $5 = 'a_envoyer' THEN now() ELSE NULL END) ON CONFLICT (object_ref) DO NOTHING`,
    [input.objectRef, input.eventType, str(input.payload["number"]), mode, state, email, subject, body],
  );
  return rowCount === 1 ? state : null;
}

/**
 * Un tour de la file (mode `smtp` seulement, au paquet B) : chaque accusé dû est tenté une fois, sous verrou de ligne (deux tours concurrents
 * ne l'envoient pas deux fois, T04). En mode « gardés », la file n'a rien à faire et aucun transport n'est appelé.
 */
export async function drainAcknowledgements(pool: Pool, transport: MailTransport, now: Date = new Date(), sender: { name: string; address: string } | null = null): Promise<{ sent: number; refused: number; retried: number; abandoned: number }> {
  const result = { sent: 0, refused: 0, retried: 0, abandoned: 0 };
  for (;;) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ id: string; object_ref: string; recipient: string; subject: string; body: string; attempts: number; first_attempt_at: Date | null }>(
        `SELECT id::text, object_ref, recipient, subject, body, attempts, first_attempt_at FROM site_ack_mail
          WHERE state = 'a_envoyer' AND next_attempt_at <= $1 ORDER BY next_attempt_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [now.toISOString()],
      );
      const row = rows[0];
      if (row === undefined) {
        await client.query("COMMIT");
        return result;
      }
      const first = row.first_attempt_at ?? now;
      const answer = await transport.send({ to: row.recipient, subject: row.subject, text: row.body, from: sender }).catch(() => ({ outcome: "failed" as const, code: "TRANSPORT_ERROR" }));
      const attempts = row.attempts + 1;
      if (answer.outcome === "sent") {
        await client.query("UPDATE site_ack_mail SET state = 'envoye', attempts = $2, first_attempt_at = $3, last_attempt_at = $4, next_attempt_at = NULL, sent_at = $4, last_error = NULL WHERE id = $1", [row.id, attempts, first, now]);
        result.sent += 1;
      } else if (answer.outcome === "refused") {
        await client.query("UPDATE site_ack_mail SET state = 'refuse', attempts = $2, first_attempt_at = $3, last_attempt_at = $4, next_attempt_at = NULL, last_error = $5 WHERE id = $1", [row.id, attempts, first, now, answer.code]);
        result.refused += 1;
      } else {
        const next = new Date(now.getTime() + retryDelayMs(attempts));
        const over = next.getTime() > first.getTime() + RETRY_WINDOW_MS;
        await client.query(
          "UPDATE site_ack_mail SET state = $6, attempts = $2, first_attempt_at = $3, last_attempt_at = $4, next_attempt_at = $5, last_error = $7 WHERE id = $1",
          [row.id, attempts, first, now, over ? null : next, over ? "sans_reponse" : "a_envoyer", answer.code],
        );
        if (over) result.abandoned += 1;
        else result.retried += 1;
      }
      await client.query("COMMIT");
      await appendLog(pool, { operation: "ACK_MAIL", outcome: answer.outcome.toUpperCase(), object_ref: row.object_ref, detail: { attempts } });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
