"use client";

function getSessionId(): string {
  try {
    const key = "prodes_sid";
    let sid = sessionStorage.getItem(key);
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(key, sid);
    }
    return sid;
  } catch {
    return "unknown";
  }
}

function fire(event: string, payload: Record<string, unknown>) {
  try {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, payload }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // fire-and-forget, never throw
  }
}

export function trackProductView(handle: string, productId?: string) {
  fire("product_view", {
    product_handle: handle,
    product_id: productId ?? null,
    session_id: getSessionId(),
  });
}

export function trackCartEvent(
  type: "add" | "remove" | "checkout_start" | "checkout_complete",
  item?: { handle?: string; id?: string; sku?: string; quantity?: number },
) {
  fire("cart_event", {
    event_type: type,
    product_handle: item?.handle ?? null,
    product_id: item?.id ?? null,
    sku: item?.sku ?? null,
    quantity: item?.quantity ?? 1,
    session_id: getSessionId(),
  });
}
