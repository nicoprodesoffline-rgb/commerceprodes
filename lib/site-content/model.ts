export type Section =
  | { type: "hero"; data: { title: string; text?: string; link?: string } }
  | { type: "category_grid"; data: { categories: string[]; title?: string } }
  | { type: "product_carousel"; data: { families: string[]; title?: string } }
  | { type: "text_image"; data: { text: string; media_sha: string; title?: string } };

export type EditorialPage = {
  key: string;
  slug: string;
  title: string;
  revision: number;
  seo_title: string;
  seo_description: string;
  canonical: string;
  sections: Section[];
};

export type EditorialSet = { generation: number; publicationId: string; pages: EditorialPage[] };
export type CatalogRefs = {
  categoryKeys: ReadonlySet<string>;
  familyKeys: ReadonlySet<string>;
  mediaShas: ReadonlySet<string>;
  /** Empreinte du catalogue servi, incluse dans la clé du cache de transport. */
  catalogSha256?: string;
};
