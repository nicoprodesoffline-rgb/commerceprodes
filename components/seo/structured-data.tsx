import { headers } from "next/headers";
import { jsonLdText } from "@/lib/seo/seo";

/** Données structurées (3.19) : un script JSON-LD échappé, avec le nonce de la requête (CSP : aucun script en ligne sans nonce). */
export async function StructuredData({ value }: { value: unknown }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: jsonLdText(value) }} />;
}
