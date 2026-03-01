/**
 * lib/admin/fetch.ts
 * Helper côté client pour les appels API admin.
 * - Envoie les cookies `admin_session` automatiquement (same-origin)
 * - Ajoute Bearer si un mot de passe est disponible (legacy / compatibilité)
 * - Ne plante pas si sessionStorage est vide — le cookie suffit
 */

/** Lit le mot de passe admin depuis sessionStorage (peut être vide). */
export function getAdminPassword(): string {
  if (typeof window === "undefined") return "";
  return (
    sessionStorage.getItem("admin_password") ??
    sessionStorage.getItem("admin_password_cache") ??
    ""
  );
}

/** Options par défaut pour un fetch admin API. */
export function adminFetchOptions(
  extra: RequestInit = {},
  password?: string,
): RequestInit {
  const pw = password ?? getAdminPassword();
  const headers: Record<string, string> = {
    ...(extra.headers as Record<string, string>),
  };
  if (pw) {
    headers["Authorization"] = `Bearer ${pw}`;
  }
  return {
    ...extra,
    credentials: "include", // envoie le cookie admin_session
    headers,
  };
}

/** Fetch admin avec credentials automatiques. */
export async function adminFetch(
  url: string,
  init: RequestInit = {},
  password?: string,
): Promise<Response> {
  return fetch(url, adminFetchOptions(init, password));
}
