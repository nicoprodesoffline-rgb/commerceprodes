"use client";

/**
 * Cercle 4, 4.14 — dernière page d'erreur : elle remplace TOUT le gabarit quand même celui-ci a échoué. Texte simple, aucune trace technique, aucun message d'erreur ni identifiant
 * interne (jamais `error.message` ni `error.digest`). Les erreurs de page courantes restent traitées par `app/error.tsx`.
 */
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="fr">
      <head>
        <meta name="robots" content="noindex" />
        <title>Site momentanément indisponible | PRODES</title>
      </head>
      <body style={{ margin: 0, font: '16px/1.5 system-ui,-apple-system,"Segoe UI",Arial,sans-serif', background: "#FBFBFA", color: "#1A1A18" }}>
        <main data-testid="global-error" style={{ maxWidth: "40rem", margin: "0 auto", padding: "4rem 1rem" }}>
          <p style={{ fontWeight: 700, letterSpacing: ".08em" }}>PRODES</p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 .75rem" }}>Site momentanément indisponible</h1>
          <p style={{ color: "#55554F" }}>Un incident empêche d&apos;afficher cette page. Réessayez dans quelques minutes.</p>
          <button type="button" onClick={reset} style={{ marginTop: "1rem", minHeight: 42, padding: "0 1rem", border: "1px solid #D6D6D1", borderRadius: 9, background: "#fff", font: "inherit", cursor: "pointer" }}>Réessayer</button>
        </main>
      </body>
    </html>
  );
}
