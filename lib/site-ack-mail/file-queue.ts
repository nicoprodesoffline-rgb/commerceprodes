/**
 * B-3 : un tour de la file en mode « fichier ». L'accusé dû est écrit en .eml dans le dossier d'essai ; aucun transport, aucun socket, rien ne sort.
 * Dû : l'échéance d'attente du PDF est passée, ou le PDF déposé par la Factory est arrivé avant (attente non nulle) ; une seule fois par demande.
 * Sous verrou de ligne (deux tours concurrents n'écrivent pas deux fois). Une erreur d'écriture suit la reprise de la file (1, 5, 30 min, puis chaque heure pendant 48 h).
 * Aucune coordonnée dans les journaux : la référence, le numéro et l'état seulement.
 */
import type { Pool } from "pg";
import { appendLog } from "../site-transactions/common";
import { retryDelayMs, RETRY_WINDOW_MS } from "./ack";
import { ackMailConfig } from "./config";
import { writeAcknowledgementFile } from "./file";

type Due = {
  id: string; object_ref: string; number: string; recipient: string; subject: string; body: string; attempts: number;
  first_attempt_at: Date | null; created_at: Date; sender: { name: string; address: string } | null; pdf: Buffer | null; wait_zero: boolean;
};

export async function drainFileAcknowledgements(pool: Pool, now: Date = new Date()): Promise<{ written: number; retried: number; abandoned: number }> {
  const result = { written: 0, retried: 0, abandoned: 0 };
  const config = ackMailConfig();
  if (config.mode !== "fichier" || config.directory === null) return result;
  for (;;) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<Due>(
        `SELECT a.id::text AS id, a.object_ref, a.number, a.recipient, a.subject, a.body, a.attempts, a.first_attempt_at, a.created_at, a.sender,
                COALESCE(q.document_pdf, o.document_pdf) AS pdf, (a.pdf_wait_until IS NULL OR a.pdf_wait_until <= a.created_at) AS wait_zero
           FROM site_ack_mail a
           LEFT JOIN site_quote_request q ON a.event_type = 'quote.requested' AND q.quote_ref = a.object_ref
           LEFT JOIN site_order o ON a.event_type = 'order.received' AND o.order_ref = a.object_ref
          WHERE a.mode = 'fichier' AND a.state = 'a_envoyer' AND a.erased_at IS NULL
            AND (a.next_attempt_at <= $1
                 OR (a.attempts = 0 AND COALESCE(q.document_pdf, o.document_pdf) IS NOT NULL AND a.pdf_wait_until > a.created_at))
          ORDER BY a.next_attempt_at, a.id LIMIT 1 FOR UPDATE OF a SKIP LOCKED`,
        [now.toISOString()],
      );
      const row = rows[0];
      if (row === undefined) {
        await client.query("COMMIT");
        return result;
      }
      const first = row.first_attempt_at ?? now;
      const attempts = row.attempts + 1;
      try {
        await writeAcknowledgementFile({
          directory: config.directory, number: row.number, createdAt: row.created_at, to: row.recipient, from: row.sender, replyTo: null,
          subject: row.subject, text: row.body, pdf: row.wait_zero ? null : row.pdf,
        });
        await client.query(
          "UPDATE site_ack_mail SET state = 'ecrit_fichier', attempts = $2, first_attempt_at = $3, last_attempt_at = $4, next_attempt_at = NULL, sent_at = NULL, last_error = NULL WHERE id = $1",
          [row.id, attempts, first, now],
        );
        result.written += 1;
      } catch {
        const next = new Date(now.getTime() + retryDelayMs(attempts));
        const over = next.getTime() > first.getTime() + RETRY_WINDOW_MS;
        await client.query(
          "UPDATE site_ack_mail SET state = $6, attempts = $2, first_attempt_at = $3, last_attempt_at = $4, next_attempt_at = $5, last_error = 'FILE_WRITE_FAILED' WHERE id = $1",
          [row.id, attempts, first, now, over ? null : next, over ? "sans_reponse" : "a_envoyer"],
        );
        if (over) result.abandoned += 1;
        else result.retried += 1;
      }
      await client.query("COMMIT");
      await appendLog(pool, { operation: "ACK_MAIL", outcome: "FILE", object_ref: row.object_ref, detail: { attempts } });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
