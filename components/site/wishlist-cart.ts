import type { DraftLine } from "@/components/cart/cart-provider";
import type { previewCart } from "@/components/site/api";
import type { LookedUp } from "@/lib/site-catalog/family-lookup";

export type WishlistCartResult = {
  added: number;
  unpriced: number;
  refused: { family: LookedUp; codes: string[] }[];
  failed: LookedUp[];
  choose: LookedUp[];
};

/** Chaque ajout est autorisé par son aperçu serveur ; aucun prix n'est choisi dans le navigateur. */
export async function addWishlistToCart(
  families: LookedUp[],
  preview: typeof previewCart,
  add: (draft: DraftLine, sequence: number, options: { announce: false }) => void,
): Promise<WishlistCartResult> {
  const result: WishlistCartResult = { added: 0, unpriced: 0, refused: [], failed: [], choose: [] };
  for (const family of families) {
    const item = family.single;
    if (!item) { result.choose.push(family); continue; }
    let response: Awaited<ReturnType<typeof previewCart>>;
    try {
      response = await preview([{ public_item_key: item.public_item_key, variant_axes: item.variant_axes, quantity: 1 }]);
    } catch {
      result.failed.push(family);
      continue;
    }
    if (response.network) { result.failed.push(family); continue; }
    const line = response.json?.lines?.[0];
    const matches = line?.public_item_key === item.public_item_key && line.quantity === 1;
    const unpriced = line?.error_codes?.length === 1 && line.error_codes[0] === "PRICE_WINDOW_UNAVAILABLE";
    if (response.status === 200 && response.json && matches && ((line.accepted && line.selection) || unpriced)) {
      add({ ...item, quantity: 1, family_name: family.name, family_slug: family.slug }, response.json.catalogue_sequence, { announce: false });
      result.added++;
      if (unpriced) result.unpriced++;
    } else {
      const codes = line?.error_codes?.length ? line.error_codes : response.json?.error_codes?.length ? response.json.error_codes : [response.json?.site_status ?? "TRANSPORT_ERROR"];
      result.refused.push({ family, codes });
    }
  }
  return result;
}
