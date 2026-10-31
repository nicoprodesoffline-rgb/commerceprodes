"use client";

/**
 * Mémoires du navigateur : favoris, comparateur, récemment consultés. Chaque liste est un tableau d'adresses de Familles (slugs) tenu dans `localStorage`,
 * relu à chaque changement (autre onglet compris). Stockage refusé (navigation privée, quota) : la liste vit alors en mémoire pour la page, sans erreur.
 * Rien d'autre qu'une adresse n'est stocké : prix, noms et images sont toujours relus au serveur (le navigateur ne garde ni ne calcule aucun prix).
 */
import { useSyncExternalStore } from "react";

export const KEYS = { wishlist: "prodes_wishlist", compare: "prodes_compare", recent: "prodes_recent" } as const;
export type ListKey = (typeof KEYS)[keyof typeof KEYS];
export const LIMITS = { [KEYS.wishlist]: 50, [KEYS.compare]: 4, [KEYS.recent]: 12 } as const;
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;
const EVENT = "prodes:lists";
const memory = new Map<string, string[]>();
const cache = new Map<string, { raw: string; value: string[] }>();
const EMPTY: string[] = [];

function readRaw(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "[]";
  } catch {
    return JSON.stringify(memory.get(key) ?? []);
  }
}

function snapshot(key: string): string[] {
  const raw = readRaw(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  let value: string[] = EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) value = parsed.filter((s): s is string => typeof s === "string" && SLUG.test(s));
  } catch {
    value = EMPTY;
  }
  cache.set(key, { raw, value });
  return value;
}

function write(key: string, list: string[]) {
  memory.set(key, list);
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* mémoire de la page seulement */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useLocalList(key: ListKey): string[] {
  return useSyncExternalStore(subscribe, () => snapshot(key), () => EMPTY);
}

/** Ajoute ou retire `slug`. Refus (`"max"`) si la liste est pleine : jamais un retrait silencieux d'un autre élément. */
export function toggleInList(key: ListKey, slug: string): "added" | "removed" | "max" {
  if (!SLUG.test(slug)) return "max";
  const list = snapshot(key);
  if (list.includes(slug)) {
    write(key, list.filter((s) => s !== slug));
    return "removed";
  }
  if (list.length >= LIMITS[key]) return "max";
  write(key, [...list, slug]);
  return "added";
}

export function removeFromList(key: ListKey, slug: string) {
  write(key, snapshot(key).filter((s) => s !== slug));
}

export function clearList(key: ListKey) {
  write(key, []);
}

/** « Récemment consultés » : le plus récent d'abord, sans doublon, 12 au plus. */
export function rememberRecent(slug: string) {
  if (!SLUG.test(slug)) return;
  write(KEYS.recent, [slug, ...snapshot(KEYS.recent).filter((s) => s !== slug)].slice(0, LIMITS[KEYS.recent]));
}
