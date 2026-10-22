import Footer from "components/layout/footer";
import { Breadcrumbs } from "components/layout/breadcrumbs";
import { Gallery } from "components/product/gallery";
import { ProductDescription, ProductDescriptionTabs } from "components/product/product-description";
import { getCategories, getFamilyBySlug, getNowUtc } from "lib/site-dto";
import { resolveVariant, selectionFromParams } from "lib/site-dto/variants";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export async function generateMetadata(props: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const family = getFamilyBySlug(params.handle);

  if (!family) return notFound();

  return {
    title: `${family.name} – PRODES`,
    description: family.description_short.slice(0, 160),
    alternates: {
      canonical: `/product/${params.handle}`,
    },
    // Fixture provisoire : jamais indexée.
    robots: { index: false, follow: false },
  };
}

export default async function ProductPage(props: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const family = getFamilyBySlug(params.handle);

  if (!family) return notFound();

  const nowUtc = getNowUtc();
  const category = getCategories().find((c) => c.category_key === family.primary_category_key);
  const selection = selectionFromParams(family, (k) => {
    const v = searchParams[k];
    return typeof v === "string" ? v : null;
  });
  const resolved = resolveVariant(family, selection);

  // Image Famille en premier, puis médias propres à l'item sélectionné.
  const images = [
    { src: family.image_main_url, altText: `${family.name} — image famille` },
    ...(resolved.ok
      ? resolved.item.media_urls.map((src) => ({
          src,
          altText: `${family.name} — ${Object.values(resolved.item.variant_axes).join(" / ")}`,
        }))
      : []),
  ];

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    name: family.name,
    description: family.description_short,
    productGroupID: family.public_family_key,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd),
        }}
      />
      <div className="mx-auto max-w-(--breakpoint-2xl) px-4">
        <div className="pt-4 pb-3">
          <Breadcrumbs
            items={[
              { label: "Accueil", href: "/" },
              category
                ? { label: category.name, href: `/search/${category.slug}` }
                : { label: "Catalogue", href: "/search" },
              { label: family.name },
            ]}
          />
        </div>
        <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 sm:p-8 md:p-12 lg:flex-row lg:gap-8">
          <div className="h-full w-full basis-full lg:basis-4/6">
            <Suspense
              fallback={
                <div className="relative aspect-square h-full max-h-[550px] w-full overflow-hidden" />
              }
            >
              <Gallery images={images} />
            </Suspense>
          </div>

          <div className="basis-full lg:basis-2/6">
            <Suspense fallback={null}>
              <ProductDescription family={family} nowUtc={nowUtc} />
            </Suspense>
          </div>
        </div>

        <ProductDescriptionTabs family={family} />
      </div>

      <Footer />
    </>
  );
}
