"use client";

import type { Cart, CartItem, Product, ProductVariant } from "lib/supabase/types";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import { persistAbandonedCart } from "lib/cart/persist";

const CART_KEY = "prodes_cart";

type UpdateType = "plus" | "minus" | "delete";

type CartAction =
  | {
      type: "UPDATE_ITEM";
      payload: { merchandiseId: string; updateType: UpdateType };
    }
  | {
      type: "ADD_ITEM";
      payload: { variant: ProductVariant; product: Product; quantity?: number };
    }
  | {
      type: "SET_CART";
      payload: Cart;
    };

type CartContextType = {
  cart: Cart;
  updateCartItem: (merchandiseId: string, updateType: UpdateType) => void;
  addCartItem: (variant: ProductVariant, product: Product, quantity?: number) => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

function calculateItemCost(quantity: number, price: string): string {
  return (Number(price) * quantity).toString();
}

function createEmptyCart(): Cart {
  return {
    id: undefined,
    checkoutUrl: "",
    totalQuantity: 0,
    lines: [],
    cost: {
      subtotalAmount: { amount: "0", currencyCode: "EUR" },
      totalAmount: { amount: "0", currencyCode: "EUR" },
      totalTaxAmount: { amount: "0", currencyCode: "EUR" },
    },
  };
}

function updateCartTotals(lines: CartItem[]): Pick<Cart, "totalQuantity" | "cost"> {
  const totalQuantity = lines.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = lines.reduce(
    (sum, item) => sum + Number(item.cost.totalAmount.amount),
    0,
  );
  return {
    totalQuantity,
    cost: {
      subtotalAmount: { amount: totalAmount.toFixed(2), currencyCode: "EUR" },
      totalAmount: { amount: totalAmount.toFixed(2), currencyCode: "EUR" },
      totalTaxAmount: { amount: "0", currencyCode: "EUR" },
    },
  };
}

function createOrUpdateCartItem(
  existingItem: CartItem | undefined,
  variant: ProductVariant,
  product: Product,
  addQuantity = 1,
): CartItem {
  const quantity = existingItem ? existingItem.quantity + addQuantity : addQuantity;
  const totalAmount = calculateItemCost(quantity, variant.price.amount);

  return {
    id: existingItem?.id ?? variant.id + "-" + Date.now(),
    quantity,
    cost: {
      totalAmount: {
        amount: totalAmount,
        currencyCode: variant.price.currencyCode,
      },
    },
    merchandise: {
      id: variant.id,
      title: variant.title,
      selectedOptions: variant.selectedOptions,
      product: {
        id: product.id,
        handle: product.handle,
        title: product.title,
        featuredImage: product.featuredImage,
      },
    },
  };
}

function cartReducer(state: Cart, action: CartAction): Cart {
  switch (action.type) {
    case "SET_CART":
      return action.payload;

    case "UPDATE_ITEM": {
      const { merchandiseId, updateType } = action.payload;
      const updatedLines = state.lines
        .map((item) => {
          if (item.merchandise.id !== merchandiseId) return item;
          if (updateType === "delete") return null;
          const newQuantity =
            updateType === "plus" ? item.quantity + 1 : item.quantity - 1;
          if (newQuantity === 0) return null;
          const singleItemAmount = Number(item.cost.totalAmount.amount) / item.quantity;
          return {
            ...item,
            quantity: newQuantity,
            cost: {
              ...item.cost,
              totalAmount: {
                ...item.cost.totalAmount,
                amount: calculateItemCost(newQuantity, singleItemAmount.toString()),
              },
            },
          };
        })
        .filter(Boolean) as CartItem[];
      return { ...state, ...updateCartTotals(updatedLines), lines: updatedLines };
    }

    case "ADD_ITEM": {
      const { variant, product, quantity = 1 } = action.payload;
      const existingItem = state.lines.find(
        (item) => item.merchandise.id === variant.id,
      );
      const updatedItem = createOrUpdateCartItem(existingItem, variant, product, quantity);
      const updatedLines = existingItem
        ? state.lines.map((item) =>
            item.merchandise.id === variant.id ? updatedItem : item,
          )
        : [...state.lines, updatedItem];
      return { ...state, ...updateCartTotals(updatedLines), lines: updatedLines };
    }

    default:
      return state;
  }
}

export function CartProvider({
  children,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cartPromise: _cartPromise,
}: {
  children: React.ReactNode;
  cartPromise?: Promise<Cart | undefined>;
}) {
  const [cart, dispatch] = useReducer(cartReducer, createEmptyCart());
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Cart;
        dispatch({ type: "SET_CART", payload: parsed });
      }
    } catch {
      // Ignore parse errors
    }
    setMounted(true);
  }, []);

  // Persist to localStorage whenever cart changes
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      // Ignore storage errors
    }
  }, [cart, mounted]);

  // Persist abandoned cart on page close or after 30 min inactivity
  useEffect(() => {
    if (!mounted) return;

    const handleUnload = () => {
      if (cart.lines.length > 0) {
        persistAbandonedCart(cart);
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    const inactivityTimer = setTimeout(() => {
      if (cart.lines.length > 0) {
        persistAbandonedCart(cart);
      }
    }, 30 * 60 * 1000);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      clearTimeout(inactivityTimer);
    };
  }, [cart, mounted]);

  const updateCartItem = useCallback(
    (merchandiseId: string, updateType: UpdateType) => {
      dispatch({ type: "UPDATE_ITEM", payload: { merchandiseId, updateType } });
    },
    [],
  );

  const addCartItem = useCallback(
    (variant: ProductVariant, product: Product, quantity = 1) => {
      dispatch({ type: "ADD_ITEM", payload: { variant, product, quantity } });
    },
    [],
  );

  const value = useMemo(
    () => ({ cart, updateCartItem, addCartItem }),
    [cart, updateCartItem, addCartItem],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}

/** Export for backward compat with legacy server actions (no-ops) */
export function useLegacyCart() {
  return useCart();
}
