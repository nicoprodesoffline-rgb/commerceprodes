import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { supabase } from "lib/supabase/client";
import ProductDescriptionEditor from "./editor";

export default async function AdminProductDetailPage(props: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await props.params;

  const { data: product } = await supabase
    .from("products")
    .select(
      `
      id, name, slug, status, sku, description, short_description,
      regular_price, stock_status, pbq_enabled,
      product_images (url, is_featured, position, alt_text),
      product_categories (
        categories (id, name, slug)
      ),
      product_variants: variants (
        id, sku, name, regular_price, stock_status, position,
        variant_attributes (
          attribute_id, term_slug,
          attributes (name)
        )
      ),
      price_tiers (min_quantity, price, discount_percent, position)
    `,
    )
    .eq("slug", handle)
    .single();

  if (!product) return notFound();

  const imgs: any[] = ((product as any).product_images || []).sort(
    (a: any, b: any) => a.position - b.position,
  );
  const featuredImg = imgs.find((i) => i.is_featured) ?? imgs[0];
  const cats = ((product as any).product_categories || [])
    .map((pc: any) => pc.categories)
    .filter(Boolean);
  const variants = ((product as any).product_variants || []).sort(
    (a: any, b: any) => a.position - b.position,
  );
  const tiers = ((product as any).price_tiers || []).sort(
    (a: any, b: any) => a.position - b.position,
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/admin/products" className="text-sm text-gray-500 hover:text-blue-600">
          ← Retour aux produits
        </Link>
      </div>

      {/* En-tête */}
      <div className="flex gap-4 items-start">
        {featuredImg && (
          <Image
            src={featuredImg.url}
            alt={(product as any).name}
            width={80}
            height={80}
            className="rounded-lg border border-gray-200 object-contain"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{(product as any).name}</h1>
          <div className="flex gap-3 mt-1 text-sm text-gray-500">
            <span>SKU : {(product as any).sku || "—"}</span>
            <span>
              Statut :{" "}
              <span className={(product as any).status === "publish" ? "text-green-600" : "text-gray-500"}>
                {(product as any).status === "publish" ? "Publié" : "Brouillon"}
              </span>
            </span>
          </div>
          <div className="mt-2">
            <Link
              href={`/product/${handle}`}
              target="_blank"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Voir la fiche publique →
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Variants */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900 mb-4">
            Variantes ({variants.length})
          </h2>
          {variants.length === 0 ? (
            <p className="text-sm text-gray-500">Produit simple (pas de variantes)</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="pb-2 text-left">SKU</th>
                    <th className="pb-2 text-left">Options</th>
                    <th className="pb-2 text-right">Prix HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {variants.map((v: any) => (
                    <tr key={v.id}>
                      <td className="py-1.5 font-mono text-gray-600">{v.sku}</td>
                      <td className="py-1.5 text-gray-500">
                        {(v.variant_attributes || [])
                          .map((va: any) => `${va.attributes?.name}: ${va.term_slug}`)
                          .join(", ") || "—"}
                      </td>
                      <td className="py-1.5 text-right text-gray-800">
                        {v.regular_price
                          ? new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(v.regular_price) + " €"
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Price tiers */}
          {tiers.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Tarifs dégressifs</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="pb-1 text-left">Qté min</th>
                    <th className="pb-1 text-right">Prix / Remise</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t: any, i: number) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-1">{t.min_quantity}+</td>
                      <td className="py-1 text-right">
                        {t.price != null
                          ? new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(t.price) + " €"
                          : t.discount_percent != null
                          ? `-${t.discount_percent}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Catégories */}
          {cats.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Catégories</h3>
              <div className="flex flex-wrap gap-1">
                {cats.map((cat: any) => (
                  <span key={cat.id} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {cat.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Édition description */}
        <ProductDescriptionEditor
          handle={handle}
          description={(product as any).description || ""}
          shortDescription={(product as any).short_description || ""}
        />
      </div>
    </div>
  );
}
