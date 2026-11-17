// Cercle 3 (3.2, 3.24, 3.27) — les contenus v2 (`site_content.v2`) vus comme l'ensemble éditorial que le SITE sait afficher. Fonction PURE : le document a déjà été accepté
// (forme, références, empreinte, signature) à sa réception et relu à l'identique en base ; ici on ne fait que le mettre à la forme des composants.
import type { EditorialPage, EditorialSet, MerchandisingRelation, Section } from "./model";

type Obj = Record<string, any>;
const clean = <T extends Obj>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null)) as T;

function section(raw: Obj): Section {
  const data: Obj = raw.data ?? {};
  switch (raw.type) {
    case "hero": return { type: "hero", data: clean({ title: data.title, text: data.text, link: data.link, linkLabel: data.link_label, imageSha: data.image_sha256 }) as Extract<Section, { type: "hero" }>["data"] };
    case "text_image": return { type: "text_image", data: clean({ title: data.title, text: data.text, media_sha: data.media_sha, imageAlt: data.image_alt }) as Extract<Section, { type: "text_image" }>["data"] };
    case "faq": return { type: "faq", data: clean({ title: data.title, questions: data.questions }) as Extract<Section, { type: "faq" }>["data"] };
    case "rich_text": return { type: "rich_text", data: clean({ title: data.title, text: data.text }) as Extract<Section, { type: "rich_text" }>["data"] };
    default: return raw as Section;   // category_grid, product_carousel : mêmes clés qu'en v1
  }
}

/** Une page de `site_content.v2` à la forme des composants (aussi pour l'aperçu d'une page en brouillon). */
export function pageFromV2(page: Obj): EditorialPage {
  return {
    key: page.key, slug: page.slug, title: page.title, revision: page.revision,
    nav: { showInBar: page.nav.show_in_bar, order: page.nav.order },
    seo_title: page.seo_title ?? "", seo_description: page.seo_description ?? "", canonical: page.canonical ?? "",
    sections: (page.sections as Obj[]).map(section),
  };
}

export function editorialFromV2(doc: Obj): EditorialSet {
  const pages: EditorialPage[] = (doc.pages as Obj[]).map(pageFromV2);
  const merchandising: MerchandisingRelation[] = (doc.relations as Obj[]).map((r) => ({ source: r.source, target: r.target, kind: r.kind, order: r.order }));
  return { generation: doc.content_sequence, publicationId: doc.publication_id, pages, merchandising };
}

/** Les trois objets de boutique du document, tels que `parseShop` les lit. */
export function shopObjectsFromV2(doc: Obj): { shop: unknown; announcement: unknown; maintenance: unknown } {
  return { shop: doc.shop, announcement: doc.announcement, maintenance: doc.maintenance };
}

/** Les redirections des anciennes adresses (3.17) : de l'adresse ancienne vers sa cible. */
export function redirectsFromV2(doc: Obj): Map<string, { to: string; status: 301 | 308 }> {
  return new Map((doc.redirects as Obj[]).map((r) => [r.from_path as string, { to: r.to_path as string, status: r.status as 301 | 308 }]));
}
