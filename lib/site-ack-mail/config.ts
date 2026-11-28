import { realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

export type AckMode = "garde" | "fichier" | "smtp";
export class AckMailConfigError extends Error {
  readonly code = "ACK_MAIL_CONFIG_INVALID";
}

export function ackMailMode(env: Record<string, string | undefined> = process.env): AckMode {
  const raw = env["SITE_ACK_MAIL_MODE"];
  if (raw === undefined || raw === "" || raw === "garde") return "garde";
  if (raw === "fichier") return "fichier";
  if (raw === "smtp") throw new AckMailConfigError("SITE_ACK_MAIL_MODE=smtp : l'envoi réel n'est pas livré (paquet B) ; seul le mode « garde » est actif");
  throw new AckMailConfigError(`SITE_ACK_MAIL_MODE inconnu ${JSON.stringify(raw)} ; doit être absente ou « garde », ou « fichier »`);
}

/** Chemin absolu privé, y compris derrière un lien symbolique et pour un dossier encore absent. */
export function privateAckDirectory(raw: string | undefined): string {
  if (!raw || !isAbsolute(raw)) throw new AckMailConfigError("SITE_ACK_MAIL_DIR obligatoire en mode fichier : chemin absolu privé attendu");
  const path = resolve(raw);
  const publicPath = (s: string): boolean => s.split(sep).some((part) => part === "public" || part === ".next");
  if (publicPath(path)) throw new AckMailConfigError("SITE_ACK_MAIL_DIR interdit sous public/ ou .next/");
  let parent = path;
  const missing: string[] = [];
  for (;;) {
    try {
      const real = realpathSync(parent);
      if (!statSync(real).isDirectory()) throw new Error("not a directory");
      if (publicPath(join(real, ...missing))) throw new AckMailConfigError("SITE_ACK_MAIL_DIR interdit sous public/ ou .next/ (lien symbolique)");
      return path;
    } catch (error) {
      if (error instanceof AckMailConfigError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(parent) === parent) {
        throw new AckMailConfigError("SITE_ACK_MAIL_DIR illisible ou invalide");
      }
      missing.unshift(basename(parent));
      parent = dirname(parent);
    }
  }
}

export type AckMailConfig = { mode: AckMode; directory: string | null; pdfWaitMinutes: number };
export function ackMailConfig(env: Record<string, string | undefined> = process.env): AckMailConfig {
  const mode = ackMailMode(env);
  const raw = env["SITE_ACK_PDF_WAIT_MINUTES"];
  const wait = raw === undefined ? 15 : /^(0|[1-9][0-9]{0,2})$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(wait) || wait > 120) throw new AckMailConfigError("SITE_ACK_PDF_WAIT_MINUTES doit être un entier de 0 à 120");
  return { mode, directory: mode === "fichier" ? privateAckDirectory(env["SITE_ACK_MAIL_DIR"]) : null, pdfWaitMinutes: wait };
}

/** Même arrêt explicite que la politique de démarrage du receiver ; aucun accès SMTP. */
export function enforceAckMailStartup(
  env: Record<string, string | undefined> = process.env,
  log: (message: string) => void = (message) => console.error(message),
  exit: (code: number) => void = (code) => process.exit(code),
): boolean {
  try { ackMailConfig(env); return true; }
  catch (error) {
    if (!(error instanceof AckMailConfigError)) throw error;
    log(`[site-ack-mail] DÉMARRAGE REFUSÉ : ${error.message}`);
    exit(1);
    return false;
  }
}
