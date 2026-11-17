// Cercle 3, 3.23 — les réglages de la boutique tels que la Factory les publie (objets `shop`, `announcement` et `maintenance` des contenus v2) et ce que le SITE en fait.
// Module PUR : aucune dépendance, aucun accès réseau ni base. Les textes ne sont JAMAIS injectés comme du HTML : React les échappe à l'affichage, la page de maintenance
// du proxy les échappe elle-même (`escapeHtml`). Sans réglage publié, le SITE garde les valeurs qu'il affichait avant ce lot (DEFAULT_SHOP) : rien ne casse.

export type ShopLink = { label: string; url: string };
export type ShopSettings = {
  phone: string;
  email: string;
  address: string;
  openingHours: string;
  deliveryNotice: string;
  footerLinks: ShopLink[];
  announcement: { text: string; link: string; start: string | null; end: string | null };
  maintenance: { active: boolean; message: string };
};

export const DEFAULT_SHOP: ShopSettings = {
  phone: "",
  email: "",
  address: "",
  openingHours: "Lun–Sam 8h30–19h",
  deliveryNotice: "Livraison incluse sur tout le catalogue",
  footerLinks: [],
  announcement: { text: "", link: "", start: null, end: null },
  maintenance: { active: false, message: "" },
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, fallback: string, max: number): string => (typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, max) : fallback);
const instant = (value: unknown): string | null => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null);

/** Une adresse du SITE (« /faq », jamais « //hôte ») ou une adresse web http(s) : tout le reste (script, fichier) est écarté. */
export function safeLink(value: unknown): value is string {
  return typeof value === "string" && (/^\/(?!\/)[A-Za-z0-9._~\-/?=&#%]*$/.test(value) || /^https?:\/\/[^\s<>"']+$/.test(value));
}

/** Les trois objets des contenus v2 → les réglages du SITE. Tolérant : un champ absent ou invalide retombe sur la valeur d'avant le lot, jamais sur une erreur. */
export function parseShop(raw: unknown): ShopSettings {
  if (!isObject(raw)) return DEFAULT_SHOP;
  const shop = isObject(raw.shop) ? raw.shop : {};
  const announcement = isObject(raw.announcement) ? raw.announcement : {};
  const maintenance = isObject(raw.maintenance) ? raw.maintenance : {};
  const links = Array.isArray(shop.footer_links) ? shop.footer_links : [];
  return {
    phone: text(shop.phone, DEFAULT_SHOP.phone, 60),
    email: text(shop.email, DEFAULT_SHOP.email, 200),
    address: text(shop.address, DEFAULT_SHOP.address, 1000),
    openingHours: text(shop.opening_hours, DEFAULT_SHOP.openingHours, 200),
    deliveryNotice: text(shop.delivery_notice, DEFAULT_SHOP.deliveryNotice, 300),
    footerLinks: links.flatMap((link): ShopLink[] => (isObject(link) && typeof link.label === "string" && link.label.trim() !== "" && safeLink(link.url) ? [{ label: link.label.trim().slice(0, 80), url: link.url }] : [])).slice(0, 12),
    announcement: {
      text: text(announcement.text, "", 300),
      link: safeLink(announcement.link) ? announcement.link : "",
      start: instant(announcement.start),
      end: instant(announcement.end),
    },
    maintenance: { active: maintenance.active === true && text(maintenance.message, "", 500) !== "", message: text(maintenance.message, "", 500) },
  };
}

/** Le bandeau à afficher à cet instant, ou null : pas de texte, pas encore commencé, ou terminé. */
export function activeAnnouncement(settings: ShopSettings, now: Date): ShopSettings["announcement"] | null {
  const { announcement } = settings;
  if (announcement.text === "") return null;
  const t = now.getTime();
  if (announcement.start !== null && t < Date.parse(announcement.start)) return null;
  if (announcement.end !== null && t >= Date.parse(announcement.end)) return null;
  return announcement;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Les réglages lus par `reader` (les objets des contenus v2) ; sans lecteur, ou si la lecture échoue, les valeurs d'avant le lot : une page ne casse jamais pour cela. */
export async function readShop(reader: (() => Promise<unknown>) | null): Promise<ShopSettings> {
  if (reader === null) return DEFAULT_SHOP;
  try {
    return parseShop(await reader());
  } catch {
    console.warn("[site-shop] SOURCE_UNAVAILABLE");
    return DEFAULT_SHOP;
  }
}
