"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const WISHLIST_KEY = "prodes_wishlist";

type WishlistContextType = {
  wishlist: string[];
  toggle: (handle: string) => void;
  isWishlisted: (handle: string) => boolean;
  count: number;
};

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(WISHLIST_KEY);
      if (saved) setWishlist(JSON.parse(saved));
    } catch {
      // ignore
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
    } catch {
      // ignore
    }
  }, [wishlist, mounted]);

  const toggle = useCallback((handle: string) => {
    setWishlist((prev) =>
      prev.includes(handle) ? prev.filter((h) => h !== handle) : [...prev, handle],
    );
  }, []);

  const isWishlisted = useCallback(
    (handle: string) => wishlist.includes(handle),
    [wishlist],
  );

  const value = useMemo(
    () => ({ wishlist, toggle, isWishlisted, count: wishlist.length }),
    [wishlist, toggle, isWishlisted],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within WishlistProvider");
  return ctx;
}
