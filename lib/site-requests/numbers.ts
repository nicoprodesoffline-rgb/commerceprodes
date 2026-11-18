/**
 * Cercle 5, ligne 5.9 : le numéro lisible d'une demande, `DEV-2026-000123`, `CMD-2026-000123` ou `MSG-2026-000123` (docs/contracts/site_events_v2.md §3.1).
 * Attribué par le SITE dans la transaction de la demande : un compteur par (préfixe, année), consécutif ; la référence longue reste l'identifiant technique.
 */
export const NUMBER_PREFIXES = { quote_request: "DEV", order: "CMD", message: "MSG" } as const;
export type RequestKind = keyof typeof NUMBER_PREFIXES;

export const NUMBER_FORMAT = /^(DEV|CMD|MSG)-\d{4}-\d{6}$/;

export const formatNumber = (kind: RequestKind, year: number, sequence: number): string => `${NUMBER_PREFIXES[kind]}-${String(year).padStart(4, "0")}-${String(sequence).padStart(6, "0")}`;

/** L'année du numéro : celle de l'instant UTC de la demande (« 2026-11-18T10:00:00Z » → 2026). */
export const yearOf = (instantUtc: string): number => Number(instantUtc.slice(0, 4));
