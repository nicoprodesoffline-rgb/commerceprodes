import type { CatalogRefs, EditorialPage, EditorialSet, MerchandisingRelation, Section } from "./model";

type Failure = { ok: false; code: string; detail: string };
export type Validation = { ok: true; set: EditorialSet } | Failure;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = /^\/(?:[a-z0-9_-]+(?:\/[a-z0-9_-]+)*)?$/;
const SHA = /^[0-9a-f]{64}$/;
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/;
// Un champ texte accepte le saut de ligne et le retour chariot : un formulaire HTML envoie « \r\n » (réel : constaté sur un export de la Factory) ; tout autre contrôle est refusé.
const TEXT_CONTROLS = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const lf = (v: string) => v.replace(/\r\n?/g, "\n");
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const string = (v: unknown, min: number, max: number, multiline = false): v is string => {
  if (typeof v !== "string" || (multiline ? TEXT_CONTROLS : CONTROLS).test(v)) return false;
  // Le producteur Python borne des caractères Unicode, pas des unités UTF-16.
  const length = Array.from(v).length;
  return length >= min && length <= max;
};
const localPath = (v: unknown): v is string => string(v, 1, 200) && PATH.test(v);
const keysOnly = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(k => keys.includes(k));
const failure = (code: string, detail: string): Failure => ({ ok: false, code, detail });
const familyKey = (v: unknown): v is string => typeof v === "string" && v.length === 12 && /^PF-[0-9A-HJKMNP-TV-Z]{9}$/.test(v);
const binary = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function merchandising(value: unknown): MerchandisingRelation[] | Failure {
  if (!Array.isArray(value) || value.length === 0) return failure("MERCHANDISING_FIELD", "Liste de relations non vide exigée");
  const rows: MerchandisingRelation[] = [];
  const pairs = new Set<string>();
  const orders = new Map<string, number>();
  for (const row of value) {
    if (!object(row) || Object.keys(row).length !== 4 || !keysOnly(row, ["source", "target", "kind", "order"]) || !familyKey(row.source) || !familyKey(row.target) || (row.kind !== "LIE" && row.kind !== "COMPLEMENTAIRE" && row.kind !== "UPSELL") || !integer(row.order) || row.order < 1) return failure("MERCHANDISING_FIELD", "Structure de relation invalide");
    const pair = `${row.source}:${row.target}`;
    if (row.source === row.target || pairs.has(pair)) return failure("MERCHANDISING_PAIR", "Relation répétée ou vers elle-même");
    pairs.add(pair);
    const previous = rows.at(-1);
    if (previous && (binary(previous.source, row.source) || binary(previous.kind, row.kind) || previous.order - row.order || binary(previous.target, row.target)) >= 0) return failure("MERCHANDISING_SORT", "Ordre des relations invalide");
    const group = `${row.source}:${row.kind}`;
    if (row.order !== (orders.get(group) ?? 0) + 1) return failure("MERCHANDISING_ORDER", "Ordre de relation non consécutif");
    orders.set(group, row.order);
    rows.push({ source: row.source, target: row.target, kind: row.kind, order: row.order });
  }
  return rows;
}

/** Garde partagée avec le rendu : aucun chemin réseau, séparateur encodé ni contrôle encodé. */
export function isLocalLink(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[:\\\s\u0000-\u001f\u007f-\u009f]/u.test(value)) return false;
  try {
    const decoded = decodeURIComponent(value);
    return !decoded.startsWith("//") && !/[:\\\s\u0000-\u001f\u007f-\u009f]/u.test(decoded) && !/%(?:2f|5c|25|0[0-9a-f]|1[0-9a-f]|7f)/i.test(decoded);
  } catch { return false; }
}

