import type { Pool, PoolClient } from "pg";
import { METRICS, MAX_BYTES, parisDay, previousDay, type Batch, type Metric, type MetricRow } from "./core";
type Database = Pick<Pool | PoolClient, "query">;
/** Le jour de Paris est calculé dans l'instruction d'écriture ; l'instant injecté est réservé aux tests/démos. */
async function incrementKeys(db: Database, keys: readonly string[], metric: Metric, now?: () => Date): Promise<void> {
  if (!METRICS.includes(metric)) throw new Error("METRIC_INVALID");
  const instant = now?.().toISOString() ?? null;
  await db.query(
    `INSERT INTO site_product_metrics_daily (day, public_item_key, ${metric})
     SELECT (COALESCE($1::timestamptz, statement_timestamp()) AT TIME ZONE 'Europe/Paris')::date, key, 1
     FROM unnest($2::text[]) AS product(key)
     ON CONFLICT (day, public_item_key) DO UPDATE SET ${metric} = site_product_metrics_daily.${metric} + 1`,
    [instant, [...new Set(keys)]],
  );
}
export async function increment(db: Database, key: string, metric: Metric, now?: () => Date): Promise<void> {
  await incrementKeys(db, [key], metric, now);
}
/** Une seule lecture d'horloge et une seule instruction pour tous les produits distincts du devis. */
export async function countQuoteSubmit(db: Database, keys: readonly string[], now?: () => Date): Promise<void> {
  await incrementKeys(db, keys, "quote_submit", now);
}
/** Une requête groupée sur la fenêtre demandée ; jamais de chargement de l'historique en mémoire du site.
 * Le budget JSON PostgreSQL (avec ses espaces) majore les octets JSON servis ; 256 octets réservés à l'enveloppe.
 * Un premier jour qui ne tient pas refuse la lecture : ne jamais avancer le curseur en perdant un jour.
 */
export async function readBatch(db: Database, depuis: string, now: Date, keys: ReadonlySet<string>, removed: (count: number) => void = (count) => console.warn(`[site-metrics] catalogue_absent lignes=${count}`)): Promise<Batch> {
  const yesterday = previousDay(parisDay(now));
  const { rows } = await db.query<{ row: MetricRow | null; up_to: string | null; removed: number }>(`
    WITH window_rows AS MATERIALIZED (
      SELECT day, public_item_key, views, add_to_cart, quote_start, quote_submit,
             public_item_key = ANY($3::text[]) AS known
      FROM site_product_metrics_daily WHERE day >= $1::date AND day <= $2::date
    ), encoded AS (
      SELECT day, json_build_object('date', day::text, 'public_item_key', public_item_key,
        'views', views, 'add_to_cart', add_to_cart, 'quote_start', quote_start, 'quote_submit', quote_submit) AS row,
        public_item_key FROM window_rows WHERE known
    ), days AS (
      SELECT day, count(*) AS n, sum(octet_length(row::text) + 1) AS bytes FROM encoded GROUP BY day
    ), budgets AS (
      SELECT day, sum(n) OVER (ORDER BY day) AS n, sum(bytes) OVER (ORDER BY day) AS bytes FROM days
    ), cutoff AS (
      SELECT min(day) FILTER (WHERE n > 5000 OR bytes > $4) AS blocked FROM budgets
    ), meta AS (
      SELECT CASE WHEN blocked IS NULL THEN $2::date ELSE blocked - 1 END AS up_to,
        (SELECT count(*)::int FROM window_rows WHERE NOT known) AS removed,
        blocked IS NOT NULL AND NOT EXISTS (SELECT 1 FROM days WHERE day < blocked) AS impossible FROM cutoff
    ), selected AS (
      SELECT row FROM encoded, meta WHERE day <= meta.up_to ORDER BY day, public_item_key COLLATE "C" LIMIT 5000
    ) SELECT selected.row, CASE WHEN impossible THEN NULL ELSE up_to::text END AS up_to, removed
      FROM meta LEFT JOIN selected ON true ORDER BY selected.row->>'date', (selected.row->>'public_item_key') COLLATE "C"`, [depuis, yesterday, [...keys], MAX_BYTES - 256]);
  const meta = rows[0]!;
  if (meta.removed > 0) removed(meta.removed);
  if (meta.up_to === null) throw new Error("DAY_CAPACITY");
  const batch: Batch = { contract_version: "product_metrics_daily.v2", up_to: meta.up_to, rows: rows.flatMap((r) => r.row === null ? [] : [r.row]) };
  if (Buffer.byteLength(JSON.stringify(batch)) > MAX_BYTES) throw new Error("BATCH_CAPACITY");
  return batch;
}
