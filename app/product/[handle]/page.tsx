import { GridTileImage } from "components/grid/tile";
import Footer from "components/layout/footer";
import { Breadcrumbs } from "components/layout/breadcrumbs";
import { Gallery } from "components/product/gallery";
import { ProductDescription, ProductDescriptionTabs } from "components/product/product-description";
import { RecentlyViewed } from "components/product/recently-viewed";
import { HIDDEN_PRODUCT_TAG } from "lib/constants";
import { getProduct, getProductRecommendations } from "lib/supabase";
import type { Image } from "lib/supabase/types";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export async function generateMetadata(props: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const product = await getProduct(params.handle);

  if (!product) return notFound();

  const { url, width, height, altText: alt } = product.featuredImage || {};
  const indexable = !product.tags.includes(HIDDEN_PRODUCT_TAG);

  const rawDescription = product.shortDescription || product.seo.description || product.description || "";
  const metaDescription = rawDescription.length > 160
    ? rawDescription.slice(0, 157) + "…"
    : rawDescription;

  return {
    title: `${product.seo.title || product.title} – PRODES`,
    description: metaDescription,
    alternates: {
      canonical: `/product/${params.handle}`,
    },
    robots: {
      index: indexable,
      follow: indexable,
      googleBot: {
        index: indexable,
        follow: indexable,
      },
    },
    openGraph: url
      ? {
          title: `${product.title} – PRODES`,
          description: metaDescription,
          images: [{ url, width, height, alt }],
          type: "website",
        }
      : null,
    twitter: url
      ? {
          card: "summary_large_image",
          title: `${product.title} – PRODES`,
          description: metaDescription,
          images: [url],
        }
      : null,
  };
}

export default async function ProductPage(props: {
  params: Promise<{ handle: string }>;
}) {
  const params = await props.params;
  const product = await getProduct(params.handle);

  if (!product) return notFound();

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    image: product.featuredImage?.url,
    ...(product.sku ? { sku: product.sku } : {}),
    brand: { "@type": "Brand", name: "PRODES" },
    ...(product.categoryName ? { category: product.categoryName } : {}),
    offers: {
      "@type": "AggregateOffer",
      availability: product.availableForSale
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      priceCurrency: product.priceRange.minVariantPrice.currencyCode,
      highPrice: product.priceRange.maxVariantPrice.amount,
      lowPrice: product.priceRange.minVariantPrice.amount,
    },
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
        {/* Breadcrumbs SEO */}
        <div className="pt-4 pb-3">
          <Breadcrumbs
            items={[
              { label: "Accueil", href: "/" },
              product.categoryName
                ? { label: product.categoryName, href: "/search" }
                : { label: "Catalogue", href: "/search" },
              { label: product.title },
            ]}
          />
        </div>
        <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-8 md:p-12 lg:flex-row lg:gap-8">
          <div className="h-full w-full basis-full lg:basis-4/6">
            <Suspense
              fallback={
                <div className="relative aspect-square h-full max-h-[550px] w-full overflow-hidden" />
              }
            >
              <Gallery
                images={product.images.slice(0, 5).map((image: Image) => ({
                  src: image.url,
                  altText: image.altText,
                }))}
              />
            </Suspense>
          </div>

          <div className="basis-full lg:basis-2/6">
            <Suspense fallback={null}>
              <ProductDescription product={product} />
            </Suspense>
          </div>
        </div>

        {/* Description + Caractéristiques en pleine largeur */}
        <Suspense fallback={null}>
          <ProductDescriptionTabs product={product} />
        </Suspense>

        <RelatedProducts id={product.id} />
        <Suspense fallback={null}>
          <RecentlyViewed currentHandle={product.handle} />
        </Suspense>
      </div>

      <Footer />
    </>
  );
}

async function RelatedProducts({ id }: { id: string }) {
  const relatedProducts = await getProductRecommendations(id);

  if (!relatedProducts.length) return null;

  return (
    <div className="py-8">
      <h2 className="mb-4 text-2xl font-bold">Produits similaires</h2>
      <ul className="flex w-full gap-4 overflow-x-auto pt-1">
        {relatedProducts.map((product) => (
          <li
            key={product.handle}
            className="aspect-square w-full flex-none min-[475px]:w-1/2 sm:w-1/3 md:w-1/4 lg:w-1/5"
          >
            <Link
              className="relative h-full w-full"
              href={`/product/${product.handle}`}
              prefetch={true}
            >
              <GridTileImage
                alt={product.title}
                label={{
                  title: product.title,
                  amount: product.priceRange.maxVariantPrice.amount,
                  currencyCode: product.priceRange.maxVariantPrice.currencyCode,
                }}
                src={product.featuredImage?.url}
                fill
                sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, (min-width: 475px) 50vw, 100vw"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
