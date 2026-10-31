/** Réponse JSON de lecture dont les chevrons et l'esperluette sont échappés (\u003c…) : elle ne peut jamais être lue comme du HTML, même injectée dans une page. */
export function escapedJson(body: unknown, status = 200): Response {
  const text = JSON.stringify(body).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return new Response(text, { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
