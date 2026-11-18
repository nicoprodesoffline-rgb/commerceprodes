import Link from "next/link";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { activeAnnouncement, type ShopSettings } from "@/lib/site-shop/settings";

/** Cercle 3, 3.23 : le bandeau d'annonce de la boutique, entre son début et sa fin ; absent sinon. Le texte est affiché comme du texte (React l'échappe). */
export function AnnouncementBanner({ shop }: { shop: ShopSettings }) {
  const banner = activeAnnouncement(shop, new Date(serverNowUtc()));
  if (!banner) return null;
  return (
    <div className="bg-brand-subtle text-center text-sm text-brand" role="status" data-testid="announcement-banner">
      <div className="mx-auto flex max-w-[1440px] items-center justify-center gap-3 px-4 py-2 lg:px-8">
        <p>{banner.text}</p>
        {banner.link && <Link href={banner.link} className="inline-flex min-h-11 items-center underline underline-offset-4">En savoir plus</Link>}
      </div>
    </div>
  );
}
