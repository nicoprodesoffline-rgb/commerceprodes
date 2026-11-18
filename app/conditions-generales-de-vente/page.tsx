import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { EditablePage, publishedAt } from "@/components/content/published-page";

// Provisoire : page exclue des moteurs de recherche tant que son texte n'est pas celui du propriétaire.
export const metadata: Metadata = { title: "Conditions générales de vente", robots: { index: false, follow: false } };

/**
 * Cercle 5, 5.14 : les conditions générales de vente, page éditable comme les autres (contenu v2). Tant que le propriétaire n'a pas fourni le texte, un texte d'attente, écrit comme tel :
 * rien de juridique n'est inventé ici. La version acceptée à la commande est celle des réglages de vente (`cgv_version`).
 */
export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const edited = await publishedAt("/conditions-generales-de-vente");
  if (edited) return <EditablePage page={edited} />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Conditions générales de vente" }]} />
      <h1 className="text-2xl font-semibold">Conditions générales de vente</h1>
      <p role="note" className="rounded-[14px] border border-caution bg-white p-5 text-ink-2" data-testid="terms-provisional">
        Texte d&apos;attente : les conditions générales de vente seront publiées ici avant l&apos;ouverture au public. Cette page n&apos;en contient pas encore.
      </p>
    </div>
  );
}
