"use client";
import { useEffect, useRef } from "react";
import { emitMetric } from "@/lib/site-metrics/browser";
import type { BrowserMetric } from "@/lib/site-metrics/core";
/** Une ouverture par montage, après restauration du panier ; résiste au rejeu des effets React. */
export function useOpeningMetrics(event: BrowserMetric, keys: readonly string[], ready = true): void {
  const opened = useRef(false);
  useEffect(() => {
    if (!ready || opened.current) return;
    opened.current = true;
    for (const key of new Set(keys)) emitMetric(key, event);
  }, [event, keys, ready]);
}
