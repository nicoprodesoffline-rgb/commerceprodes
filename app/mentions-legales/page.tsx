import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";

// Provisoire : page exclue des moteurs de recherche tant que son contenu n'est pas validé.
export const metadata: Metadata = { title: "Mentions légales", robots: { index: false, follow: false } };

/**
 * Mentions légales PROVISOIRES (V-E15) : l'ancienne page n'était pas terminée (identifiant d'entreprise « à compléter », hébergeur d'un service aujourd'hui fermé).
 * Elle n'est pas reprise : écrire ici une identité, un hébergeur ou une politique de cookies non validés serait une affirmation fausse. Le contenu juridique est
 * fourni par le propriétaire et piloté depuis la Factory (S4) avant toute ouverture au public.
 */
export default function LegalNoticePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Mentions légales" }]} />
      <h1 className="text-2xl font-semibold">Mentions légales</h1>
      <p role="note" className="rounded-[14px] border border-caution bg-white p-5 text-ink-2" data-testid="legal-provisional">
        Les mentions légales (éditeur, hébergement, données personnelles, cookies) seront publiées ici avant l&apos;ouverture au public. Cette page n&apos;en contient pas encore.
      </p>
    </div>
  );
}
