"use client";

import { useEffect } from "react";
import { useCart } from "components/cart/cart-context";

export function ClearCartOnMount() {
  const { clearCart } = useCart();
  useEffect(() => {
    clearCart();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
