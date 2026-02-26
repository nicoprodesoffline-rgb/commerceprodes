import type { Metadata } from "next";
import Link from "next/link";
import { getProduct } from "lib/supabase/index";
import type { Product } from "lib/supabase/types";
import CompareClient from "./compare-client";

export const metadata: Metadata = {
  title: "Comparateur produits | PRODES",
  description: "Comparez côte à côte les caractéristiques et les prix de nos produits.",
  robots: { index: false, follow: false },
};

export default async function ComparePage(props: {
  searchParams: Promise<{ handles?: string }>;
}) {
  const searchParams = await props.searchParams;
  const handlesParam = searchParams.handles ?? "";
  const handles = handlesParam
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
    .slice(0, 4);

  const products: Product[] = [];
  if (handles.length > 0) {
    const results = await Promise.allSettled(handles.map((h) => getProduct(h)));
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        products.push(result.value);
      }
    }
  }

  return <CompareClient products={products} />;
}
