/**
 * Registre des documents ACTIVE VÉRIFIÉS (W6-P). Un objet n'y entre que par `markVerified`, appelé par
 * `lib/site-db/generation.ts` APRÈS la vérification complète (forme canonique + SHA-256) et le gel profond :
 * c'est ce qui autorise à réutiliser une `Generation` C0 construite une fois pour cet objet. Tout autre document
 * (fixture, test, objet fabriqué) n'y figure pas et repasse par `selectPrice` (construction à chaque appel).
 * Module sans dépendance : importable depuis les routes sans tirer `pg`.
 */
const verified = new WeakSet<object>();

export function markVerified(doc: object): void {
  verified.add(doc);
}

export function isVerified(doc: unknown): doc is object {
  return typeof doc === "object" && doc !== null && verified.has(doc);
}
