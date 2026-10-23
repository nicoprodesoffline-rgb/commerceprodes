"use client";

import type { PreviewJson } from "@/lib/site-business/client-types";

export type ApiResult<T> = { status: number; json: T | null; network: false } | { status: 0; json: null; network: true };

/** POST JSON same-origin (le proxy exige `Content-Type: application/json` et une origine identique). */
export async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    let json: T | null = null;
    try {
      json = (await res.json()) as T;
    } catch {
      json = null;
    }
    return { status: res.status, json, network: false };
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    return { status: 0, json: null, network: true };
  }
}

export type PreviewLineInput = { public_item_key: string; variant_axes: Record<string, string>; quantity: number };

/** Aperçu serveur (C0 `selectPrice` à l'instant serveur) : seule source des prix affichés. */
export function previewCart(lines: PreviewLineInput[], signal?: AbortSignal): Promise<ApiResult<PreviewJson & { site_status?: string; reason?: string }>> {
  return postJson("/api/site/cart/preview", { lines }, signal);
}

/** Clé d'idempotence C0 §6 (`^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$`). */
export function newIdempotencyKey(prefix: "quote" | "order"): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}
