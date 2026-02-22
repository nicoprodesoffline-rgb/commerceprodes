/**
 * Silently persists the cart to the DB on page close / inactivity.
 * Used for abandoned cart recovery (B2B sales follow-up).
 */

import type { Cart } from 'lib/supabase/types';

const SESSION_KEY = 'prodes_cart_session_id';

function getOrCreateSessionId(): string {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return 'anon-' + Date.now();
  }
}

export async function persistAbandonedCart(
  cart: Cart,
  email?: string,
): Promise<void> {
  if (!cart.lines.length) return;

  const sessionId = getOrCreateSessionId();
  const totalHt = Number(cart.cost.subtotalAmount.amount);
  const totalItems = cart.totalQuantity;

  const items = cart.lines.map((line) => ({
    variantId: line.merchandise.id,
    variantTitle: line.merchandise.title,
    productTitle: line.merchandise.product.title,
    productHandle: line.merchandise.product.handle,
    imageUrl: line.merchandise.product.featuredImage?.url ?? null,
    quantity: line.quantity,
    unitPrice: Number(line.cost.totalAmount.amount) / line.quantity,
  }));

  try {
    await fetch('/api/cart/abandon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        email: email ?? null,
        items_json: items,
        total_ht: totalHt,
        total_items: totalItems,
      }),
      keepalive: true,
    });
  } catch {
    // Silently ignore — must never disrupt UX
  }
}
