"use client";

import { useEffect, useState } from "react";
import type { LookedUp } from "@/lib/site-catalog/family-lookup";

export type FamiliesState =
  | { status: "loading" }
  | { status: "ready"; families: LookedUp[]; missing: string[] }
  | { status: "unavailable" }
  | { status: "error" };

/** Familles publiées relues au serveur pour une liste d'adresses du navigateur (nom, image, prix « à partir de »…). Jamais un prix gardé localement. */
export function useFamilies(slugs: string[]): FamiliesState {
  const key = slugs.join(",");
  const [state, setState] = useState<FamiliesState>({ status: "loading" });
  useEffect(() => {
    if (key === "") {
      setState({ status: "ready", families: [], missing: [] });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(`/api/site/families?slugs=${encodeURIComponent(key)}`, { signal: controller.signal, credentials: "same-origin" })
      .then(async (r) => {
        if (r.status === 503) return setState({ status: "unavailable" });
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as { families: LookedUp[]; missing: string[] };
        setState({ status: "ready", families: body.families, missing: body.missing });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState({ status: "error" });
      });
    return () => controller.abort();
  }, [key]);
  return state;
}
