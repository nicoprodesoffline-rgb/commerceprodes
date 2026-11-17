// Cercle 3, 3.23 — d'où le SITE lit les réglages de la boutique. Les objets `shop`, `announcement` et `maintenance` arrivent avec les contenus v2 (canal signé, lot V) ;
// tant qu'aucun lecteur n'est branché, ou qu'aucun réglage n'est publié, le SITE affiche ce qu'il affichait avant (DEFAULT_SHOP).
import { readShop, type ShopSettings } from "./settings";

export type ShopObjectsReader = () => Promise<unknown>;

let reader: ShopObjectsReader | null = null;

/** Branche le lecteur des objets de boutique des contenus v2 (appelé par la lecture v2) ; `null` = aucun. */
export function useShopObjectsReader(next: ShopObjectsReader | null): void {
  reader = next;
}

export async function getShopSettings(): Promise<ShopSettings> {
  return readShop(reader);
}
