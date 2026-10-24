/** Formes JSON des réponses serveur lues par les composants clients (aucune logique). */
export type PreviewSelection = {
  rate_id: string;
  unit_amount: string;
  currency: string;
  tax_basis_or_status: string;
  valid_until_utc: string | null;
};

export type PreviewLineJson = {
  public_item_key: string;
  variant_axes: Record<string, string>;
  quantity: number;
  accepted: boolean;
  error_codes: string[];
  superseded_by: Record<string, string>;
  selection: PreviewSelection | null;
  line_total: string | null;
};

export type PreviewJson = {
  persistence: "NONE";
  catalogue_sequence: number;
  instant_utc: string;
  accepted: boolean;
  outcome: string;
  error_codes: string[];
  lines: PreviewLineJson[];
  currency: string | null;
  total_amount: string | null;
};

export type BusinessJson = {
  kind?: "quote_request" | "order";
  persistence?: string;
  durable?: boolean;
  site_status?: string;
  verdict: null | {
    accepted: boolean;
    outcome: string;
    error_codes: string[];
    receipt: null | { status?: string; total_amount?: string; lines?: unknown[] };
    superseded_by: Record<string, string>;
  };
};

/** Libellés français des codes C0 (§13) affichés au client. */
export const CODE_TEXT: Record<string, string> = {
  PRICE_WINDOW_UNAVAILABLE: "Prix indisponible pour cette quantité à cet instant (devis non chiffré possible)",
  INVALID_VARIANT: "Variante non proposée",
  INVALID_DATA: "Données invalides",
  PAYLOAD_MALFORMED: "Requête illisible",
  DUPLICATE_LINE: "Ligne en double",
  ITEM_SUPERSEDED: "Article remplacé",
  ITEM_RETIRED: "Article retiré du catalogue",
  ITEM_NOT_PUBLISHED: "Article non publié",
  PRICE_WINDOW_OVERLAP: "Prix ambigu : publication incohérente",
  CATALOG_UNSAFE: "Catalogue momentanément non sûr",
  CART_STALE: "Le catalogue a changé : panier à reconfirmer",
  CATALOG_CHANGED: "Le catalogue ou les prix ont changé : à reconfirmer",
  PRICE_CHANGED: "Le prix a changé : à reconfirmer",
};