function section(value: unknown, refs: CatalogRefs): Section | Failure {
  if (!object(value) || typeof value.type !== "string" || !["hero", "category_grid", "product_carousel", "text_image"].includes(value.type)) return failure("SECTION_TYPE", "Type de section invalide");
  if (!keysOnly(value, ["type", "data"]) || !object(value.data)) return failure("SECTION_FIELD", "Structure de section invalide");
  const data = value.data;
  const type = value.type;
  const allowed = type === "hero" ? ["title", "text", "link", "link_label"] : type === "category_grid" ? ["title", "categories"] : type === "product_carousel" ? ["title", "families"] : ["title", "text", "media_sha", "image_alt"];
  if (!keysOnly(data, allowed) || (data.title !== undefined && !string(data.title, 1, 200))) return failure("SECTION_FIELD", "Champ de section invalide");
  if (type === "hero") {
    if (!string(data.title, 1, 200) || ("text" in data && !string(data.text, 1, 10000, true))) return failure("SECTION_FIELD", "Texte de bandeau invalide");
    if ("link" in data && !isLocalLink(data.link)) return failure("LINK_NOT_LOCAL", "Lien local exigé");
    if ("link_label" in data && !string(data.link_label, 1, 40)) return failure("SECTION_FIELD", "Libellé de lien invalide");
    return { type, data: { title: data.title, ...(typeof data.text === "string" ? { text: lf(data.text) } : {}), ...(typeof data.link === "string" ? { link: data.link } : {}), ...(typeof data.link_label === "string" ? { linkLabel: data.link_label } : {}) } };
  }
  const title = typeof data.title === "string" ? { title: data.title } : {};
  if (type === "text_image") {
    if (!string(data.text, 1, 10000, true) || !string(data.media_sha, 64, 64) || !SHA.test(data.media_sha)) return failure("SECTION_FIELD", "Texte ou média invalide");
    if (!refs.mediaShas.has(data.media_sha)) return failure("REFERENCE_MISSING", "Média absent du catalogue servi");
    if ("image_alt" in data && !string(data.image_alt, 0, 150)) return failure("SECTION_FIELD", "Texte alternatif invalide");
    return { type, data: { ...title, text: lf(data.text), media_sha: data.media_sha, ...(typeof data.image_alt === "string" ? { imageAlt: data.image_alt } : {}) } };
  }
  const list: unknown = type === "category_grid" ? data.categories : data.families;
  if (!Array.isArray(list) || list.length < 1 || list.length > 24 || !list.every((k): k is string => string(k, 1, Number.MAX_SAFE_INTEGER)) || new Set(list).size !== list.length) return failure("SECTION_FIELD", "Liste de références invalide");
  const available = type === "category_grid" ? refs.categoryKeys : refs.familyKeys;
  if (!list.every(k => available.has(k))) return failure("REFERENCE_MISSING", "Référence absente du catalogue servi");
  return type === "category_grid" ? { type, data: { ...title, categories: [...list] } } : { type: "product_carousel", data: { ...title, families: [...list] } };
}

/** Pur : aucune I/O, aucun import de valeur du dépôt ; rejet du jeu entier au premier défaut. */
export function validateEnvelope(value: unknown, refs: CatalogRefs): Validation {
  if (!object(value)) return failure("ENVELOPE", "Objet enveloppe exigé");
  if (value.contract_version !== "site_content.v1") return failure("CONTRACT_VERSION", "Version de contrat invalide");
  if (!integer(value.generation) || value.generation < 1 || !string(value.publication_id, 36, 36) || !UUID.test(value.publication_id) || !(value.catalogue_sequence === null || integer(value.catalogue_sequence)) || !Array.isArray(value.pages)) return failure("ENVELOPE", "Identité ou liste de pages invalide");
  const relations = "merchandising" in value ? merchandising(value.merchandising) : [];
  if (!Array.isArray(relations)) return relations;
  const pages: EditorialPage[] = [];
  const slugs = new Set<string>();
  for (const page of value.pages) {
    if (!object(page) || !keysOnly(page, ["key", "slug", "title", "revision", "seo_title", "seo_description", "canonical", "sections", "nav"])) return failure("PAGE_FIELD", "Structure de page invalide");
    if (!localPath(page.slug)) return failure("PAGE_SLUG", "Chemin de page invalide");
    if (slugs.has(page.slug)) return failure("PAGE_DUPLICATE_SLUG", "Chemin de page dupliqué");
    slugs.add(page.slug);
    if (!string(page.key, 36, 36) || !UUID.test(page.key) || !string(page.title, 1, 200) || !integer(page.revision) || page.revision < 1 || !string(page.seo_title, 0, 200) || !string(page.seo_description, 0, 1000) || !(page.canonical === "" || localPath(page.canonical)) || !Array.isArray(page.sections) || page.sections.length < 1 || page.sections.length > 30) return failure("PAGE_FIELD", "Champ ou borne de page invalide");
    const nav = { showInBar: true, order: 100 };
    if ("nav" in page) {
      if (!object(page.nav) || !keysOnly(page.nav, ["show_in_bar", "order"])) return failure("PAGE_FIELD", "Navigation de page invalide");
      if ("show_in_bar" in page.nav) {
        if (typeof page.nav.show_in_bar !== "boolean") return failure("PAGE_FIELD", "Visibilité de page invalide");
        nav.showInBar = page.nav.show_in_bar;
      }
      if ("order" in page.nav) {
        if (!integer(page.nav.order) || page.nav.order < 0 || page.nav.order > 1000000) return failure("PAGE_FIELD", "Ordre de page invalide");
        nav.order = page.nav.order;
      }
    }
    const sections: Section[] = [];
    for (const raw of page.sections) {
      const result = section(raw, refs);
      if ("ok" in result) return result;
      sections.push(result);
    }
    pages.push({ key: page.key, slug: page.slug, title: page.title, nav, revision: page.revision, seo_title: page.seo_title, seo_description: page.seo_description, canonical: page.canonical, sections });
  }
  return { ok: true, set: { generation: value.generation, publicationId: value.publication_id, pages, merchandising: relations } };
}
