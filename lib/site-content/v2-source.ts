// Cercle 3 (3.2) — les contenus v2 ACTIFS lus en base, ou null (aucun contenu reçu, base injoignable, état altéré : le SITE retombe alors sur ce qu'il savait faire avant).
import { getPool } from "@/lib/site-db/pool";
import { readActiveContentCached } from "@/lib/site-publish/content";

export async function getActiveContentV2(): Promise<Record<string, any> | null> {
  try {
    return (await readActiveContentCached(getPool()))?.content ?? null;
  } catch {
    return null;
  }
}
