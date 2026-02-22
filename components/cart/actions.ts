"use server";

/**
 * Cart server actions — localStorage cart.
 * addItemWithQuantity is still a server action for backward compat,
 * but the actual cart state is managed client-side by CartContext.
 * Direct cart manipulation is done in the modal/cart page via useCart().
 */

export async function addItem(
  prevState: unknown,
  selectedVariantId: string | undefined,
): Promise<string | undefined> {
  if (!selectedVariantId) {
    return "Error adding item to cart";
  }
  // Actual add is done optimistically in the client via addCartItem()
  return undefined;
}

export async function addItemWithQuantity(
  variantId: string,
  quantity: number,
): Promise<{ ok: boolean }> {
  if (!variantId || quantity <= 0) return { ok: false };
  // Cart is managed client-side via CartContext localStorage
  return { ok: true };
}

export async function removeItem(
  prevState: unknown,
  merchandiseId: string,
): Promise<string | undefined> {
  // Handled client-side via updateCartItem(id, 'delete')
  return undefined;
}

export async function updateItemQuantity(
  prevState: unknown,
  payload: { merchandiseId: string; quantity: number },
): Promise<string | undefined> {
  // Handled client-side via updateCartItem
  return undefined;
}

export async function redirectToCheckout(): Promise<void> {
  // No-op — handled client-side
}

export async function createCartAndSetCookie(): Promise<void> {
  // No-op — cart is localStorage-based
}
