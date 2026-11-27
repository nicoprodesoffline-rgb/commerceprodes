import type { Pool } from "pg";
import { fingerprint, sourceFingerprint, matchesRetained, type RetainedMetadata, type PdfInput } from "./model";
import { buildFamilyPdf, type PdfResult } from "./render";

export const PURGE_BATCH_SIZE = 100;

/** Sans la Factory ni ordonnanceur : au plus 100 lignes échues par demande PDF. Une ligne valide n'est jamais supprimée. */
export async function purgeExpiredPdfs(pool: Pool): Promise<number> {
  const result = await pool.query(`DELETE FROM site_family_pdf WHERE fingerprint IN (
    SELECT fingerprint FROM site_family_pdf WHERE expires_at <= clock_timestamp() ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED
  )`, [PURGE_BATCH_SIZE]);
  return result.rowCount ?? 0;
}

export async function retainedPdf(pool: Pool, input: PdfInput, build: (input: PdfInput) => Promise<PdfResult> = buildFamilyPdf): Promise<Buffer> {
  // L'empreinte source permet de retrouver les photos finalement retenues sans relire leurs octets ni refabriquer.
  const source = sourceFingerprint(input, false);
  const truncatedSource = sourceFingerprint(input, true);
  const client = await pool.connect();
  // Connexion coupée pendant la fabrication : pg émet `error` sur le client emprunté ; sans écouteur, Node arrêterait le processus.
  const onClientError = (): void => undefined;
  client.on("error", onClientError);
  let failed = false;
  try {
    await client.query("BEGIN");
    // Deux demandes identiques, même sur deux connexions : une fabrication ; aucun buffer de PDF en mémoire globale.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [fingerprint(input, [])]);
    // Les métadonnées seules : ne jamais charger plusieurs PDF dans le processus pour chercher une correspondance.
    const { rows } = await client.query<RetainedMetadata>(
      "SELECT fingerprint, source_fingerprint, photo_shas FROM site_family_pdf WHERE family_key = $1 AND source_fingerprint = ANY($2::text[]) AND expires_at > clock_timestamp() ORDER BY created_at DESC", [input.familyKey, [source, truncatedSource]],
    );
    const hit = rows.find(row => matchesRetained(input, row));
    if (hit) {
      const kept = await client.query<{ pdf_bytes: Buffer }>("SELECT pdf_bytes FROM site_family_pdf WHERE fingerprint = $1 AND expires_at > clock_timestamp()", [hit.fingerprint]);
      if (kept.rows[0]) {
        await client.query("COMMIT");
        return kept.rows[0].pdf_bytes;
      }
    }
    const result = await build(input);
    for (const skip of result.skipped) console.warn(`[site-pdf] ${skip.code} sha256=${skip.sha256}`);
    // Un média manquant ou endommagé est retenté à la prochaine demande, sans conserver une fiche incomplète.
    if (result.skipped.some(s => s.code === "MEDIA_MISSING" || s.code === "IMAGE_SKIPPED")) {
      await client.query("COMMIT");
      return result.bytes;
    }
    const key = fingerprint(input, result.photoShas);
    const retainedSource = result.skipped.some(s => s.code === "SIZE_SKIPPED") ? truncatedSource : source;
    await client.query(`INSERT INTO site_family_pdf (family_key, fingerprint, source_fingerprint, photo_shas, pdf_bytes, expires_at)
      VALUES ($1,$2,$3,$4::jsonb,$5,clock_timestamp() + make_interval(days => $6))
      ON CONFLICT (fingerprint) DO UPDATE SET source_fingerprint = EXCLUDED.source_fingerprint, photo_shas = EXCLUDED.photo_shas,
        pdf_bytes = EXCLUDED.pdf_bytes, created_at = clock_timestamp(), expires_at = EXCLUDED.expires_at`,
    [input.familyKey, key, retainedSource, JSON.stringify(result.photoShas), result.bytes, input.layout.retention_days]);
    await client.query("COMMIT");
    return result.bytes;
  } catch (error) {
    failed = true;
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.removeListener("error", onClientError);
    client.release(failed ? true : undefined);
  }
}
