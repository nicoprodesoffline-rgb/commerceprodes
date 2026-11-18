import type { Metadata } from "next";
import { EditablePage, requirePublished } from "@/components/content/published-page";
import { editorialMetadata } from "@/lib/site-content/metadata";

export const dynamic = "force-dynamic";

/** Cercle 3, 3.24 : page « Livraison », éditable depuis la Factory ; elle n'existe que publiée (aucun texte inventé ici). */
export async function generateMetadata(): Promise<Metadata> {
  return editorialMetadata(await requirePublished("/livraison"), process.env.SITE_PUBLIC_ORIGIN);
}

export default async function DeliveryPage() {
  return <EditablePage page={await requirePublished("/livraison")} />;
}
