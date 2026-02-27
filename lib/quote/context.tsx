"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export interface QuoteItem {
  handle: string;
  title: string;
  sku: string | null;
  quantity: number;
  price: number | null;
  imageUrl?: string | null;
}

interface QuoteContextType {
  quoteItems: QuoteItem[];
  quoteCount: number;
  addToQuote: (item: Omit<QuoteItem, "quantity"> & { quantity?: number }) => void;
  removeFromQuote: (handle: string) => void;
  updateQuantity: (handle: string, quantity: number) => void;
  clearQuote: () => void;
  isInQuote: (handle: string) => boolean;
}

const QuoteContext = createContext<QuoteContextType>({
  quoteItems: [],
  quoteCount: 0,
  addToQuote: () => {},
  removeFromQuote: () => {},
  updateQuantity: () => {},
  clearQuote: () => {},
  isInQuote: () => false,
});

const STORAGE_KEY = "prodes_quote";

export function QuoteProvider({ children }: { children: ReactNode }) {
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as QuoteItem[];
        if (Array.isArray(parsed)) setQuoteItems(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  function persist(items: QuoteItem[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
    setQuoteItems(items);
  }

  const addToQuote = useCallback((item: Omit<QuoteItem, "quantity"> & { quantity?: number }) => {
    setQuoteItems((prev) => {
      const existing = prev.find((i) => i.handle === item.handle);
      let next: QuoteItem[];
      if (existing) {
        next = prev.map((i) =>
          i.handle === item.handle
            ? { ...i, quantity: i.quantity + (item.quantity ?? 1) }
            : i,
        );
      } else {
        next = [...prev, { ...item, quantity: item.quantity ?? 1 }];
      }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const removeFromQuote = useCallback((handle: string) => {
    setQuoteItems((prev) => {
      const next = prev.filter((i) => i.handle !== handle);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const updateQuantity = useCallback((handle: string, quantity: number) => {
    if (quantity < 1) return;
    setQuoteItems((prev) => {
      const next = prev.map((i) => (i.handle === handle ? { ...i, quantity } : i));
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const clearQuote = useCallback(() => {
    persist([]);
  }, []);

  const isInQuote = useCallback((handle: string) => {
    return quoteItems.some((i) => i.handle === handle);
  }, [quoteItems]);

  return (
    <QuoteContext.Provider value={{
      quoteItems,
      quoteCount: quoteItems.reduce((sum, i) => sum + i.quantity, 0),
      addToQuote,
      removeFromQuote,
      updateQuantity,
      clearQuote,
      isInQuote,
    }}>
      {children}
    </QuoteContext.Provider>
  );
}

export function useQuote() {
  return useContext(QuoteContext);
}
