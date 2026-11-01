/** Trace serveur limitée aux routes fixes, statuts et codes ; jamais de corps de requête ni d'adresse complète. */
export type BusinessRoute = "/api/site/quote" | "/api/site/order" | "/api/site/cart/preview" | "/api/site/receipt";

export function logRefusal(route: BusinessRoute, status: number, body: unknown): void {
  const response = body as { error_codes?: unknown; verdict?: { error_codes?: unknown } | null; site_status?: unknown } | null;
  const raw = Array.isArray(response?.error_codes) && response.error_codes.length > 0
    ? response.error_codes
    : response?.verdict?.error_codes;
  const codes = Array.isArray(raw) ? raw.filter((code): code is string => typeof code === "string") : [];
  if (codes.length === 0 && typeof response?.site_status === "string") codes.push(response.site_status);
  if (codes.length === 0 && status >= 400) codes.push("TRANSPORT_ERROR");
  if (codes.length > 0) console.warn("[prodes-site] refusal", JSON.stringify({ route, status, codes }));
}
