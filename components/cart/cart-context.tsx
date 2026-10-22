"use client";

// PANIER UNIQUE (brouillon UX côté client). Il ne fait foi de rien : toute
// demande serveur (devis, commande) envoie les lignes affichées et le serveur
// les revalide contre le snapshot. Aucun cookie cartId, aucune action serveur.
import { multiplyAmount, selectWindow, sumAmounts } from "lib/site-dto/pricing";
import type { PriceResult, PriceWindow, VariantAxes } from "lib/site-dto/types";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";

const CART_KEY = "prodes_site_cart_v1";
const LEGACY_KEYS = ["prodes_cart", "prodes_quote", "prodes_wishlist", "prodes_compare"];

export type CartLine = {
  public_item_key: string;
  public_family_key: string;
  family_slug: string;
  family_name: string;
  variant_axes: VariantAxes;
  image_url: string;
  quantity: number;
  windows: PriceWindow[]; // copie des fenêtres publiques, pour l'affichage seulement
};

export type DisplayedLine = CartLine & { price: PriceResult; line_amount: string | null };

type UpdateType = "plus" | "minus" | "delete";

type CartAction =
  | { type: "ADD"; line: CartLine }
  | { type: "UPDATE"; itemKey: string; updateType: UpdateType }
  | { type: "SET"; lines: CartLine[] }
  | { type: "CLEAR" };

function reducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "SET":
      return action.lines;
    case "CLEAR":
      return [];
    case "ADD": {
      const existing = state.find((l) => l.public_item_key === action.line.public_item_key);
      if (!existing) return [...state, action.line];
      return state.map((l) =>
        l.public_item_key === action.line.public_item_key
          ? { ...action.line, quantity: l.quantity + action.line.quantity }
          : l,
      );
    }
    case "UPDATE":
      return state
        .map((l) => {
          if (l.public_item_key !== action.itemKey) return l;
          if (action.updateType === "delete") return null;
          const q = action.updateType === "plus" ? l.quantity + 1 : l.quantity - 1;
          return q <= 0 ? null : { ...l, quantity: q };
        })
        .filter((l): l is CartLine => l !== null);
  }
}

type CartContextType = {
  lines: CartLine[];
  displayed: DisplayedLine[];
  totalQuantity: number;
  displayedTotal: string | null; // null si au moins une ligne sans prix
  nowUtc: string;
  addLine: (line: CartLine) => void;
  updateLine: (itemKey: string, updateType: UpdateType) => void;
  clearCart: () => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children, nowUtc }: { children: React.ReactNode; nowUtc: string }) {
  const [lines, dispatch] = useReducer(reducer, []);
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      for (const k of LEGACY_KEYS) localStorage.removeItem(k); // pas de second panier
      const saved = localStorage.getItem(CART_KEY);
      if (saved) dispatch({ type: "SET", lines: JSON.parse(saved) as CartLine[] });
    } catch {
      // stockage indisponible : panier en mémoire seulement
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(lines));
    } catch {
      // ignore
    }
  }, [lines, mounted]);

  const displayed = useMemo<DisplayedLine[]>(
    () =>
      lines.map((l) => {
        const price = selectWindow(l.windows, l.quantity, nowUtc);
        return {
          ...l,
          price,
          line_amount: price.ok ? multiplyAmount(price.price.unit_amount, l.quantity) : null,
        };
      }),
    [lines, nowUtc],
  );

  const displayedTotal = useMemo(
    () =>
      displayed.every((l) => l.line_amount !== null)
        ? sumAmounts(displayed.map((l) => l.line_amount as string))
        : null,
    [displayed],
  );

  const addLine = useCallback((line: CartLine) => {
    dispatch({ type: "ADD", line });
    setIsOpen(true);
  }, []);
  const updateLine = useCallback(
    (itemKey: string, updateType: UpdateType) => dispatch({ type: "UPDATE", itemKey, updateType }),
    [],
  );
  const clearCart = useCallback(() => dispatch({ type: "CLEAR" }), []);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({
      lines,
      displayed,
      totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
      displayedTotal,
      nowUtc,
      addLine,
      updateLine,
      clearCart,
      isOpen,
      openCart,
      closeCart,
    }),
    [lines, displayed, displayedTotal, nowUtc, addLine, updateLine, clearCart, isOpen, openCart, closeCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) throw new Error("useCart must be used within a CartProvider");
  return context;
}

export function axesLabel(axes: VariantAxes): string {
  return Object.entries(axes)
    .map(([k, v]) => `${k} : ${v}`)
    .join(" · ");
}
