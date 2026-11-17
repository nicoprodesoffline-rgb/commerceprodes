import type { MetadataRoute } from "next";
import { robotsFile } from "@/lib/seo/seo";

export const dynamic = "force-dynamic";

/** `/robots.txt` (3.19, S10) : tout interdit tant que le site est fermé aux moteurs ; ouvert, tout sauf les adresses privées. */
export default function robots(): MetadataRoute.Robots {
  return robotsFile(process.env);
}
