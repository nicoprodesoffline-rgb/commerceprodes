import type { MetadataRoute } from "next";
import { supabase } from "lib/supabase/client";
import { baseUrl } from "lib/utils";

export const revalidate = 3600; // 1h

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/search`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/devis-express`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/faq`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    {
      url: `${baseUrl}/mentions-legales`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  try {
    const [catResult, prodResult] = await Promise.allSettled([
      supabase
        .from("categories")
        .select("slug, updated_at")
        .order("position", { ascending: true }),
      supabase
        .from("products")
        .select("slug, updated_at")
        .eq("status", "publish")
        .order("updated_at", { ascending: false })
        .limit(5000),
    ]);

    const categoryPages: MetadataRoute.Sitemap =
      catResult.status === "fulfilled"
        ? (catResult.value.data || []).map((cat: { slug: string; updated_at: string | null }) => ({
            url: `${baseUrl}/search/${cat.slug}`,
            lastModified: cat.updated_at ? new Date(cat.updated_at) : new Date(),
            changeFrequency: "weekly" as const,
            priority: 0.9,
          }))
        : [];

    const productPages: MetadataRoute.Sitemap =
      prodResult.status === "fulfilled"
        ? (prodResult.value.data || []).map((p: { slug: string; updated_at: string | null }) => ({
            url: `${baseUrl}/product/${p.slug}`,
            lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
            changeFrequency: "weekly" as const,
            priority: 0.8,
          }))
        : [];

    return [...staticPages, ...categoryPages, ...productPages];
  } catch {
    return staticPages;
  }
}
