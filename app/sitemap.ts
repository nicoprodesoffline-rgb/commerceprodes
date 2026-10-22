import type { MetadataRoute } from "next";
import { getCategories, getFamilies } from "lib/site-dto";
import { baseUrl } from "lib/utils";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/search`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/faq`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/contact`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/mentions-legales`, changeFrequency: "yearly", priority: 0.3 },
  ];
  const categoryPages: MetadataRoute.Sitemap = getCategories().map((c) => ({
    url: `${baseUrl}/search/${c.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));
  const familyPages: MetadataRoute.Sitemap = getFamilies().map((f) => ({
    url: `${baseUrl}/product/${f.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
  return [...staticPages, ...categoryPages, ...familyPages];
}
