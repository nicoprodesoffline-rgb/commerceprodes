/**
 * Types partagés pour la page Pipeline Ingestion.
 * Structures alignées sur les JSON produits par extract.py / expand.py / puid_generator.py.
 */

// ── Validated extraction (Step 1) ──────────────────────────────────────────

export interface ExtractionMeta {
  source_pdf_name?: string;
  generated_at?: string;
  n_consensus?: number;
  model?: string;
  job_id?: string;
}

export interface ExtractionLigne {
  line_type?: string;
  reference: string | null;
  designation: string;
  prix_ht: number | null;
  prix_public_ht?: number | null;
  eco_contribution?: number | null;
  attributs_prix?: Record<string, string | number | null>;
  coloris_liste?: string[];
  taille?: string | null;
  dimensions?: string | null;
  pcb?: number | null;
  palette_qte?: number | null;
  source_row_hint?: string | null;
  need_check?: boolean;
  warning_text?: string | null;
  description_ligne?: string | null;
}

export interface ExtractionFamille {
  nom_gamme: string;
  categorie_produit?: string | null;
  axes_prix?: string[];
  axes_style?: string[];
  description_gamme?: string | null;
  lignes: ExtractionLigne[];
}

export interface ValidatedExtraction {
  meta: ExtractionMeta;
  result: {
    familles: ExtractionFamille[];
  };
}

// ── Extraction list item (landing) ─────────────────────────────────────────

export interface ExtractionListItem {
  name: string;
  fournisseur: string;
  date: string;
  familles_count: number;
  variantes_count: number;
  stage: "extraction" | "expanded" | "puid" | "imported";
}

// ── PUID data (Step 2) ────────────────────────────────────────────────────

export interface PuidProduct {
  ref: string;
  nom_gamme: string;
  puid_root: string;
  model_code?: string;
  sup_code?: string;
  categorie_produit?: string;
  description_gamme?: string;
  fournisseur?: string;
  axes_prix?: string[];
  axes_style?: string[];
  axes_prix_effectif?: string[];
  axes_style_effectif?: string[];
  variants_count: number;
}

export interface PuidVariant {
  reference: string | null;
  designation: string;
  product_ref: string;
  puid: string;
  puid_root: string;
  prix_ht: number | null;
  price_tokens: string[];
  style_tokens: string[];
  attributs_prix?: Record<string, string | number | null>;
  need_check?: boolean;
}

export interface PuidCollision {
  puid: string;
  variants: { reference: string; designation: string }[];
}

export interface PuidData {
  fournisseur: string;
  generated_at: string;
  dry_run: boolean;
  summary: {
    total_products: number;
    total_variants: number;
    puid_collisions: number;
    produits_lies_resolved: number;
    produits_lies_unresolved: number;
  };
  puid_collisions: PuidCollision[];
  products: PuidProduct[];
  variants: PuidVariant[];
}

// ── Import plan (Step 3) ──────────────────────────────────────────────────

export interface ImportSummary {
  products_to_insert: number;
  variants_to_insert: number;
  pricing_profiles_to_insert: number;
  puid_collisions: number;
  produits_lies_unresolved: number;
  blocking_issues: string[];
}

// ── Patch (corrections Step 1 — legacy extraction) ───────────────────────

export interface PatchMoveLigne {
  type: "move_ligne";
  from_famille_idx: number;
  ligne_idx: number;
  to_famille_idx: number;
}

export interface PatchEditLigne {
  type: "edit_ligne";
  famille_idx: number;
  ligne_idx: number;
  fields: Partial<ExtractionLigne>;
}

export interface PatchEditFamille {
  type: "edit_famille";
  famille_idx: number;
  fields: Partial<
    Pick<
      ExtractionFamille,
      "nom_gamme" | "categorie_produit" | "axes_prix" | "axes_style"
    >
  >;
}

export interface PatchDeleteFamille {
  type: "delete_famille";
  famille_idx: number;
}

export type ExtractionPatch =
  | PatchMoveLigne
  | PatchEditLigne
  | PatchEditFamille
  | PatchDeleteFamille;

// ── Expanded data (post-engine) ──────────────────────────────────────────

export interface ExpandedProduct {
  ref: string;
  nom_gamme: string;
  nom_produit: string;
  parent_gamme: string | null;
  categorie_produit: string;
  fournisseur: string;
  description_gamme: string | null;
  merged_from: string[];
  axes_prix: string[];
  axes_prix_effectif: string[];
  axes_style: string[];
  axes_style_effectif: string[];
  options_disponibles: string[];
  variants_count: number;
  by_source_type: Record<string, number>;
  _hints_block_id: string | null;
}

export interface ExpandedVariant {
  reasoning___line_type?: string;
  line_type: string;
  reference: string | null;
  designation: string;
  description: string | null;
  attributs_prix: Record<string, string | number | null>;
  prix_ht: number | null;
  remise: number | null;
  prix_net: number | null;
  eco_contribution: number | null;
  taille: string | null;
  dimensions: string | null;
  dimensions_colis: string | null;
  poids: number | null;
  volume_unite: number | null;
  matiere: string | null;
  coloris_liste: string[];
  vendu_par: number | null;
  pcb: number | null;
  palette_qte: number | null;
  produits_lies: string | null;
  need_check: boolean;
  warning_text: string | null;
  source_row_hint: string | null;
  categorie_produit: string;
  product_ref: string;
  nom_gamme: string;
  nom_complet: string;
  description_computed: string | null;
  attributs_prix_computed: Record<string, string>;
  attributs_style_computed: Record<string, string>;
  [key: string]: unknown;
}

export interface ExpandedData {
  products: ExpandedProduct[];
  variants: ExpandedVariant[];
}

// ── Expanded corrections (saved separately for training) ─────────────────

export interface CorrectionEditVariant {
  type: "edit_variant";
  product_ref: string;
  variant_idx: number;
  field: string;
  old_value: unknown;
  new_value: unknown;
}

export interface CorrectionEditProduct {
  type: "edit_product";
  product_ref: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
}

export interface CorrectionReclassifyAxis {
  type: "reclassify_axis";
  product_ref: string;
  axis_name: string;
  from: "prix" | "style";
  to: "prix" | "style";
}

export interface CorrectionMoveVariant {
  type: "move_variant";
  variant_idx: number;
  from_product_ref: string;
  to_product_ref: string;
}

export interface CorrectionDeleteProduct {
  type: "delete_product";
  product_ref: string;
}

export type ExpandedCorrection =
  | CorrectionEditVariant
  | CorrectionEditProduct
  | CorrectionReclassifyAxis
  | CorrectionMoveVariant
  | CorrectionDeleteProduct;

export interface ExpandedCorrectionsFile {
  source_expanded: string;
  created_at: string;
  updated_at: string;
  corrections: ExpandedCorrection[];
}
