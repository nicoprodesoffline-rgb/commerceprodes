/**
 * Pool PostgreSQL de la base SITE (BC2). Contrat : docs/SITE_DB_SCHEMA.md.
 *
 * - Connexion UNIQUEMENT par `SITE_DATABASE_URL` : aucune valeur par défaut.
 * - Garde-fou : la base doit s'appeler `prodes_site*` (jamais une base Factory, jamais JARVIS).
 * - Le pool est un singleton de processus (globalThis, pour survivre au rechargement de Next en dev) ;
 *   il ne met en cache AUCUNE donnée : la génération ACTIVE est relue en base à chaque appel.
 */
import { Pool, type Client, type PoolClient } from "pg";

export class SiteDbConfigError extends Error {
  readonly code = "SITE_DB_CONFIG_INVALID";
}

/** Tout ce qui sait exécuter une requête : Pool, PoolClient ou Client. */
export type Queryable = Pool | PoolClient | Client;

const DB_NAME_RE = /^prodes_site[a-z0-9_]*$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
/** Paramètres de requête qui changeraient la cible réelle de pg (hôte, base, options serveur) : toujours refusés. */
const FORBIDDEN_PARAMS = ["host", "hostaddr", "options", "dbname", "database", "service", "servicefile"];

/**
 * Valide une URL SITE et renvoie le nom de la base (review F-04) :
 * - base `prodes_site*` seulement (jamais une base Factory) ;
 * - hôte `localhost` / `127.0.0.1` / `::1` seulement, sauf `SITE_ALLOW_REMOTE_DB=1` explicite ;
 * - `jarvis` (quel que soit le suffixe) toujours refusé, même avec `SITE_ALLOW_REMOTE_DB=1` ;
 * - paramètres `host`, `hostaddr`, `options`, `dbname`, `database`, `service`, `servicefile` refusés.
 */
export function siteDatabaseName(url: string, env: Record<string, string | undefined> = process.env): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SiteDbConfigError("SITE_DATABASE_URL n'est pas une URL");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new SiteDbConfigError("SITE_DATABASE_URL doit être postgres://");
  for (const key of parsed.searchParams.keys()) {
    if (FORBIDDEN_PARAMS.includes(key.toLowerCase())) throw new SiteDbConfigError(`paramètre '${key}' refusé dans SITE_DATABASE_URL`);
  }
  const host = decodeURIComponent(parsed.hostname).toLowerCase();
  if (host === "" || /(^|\.)jarvis($|\.)/.test(host) || host.startsWith("jarvis")) throw new SiteDbConfigError("hôte de base refusé (jamais JARVIS, hôte explicite obligatoire)");
  if (!LOCAL_HOSTS.has(host) && env["SITE_ALLOW_REMOTE_DB"] !== "1") {
    throw new SiteDbConfigError("hôte de base non local refusé (SITE_ALLOW_REMOTE_DB=1 requis)");
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!DB_NAME_RE.test(name)) throw new SiteDbConfigError(`base '${name}' refusée : seules les bases prodes_site* sont admises`);
  return name;
}

export function siteDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env["SITE_DATABASE_URL"];
  if (url === undefined || url === "") throw new SiteDbConfigError("SITE_DATABASE_URL absente (aucune valeur par défaut)");
  siteDatabaseName(url, env);
  return url;
}

/** Pool dédié (tests, outils). L'appelant le ferme. */
export function createPool(url: string, max = 10): Pool {
  siteDatabaseName(url);
  const pool = new Pool({ connectionString: url, max });
  // Erreur d'un client inactif (redémarrage PostgreSQL, connexion tuée) : le client est retiré du pool ;
  // sans écouteur, Node arrêterait le processus. Aucune donnée n'est journalisée ici.
  pool.on("error", (error: unknown) => {
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "ERROR";
    console.error(`[site-db] client inactif en erreur code=${code}`);
  });
  return pool;
}

const GLOBAL_KEY = Symbol.for("prodes.site-db.pool");
type GlobalWithPool = typeof globalThis & { [GLOBAL_KEY]?: Pool };

/** Pool partagé du processus, construit à la première demande depuis SITE_DATABASE_URL. */
export function getPool(): Pool {
  const g = globalThis as GlobalWithPool;
  let pool = g[GLOBAL_KEY];
  if (pool === undefined) {
    pool = createPool(siteDatabaseUrl());
    g[GLOBAL_KEY] = pool;
  }
  return pool;
}

/** Exécute `fn` dans une transaction (BEGIN … COMMIT, ROLLBACK sur exception). */
export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  // Connexion coupée pendant la transaction : pg émet `error` sur le client emprunté ; sans écouteur, Node
  // arrêterait le processus. L'erreur remonte par la requête en cours (rejet), PostgreSQL annule la transaction.
  const onClientError = (): void => undefined;
  client.on("error", onClientError);
  let broken = false;
  try {
    await client.query("BEGIN");
    try {
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (error) {
      broken = true;
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  } catch (error) {
    broken = true;
    throw error;
  } finally {
    client.removeListener("error", onClientError);
    client.release(broken);
  }
}
