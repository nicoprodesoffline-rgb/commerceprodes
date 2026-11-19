/** La caractéristique réservée « Pastille » (docs/site_filters_v1.md §4) : elle dessine la pastille et nourrit le filtre Coloris, et ne s'affiche jamais comme une caractéristique. */
export const PASTILLE_LABEL = "Pastille";
/** La teinte fine (docs/site_filters_v1.md §5) : mêmes parties que « Pastille », chacune « RAL NNNN » ou le nom de la nuance. Dessine seulement la pastille. */
export const TEINTE_LABEL = "Teinte";

/** Le reflet (docs/site_filters_v1.md §5, puce « Reflet ») : mêmes parties que « Pastille », chacune « brillant » ou « mat ». Dessine seulement la pastille. */
export const REFLET_LABEL = "Reflet";
export const BRILLANT = "brillant";
export const MAT = "mat";

export const MULTICOLORE = "Multicolore";
export const NON_PRECISE = "Non précisé";
export const BICOLORE_SEPARATOR = " / ";

/** Préfixe exact des axes DÉDUITS que la Factory publie pour le filtre seulement (« Filtre : Longueur ») : jamais affichés, la fiche garde le texte source. */
export const DEDUCED_PREFIX = "Filtre : ";

/**
 * « Pastille », « Teinte », « Reflet » et tout libellé qui commence par « Filtre : » ne sont jamais des caractéristiques : ni fiche, ni recherche, ni référencement,
 * ni filtre sous ce nom (Coloris ne lit que « Pastille » ; une dimension réunit « X » et « Filtre : X »).
 */
export const isReservedLabel = (label: string): boolean => label.startsWith(DEDUCED_PREFIX) || [PASTILLE_LABEL, TEINTE_LABEL, REFLET_LABEL].some((reserved) => label.trim().toLowerCase() === reserved.toLowerCase());

type Carrier = { characteristics?: readonly { label: string; value: string }[] | undefined };
const valueOfLabel = (carrier: Carrier, label: string): string | undefined => carrier.characteristics?.find((c) => c.label === label)?.value;

/** La valeur de « Pastille » d'un porteur de caractéristiques (la sienne, sinon `undefined`). */
export const pastilleOf = (carrier: Carrier): string | undefined => valueOfLabel(carrier, PASTILLE_LABEL);

/** Ce que la fiche dessine pour une variante : « Pastille » (et « Teinte », « Reflet » posés au même endroit) de la variante, sinon de la famille. */
export function drawnOf(variant: Carrier, family: Carrier): { pastille?: string; teinte?: string; reflet?: string } {
  const own = pastilleOf(variant);
  const from = own !== undefined ? variant : family;
  const pastille = pastilleOf(from);
  const teinte = valueOfLabel(from, TEINTE_LABEL);
  const reflet = valueOfLabel(from, REFLET_LABEL);
  return { ...(pastille !== undefined ? { pastille } : {}), ...(teinte !== undefined ? { teinte } : {}), ...(reflet !== undefined ? { reflet } : {}) };
}
