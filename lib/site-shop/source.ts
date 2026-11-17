// Cercle 3, 3.23 — d'où le SITE lit les réglages de la boutique. Les objets `shop`, `announcement` et `maintenance` arrivent avec les contenus v2 (canal signé, lot V) ;
// tant qu'aucun lecteur n'est branché, ou qu'aucun réglage n'est publié, le SITE affiche ce qu'il affichait avant (DEFAULT_SHOP).
import { readShop, type ShopSettings } from "./settings";
import { shopObjectsFromV2 } from "@/lib/site-content/v2";
import { getActiveContentV2 } from "@/lib/site-content/v2-source";

export type ShopObjectsReader = () => Promise<unknown>;

/** Par défaut : les objets de boutique des contenus v2 actifs ; `null` tant que la Factory n'en a publié aucun. */
const activeContentReader: ShopObjectsReader = async () => {
  const doc = await getActiveContentV2();
  return doc === null ? null : shopObjectsFromV2(doc);
};

let reader: ShopObjectsReader | null = activeContentReader;

/** Branche le lecteur des objets de boutique des contenus v2 (appelé par la lecture v2) ; `null` = aucun. */
export function useShopObjectsReader(next: ShopObjectsReader | null): void {
  reader = next;
}

export async function getShopSettings(): Promise<ShopSettings> {
  return readShop(reader);
}
