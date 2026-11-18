import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { EditablePage, publishedAt } from "@/components/content/published-page";

export const metadata: Metadata = { title: "Politique de confidentialité", robots: { index: false, follow: false } };

/** Cercle 5, 5.14 : la politique de confidentialité, page éditable comme les autres (contenu v2) ; texte d'attente tant que le propriétaire n'a pas fourni le sien. */
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const edited = await publishedAt("/confidentialite");
  if (edited) return <EditablePage page={edited} />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Politique de confidentialité" }]} />
      <h1 className="text-2xl font-semibold">Politique de confidentialité</h1>
      <p role="note" className="rounded-[14px] border border-caution bg-white p-5 text-ink-2" data-testid="privacy-provisional">
        Texte d&apos;attente : la politique de confidentialité (données recueillies, durée de conservation, droits) sera publiée ici avant l&apos;ouverture au public. Cette page n&apos;en contient pas encore.
      </p>
    </div>
  );
}
