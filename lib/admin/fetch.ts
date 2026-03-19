/**
 * Client-side admin fetch helper.
 * Reads the admin password from sessionStorage and adds the Bearer header.
 */
export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const password =
    (typeof window !== "undefined"
      ? sessionStorage.getItem("admin_password_cache") ?? sessionStorage.getItem("admin_password")
      : null) ?? "";

  const headers = new Headers(options.headers as HeadersInit | undefined);
  headers.set("Authorization", `Bearer ${password}`);
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, { ...options, headers });
}
