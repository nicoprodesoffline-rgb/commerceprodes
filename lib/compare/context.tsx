"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

interface CompareContextType {
  compareList: string[];
  addToCompare: (handle: string) => void;
  removeFromCompare: (handle: string) => void;
  clearCompare: () => void;
  isInCompare: (handle: string) => boolean;
}

const CompareContext = createContext<CompareContextType>({
  compareList: [],
  addToCompare: () => {},
  removeFromCompare: () => {},
  clearCompare: () => {},
  isInCompare: () => false,
});

const STORAGE_KEY = "prodes_compare";
const MAX_COMPARE = 4;

export function CompareProvider({ children }: { children: ReactNode }) {
  const [compareList, setCompareList] = useState<string[]>([]);

  // Load from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed)) {
          setCompareList(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  function persist(list: string[]) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
    setCompareList(list);
  }

  const addToCompare = useCallback(
    (handle: string) => {
      if (compareList.includes(handle)) return;
      if (compareList.length >= MAX_COMPARE) {
        toast.error("Maximum 4 produits dans le comparateur");
        return;
      }
      persist([...compareList, handle]);
    },
    [compareList],
  );

  const removeFromCompare = useCallback(
    (handle: string) => {
      persist(compareList.filter((h) => h !== handle));
    },
    [compareList],
  );

  const clearCompare = useCallback(() => {
    persist([]);
  }, []);

  const isInCompare = useCallback(
    (handle: string) => compareList.includes(handle),
    [compareList],
  );

  return (
    <CompareContext.Provider
      value={{ compareList, addToCompare, removeFromCompare, clearCompare, isInCompare }}
    >
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  return useContext(CompareContext);
}
