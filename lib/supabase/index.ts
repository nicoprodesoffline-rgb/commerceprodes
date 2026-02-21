import { TAGS } from "lib/constants";
import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
} from "next/cache";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "./client";
import { calculatePrice } from "./price";
import type {
  Cart,
  CartItem,
  Collection,
  DbPriceTier,
  Image,
  Menu,
  Page,
  Product,
  ProductOption,
  ProductVariant,
} from "./types";

// ============================================================
// HELPERS
// ============================================================

function buildImage(img: {
  url: string;
  alt_text?: string | null;
  position?: number;
  is_featured?: boolean;
}, fallbackAlt: string): Image {
  return {
    url: img.url,
    altText: img.alt_text || fallbackAlt,
    width: 800,
    height: 800,
  };
}

function emptyImage(alt: string): Image {
  return { url: "", altText: alt, width: 800, height: 800 };
}

function emptyCart(id: string): Cart {
  return {
    id,
    checkoutUrl: "/",
    totalQuantity: 0,
    lines: [],
    cost: {
      subtotalAmount: { amount: "0.00", currencyCode: "EUR" },
      totalAmount: { amount: "0.00", currencyCode: "EUR" },
      totalTaxAmount: { amount: "0.00", currencyCode: "EUR" },
    },
  };
}

/** Build a lightweight Product for list views (no variant attributes). */
function buildProductSummary(dbProduct: any): Product {
  const imgs: any[] = (dbProduct.product_images || []).sort(
    (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
  );
  const featuredImg = imgs.find((i) => i.is_featured) ?? imgs[0];
  const regularPrice = Number(dbProduct.regular_price) || 0;

  return {
    id: dbProduct.id,
    handle: dbProduct.slug,
    availableForSale: dbProduct.stock_status === "instock",
    title: dbProduct.name,
    description: dbProduct.description || "",
    descriptionHtml: dbProduct.description || "",
    options: [],
    priceRange: {
      minVariantPrice: {
        amount: regularPrice.toFixed(2),
        currencyCode: "EUR",
      },
      maxVariantPrice: {
        amount: regularPrice.toFixed(2),
        currencyCode: "EUR",
      },
    },
    variants: [
      {
        id: dbProduct.id + "-default",
        title: "Default Title",
        availableForSale: dbProduct.stock_status === "instock",
        selectedOptions: [],
        price: { amount: regularPrice.toFixed(2), currencyCode: "EUR" },
      },
    ],
    featuredImage: featuredImg
      ? buildImage(featuredImg, dbProduct.name)
      : emptyImage(dbProduct.name),
    images: imgs.map((img) => buildImage(img, dbProduct.name)),
    seo: {
      title: dbProduct.seo_title || dbProduct.name,
      description: dbProduct.seo_description || "",
    },
    tags: dbProduct.tags || [],
    updatedAt: dbProduct.updated_at,
  };
}

function dbCategoryToCollection(cat: any): Collection {
  return {
    handle: cat.slug,
    title: cat.name,
    description: cat.description || "",
    seo: {
      title: cat.seo_title || cat.name,
      description: cat.seo_description || "",
    },
    path: `/search/${cat.slug}`,
    updatedAt: cat.updated_at,
  };
}

// ============================================================
// CART — internal fetch (no cache)
// ============================================================

async function fetchCartById(cartId: string): Promise<Cart> {
  const { data: cart } = await supabase
    .from("carts")
    .select("id")
    .eq("id", cartId)
    .single();

  if (!cart) return emptyCart(cartId);

  const { data: items } = await supabase
    .from("cart_items")
    .select(
      `
      id, quantity, unit_price, variant_id,
      variants (
        id, name, stock_status,
        variant_attributes (
          attribute_id, term_slug,
          attributes (id, name)
        )
      ),
      products (
        id, slug, name,
        product_images (url, alt_text, is_featured, position)
      )
    `,
    )
    .eq("cart_id", cartId);

  if (!items?.length) return emptyCart(cartId);

  // Build term map for readable option values
  const allAttrIds = [
    ...new Set(
      items.flatMap((item: any) =>
        (item.variants?.variant_attributes || []).map(
          (va: any) => va.attribute_id,
        ),
      ),
    ),
  ] as string[];

  const termMap: Record<string, Record<string, string>> = {};
  if (allAttrIds.length > 0) {
    const { data: terms } = await supabase
      .from("attribute_terms")
      .select("attribute_id, slug, name")
      .in("attribute_id", allAttrIds);
    terms?.forEach((term: any) => {
      const entry = termMap[term.attribute_id] ?? {};
      termMap[term.attribute_id] = entry;
      entry[term.slug] = term.name;
    });
  }

  const lines: CartItem[] = items.map((item: any) => {
    const variant = item.variants;
    const product = item.products;
    const productImages: any[] = product?.product_images || [];
    const featuredImg =
      productImages.find((i: any) => i.is_featured) ?? productImages[0];

    const selectedOptions = (variant?.variant_attributes || []).map(
      (va: any) => ({
        name: va.attributes?.name || "",
        value: termMap[va.attribute_id]?.[va.term_slug] ?? va.term_slug,
      }),
    );

    return {
      id: item.id,
      quantity: item.quantity,
      cost: {
        totalAmount: {
          amount: (Number(item.unit_price) * item.quantity).toFixed(2),
          currencyCode: "EUR",
        },
      },
      merchandise: {
        id: item.variant_id,
        title: variant?.name || "Default",
        selectedOptions,
        product: {
          id: product?.id || "",
          handle: product?.slug || "",
          title: product?.name || "",
          featuredImage: featuredImg
            ? buildImage(featuredImg, product?.name || "")
            : emptyImage(product?.name || ""),
        },
      },
    };
  });

  const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0);
  const totalAmount = lines.reduce(
    (s, l) => s + Number(l.cost.totalAmount.amount),
    0,
  );

  return {
    id: cartId,
    checkoutUrl: "/",
    totalQuantity,
    lines,
    cost: {
      subtotalAmount: { amount: totalAmount.toFixed(2), currencyCode: "EUR" },
      totalAmount: { amount: totalAmount.toFixed(2), currencyCode: "EUR" },
      totalTaxAmount: { amount: "0.00", currencyCode: "EUR" },
    },
  };
}

// ============================================================
// CART — public API
// ============================================================

export async function createCart(): Promise<Cart> {
  const { data: cart, error } = await supabase
    .from("carts")
    .insert({ session_token: crypto.randomUUID() })
    .select("id")
    .single();

  if (error || !cart) throw new Error("Failed to create cart");
  return emptyCart(cart.id);
}

export async function getCart(): Promise<Cart | undefined> {
  "use cache: private";
  cacheTag(TAGS.cart);
  cacheLife("seconds");

  const cartId = (await cookies()).get("cartId")?.value;
  if (!cartId) return undefined;

  return fetchCartById(cartId);
}

export async function addToCart(
  lines: { merchandiseId: string; quantity: number }[],
): Promise<Cart> {
  let cartId = (await cookies()).get("cartId")?.value;
  if (!cartId) {
    const newCart = await createCart();
    cartId = newCart.id!;
    (await cookies()).set("cartId", cartId);
  }

  for (const { merchandiseId, quantity } of lines) {
    // Get variant + product info
    const { data: variant } = await supabase
      .from("variants")
      .select("id, regular_price, product_id, products(*)")
      .eq("id", merchandiseId)
      .single();

    if (!variant) continue;
    const product = (variant as any).products;

    // Get price tiers
    const { data: priceTiers } = await supabase
      .from("price_tiers")
      .select("*")
      .or(
        `product_id.eq.${product.id},variant_id.eq.${merchandiseId}`,
      );

    const unitPrice = calculatePrice(
      {
        regular_price: product.regular_price,
        pbq_pricing_type: product.pbq_pricing_type,
        pbq_enabled: product.pbq_enabled,
      },
      { id: variant.id, regular_price: variant.regular_price },
      (priceTiers || []) as DbPriceTier[],
      quantity,
    );

    // Upsert cart item
    const { data: existing } = await supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("cart_id", cartId)
      .eq("variant_id", merchandiseId)
      .single();

    if (existing) {
      await supabase
        .from("cart_items")
        .update({ quantity: existing.quantity + quantity, unit_price: unitPrice })
        .eq("id", existing.id);
    } else {
      await supabase.from("cart_items").insert({
        cart_id: cartId,
        product_id: product.id,
        variant_id: merchandiseId,
        quantity,
        unit_price: unitPrice,
      });
    }
  }

  return fetchCartById(cartId);
}

export async function updateCart(
  lines: { id: string; merchandiseId: string; quantity: number }[],
): Promise<Cart> {
  const cartId = (await cookies()).get("cartId")?.value;
  if (!cartId) throw new Error("No cart found");

  for (const { id, quantity } of lines) {
    if (quantity === 0) {
      await supabase.from("cart_items").delete().eq("id", id);
    } else {
      await supabase.from("cart_items").update({ quantity }).eq("id", id);
    }
  }

  return fetchCartById(cartId);
}

export async function removeFromCart(lineIds: string[]): Promise<Cart> {
  const cartId = (await cookies()).get("cartId")?.value;
  if (!cartId) throw new Error("No cart found");

  await supabase.from("cart_items").delete().in("id", lineIds);

  return fetchCartById(cartId);
}

// ============================================================
// PRODUCTS
// ============================================================

export async function getProduct(handle: string): Promise<Product | undefined> {
  "use cache";
  cacheTag(TAGS.products);
  cacheLife("days");

  // Step 1 — product + images + variants (with attribute joins)
  const { data: dbProduct, error } = await supabase
    .from("products")
    .select(
      `
      *,
      product_images (id, url, alt_text, position, is_featured),
      variants (
        *,
        variant_attributes (
          attribute_id, term_slug,
          attributes (id, name, slug)
        )
      )
    `,
    )
    .eq("slug", handle)
    .eq("status", "publish")
    .single();

  if (error || !dbProduct) return undefined;

  const variants: any[] = dbProduct.variants || [];
  const variantIds: string[] = variants.map((v: any) => v.id);

  // Step 2 — attribute terms (for readable option values)
  const allAttrIds = [
    ...new Set(
      variants.flatMap((v: any) =>
        (v.variant_attributes || []).map((va: any) => va.attribute_id),
      ),
    ),
  ] as string[];

  const termMap: Record<string, Record<string, string>> = {};
  if (allAttrIds.length > 0) {
    const { data: terms } = await supabase
      .from("attribute_terms")
      .select("attribute_id, slug, name")
      .in("attribute_id", allAttrIds);
    terms?.forEach((t: any) => {
      const entry = termMap[t.attribute_id] ?? {};
      termMap[t.attribute_id] = entry;
      entry[t.slug] = t.name;
    });
  }

  // Step 3 — product_attributes for VariantSelector options
  const { data: productAttrs } = await supabase
    .from("product_attributes")
    .select("attribute_id, terms, attributes (id, name, slug)")
    .eq("product_id", dbProduct.id)
    .eq("is_variation", true);

  // Step 4 — price_tiers (product-level + variant-level)
  let priceTiers: DbPriceTier[] = [];
  if (variantIds.length > 0) {
    const { data: tiers } = await supabase
      .from("price_tiers")
      .select("*")
      .or(
        `product_id.eq.${dbProduct.id},variant_id.in.(${variantIds.join(",")})`,
      );
    priceTiers = (tiers || []) as DbPriceTier[];
  } else {
    const { data: tiers } = await supabase
      .from("price_tiers")
      .select("*")
      .eq("product_id", dbProduct.id);
    priceTiers = (tiers || []) as DbPriceTier[];
  }

  // Build options (for VariantSelector)
  const options: ProductOption[] = (productAttrs || []).map((pa: any) => ({
    id: pa.attribute_id,
    name: pa.attributes?.name || pa.attribute_id,
    values: (pa.terms || []).map(
      (slug: string) => termMap[pa.attribute_id]?.[slug] ?? slug,
    ),
  }));

  // Build variants
  const publishedVariants = variants.filter((v: any) => v.status === "publish");
  const productVariants: ProductVariant[] = publishedVariants.map((v: any) => {
    const price =
      v.regular_price != null
        ? Number(v.regular_price)
        : Number(dbProduct.regular_price) || 0;

    const selectedOptions = (v.variant_attributes || []).map((va: any) => ({
      name: va.attributes?.name || "",
      value: termMap[va.attribute_id]?.[va.term_slug] ?? va.term_slug,
    }));

    return {
      id: v.id,
      title: v.name,
      availableForSale: v.stock_status === "instock",
      selectedOptions,
      price: { amount: price.toFixed(2), currencyCode: "EUR" },
    };
  });

  // Fallback default variant for simple products
  if (productVariants.length === 0) {
    productVariants.push({
      id: dbProduct.id + "-default",
      title: "Default Title",
      availableForSale: dbProduct.stock_status === "instock",
      selectedOptions: [],
      price: {
        amount: (Number(dbProduct.regular_price) || 0).toFixed(2),
        currencyCode: "EUR",
      },
    });
  }

  // Images
  const sortedImgs: any[] = (dbProduct.product_images || []).sort(
    (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
  );
  const featuredImg =
    sortedImgs.find((i: any) => i.is_featured) ?? sortedImgs[0];

  // Price range
  const prices = productVariants
    .map((v) => Number(v.price.amount))
    .filter((p) => p > 0);
  const base = Number(dbProduct.regular_price) || 0;
  const allPrices = prices.length > 0 ? prices : [base];
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);

  return {
    id: dbProduct.id,
    handle: dbProduct.slug,
    availableForSale: dbProduct.stock_status === "instock",
    title: dbProduct.name,
    description: dbProduct.description || "",
    descriptionHtml: dbProduct.description || "",
    options,
    priceRange: {
      minVariantPrice: { amount: minPrice.toFixed(2), currencyCode: "EUR" },
      maxVariantPrice: { amount: maxPrice.toFixed(2), currencyCode: "EUR" },
    },
    variants: productVariants,
    featuredImage: featuredImg
      ? buildImage(featuredImg, dbProduct.name)
      : emptyImage(dbProduct.name),
    images:
      sortedImgs.length > 0
        ? sortedImgs.map((img) => buildImage(img, dbProduct.name))
        : [emptyImage(dbProduct.name)],
    seo: {
      title: dbProduct.seo_title || dbProduct.name,
      description: dbProduct.seo_description || "",
    },
    tags: dbProduct.tags || [],
    updatedAt: dbProduct.updated_at,
  };
}

export async function getProducts({
  query,
  category,
  sortKey = "RELEVANCE",
  reverse = false,
  limit = 250,
}: {
  query?: string;
  category?: string;
  sortKey?: string;
  reverse?: boolean;
  limit?: number;
} = {}): Promise<Product[]> {
  "use cache";
  cacheTag(TAGS.products);
  cacheLife("days");

  // Optional category filter via product_categories pivot
  let productIds: string[] | null = null;
  if (category) {
    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", category)
      .single();

    if (cat) {
      const { data: catProducts } = await supabase
        .from("product_categories")
        .select("product_id")
        .eq("category_id", cat.id);
      productIds = (catProducts || []).map((cp: any) => cp.product_id);
    } else {
      return [];
    }
  }

  let dbQuery = supabase
    .from("products")
    .select(
      `
      id, slug, name, description, regular_price, stock_status,
      tags, seo_title, seo_description, updated_at,
      product_images (url, alt_text, is_featured, position)
    `,
    )
    .eq("status", "publish");

  if (query) {
    dbQuery = dbQuery.ilike("name", `%${query}%`);
  }

  if (productIds !== null) {
    if (productIds.length === 0) return [];
    dbQuery = dbQuery.in("id", productIds);
  }

  const ascending = !reverse;
  switch (sortKey) {
    case "PRICE":
      dbQuery = dbQuery.order("regular_price", { ascending });
      break;
    case "CREATED_AT":
      dbQuery = dbQuery.order("created_at", { ascending });
      break;
    case "BEST_SELLING":
      dbQuery = dbQuery
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false });
      break;
    default:
      dbQuery = dbQuery.order("created_at", { ascending: false });
  }

  dbQuery = dbQuery.limit(limit);

  const { data: products, error } = await dbQuery;
  if (error || !products) return [];

  return products.map(buildProductSummary);
}

export async function getProductRecommendations(
  productId: string,
): Promise<Product[]> {
  "use cache";
  cacheTag(TAGS.products);
  cacheLife("days");

  const { data: productCats } = await supabase
    .from("product_categories")
    .select("category_id")
    .eq("product_id", productId);

  const PRODUCT_SELECT = `
    id, slug, name, description, regular_price, stock_status,
    tags, seo_title, seo_description, updated_at,
    product_images (url, alt_text, is_featured, position)
  `;

  if (!productCats?.length) {
    const { data } = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("status", "publish")
      .neq("id", productId)
      .limit(4);
    return (data || []).map(buildProductSummary);
  }

  const categoryIds = productCats.map((pc: any) => pc.category_id);

  const { data: catProducts } = await supabase
    .from("product_categories")
    .select("product_id")
    .in("category_id", categoryIds)
    .neq("product_id", productId)
    .limit(20);

  const relatedIds = [
    ...new Set((catProducts || []).map((cp: any) => cp.product_id)),
  ].slice(0, 4) as string[];

  if (relatedIds.length === 0) return [];

  const { data } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .in("id", relatedIds)
    .eq("status", "publish");

  return (data || []).map(buildProductSummary);
}

// ============================================================
// COLLECTIONS (= Categories)
// ============================================================

export async function getCollection(
  handle: string,
): Promise<Collection | undefined> {
  "use cache";
  cacheTag(TAGS.collections);
  cacheLife("days");

  const { data: cat, error } = await supabase
    .from("categories")
    .select("*")
    .eq("slug", handle)
    .single();

  if (error || !cat) return undefined;
  return dbCategoryToCollection(cat);
}

export async function getCollections(): Promise<Collection[]> {
  "use cache";
  cacheTag(TAGS.collections);
  cacheLife("days");

  const allColl: Collection = {
    handle: "",
    title: "All",
    description: "All products",
    seo: { title: "All", description: "All products" },
    path: "/search",
    updatedAt: new Date().toISOString(),
  };

  const { data: cats, error } = await supabase
    .from("categories")
    .select("*")
    .order("position");

  if (error || !cats) return [allColl];

  const collections = cats
    .filter((cat: any) => !cat.slug.startsWith("hidden"))
    .map(dbCategoryToCollection);

  return [allColl, ...collections];
}

export async function getCollectionProducts({
  collection,
  reverse = false,
  sortKey = "RELEVANCE",
}: {
  collection: string;
  reverse?: boolean;
  sortKey?: string;
}): Promise<Product[]> {
  "use cache";
  cacheTag(TAGS.collections, TAGS.products);
  cacheLife("days");

  // Hidden collections fall back to featured/recent products
  if (collection.startsWith("hidden-")) {
    return getProducts({ sortKey: "CREATED_AT", reverse: true, limit: 12 });
  }

  return getProducts({ category: collection, sortKey, reverse });
}

// ============================================================
// MENU
// ============================================================

export async function getMenu(handle: string): Promise<Menu[]> {
  "use cache";
  cacheTag(TAGS.collections);
  cacheLife("days");

  const { data: menu, error } = await supabase
    .from("menus")
    .select("id")
    .eq("handle", handle)
    .single();

  if (error || !menu) return [];

  const { data: items } = await supabase
    .from("menu_items")
    .select("title, url, position")
    .eq("menu_id", menu.id)
    .is("parent_id", null)
    .order("position");

  return (items || []).map((item: any) => ({
    title: item.title,
    path: item.url,
  }));
}

// ============================================================
// PAGES
// ============================================================

export async function getPage(handle: string): Promise<Page> {
  const { data: page, error } = await supabase
    .from("pages")
    .select("*")
    .eq("handle", handle)
    .single();

  if (error || !page) {
    return {
      id: "",
      title: handle,
      handle,
      body: "",
      bodySummary: "",
      seo: { title: handle, description: "" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    id: page.id,
    title: page.title,
    handle: page.handle,
    body: page.body || "",
    bodySummary: page.body_summary || "",
    seo: {
      title: page.seo_title || page.title,
      description: page.seo_description || "",
    },
    createdAt: page.created_at,
    updatedAt: page.updated_at,
  };
}

export async function getPages(): Promise<Page[]> {
  const { data: pages, error } = await supabase
    .from("pages")
    .select("*")
    .order("created_at");

  if (error || !pages) return [];

  return pages.map((page: any) => ({
    id: page.id,
    title: page.title,
    handle: page.handle,
    body: page.body || "",
    bodySummary: page.body_summary || "",
    seo: {
      title: page.seo_title || page.title,
      description: page.seo_description || "",
    },
    createdAt: page.created_at,
    updatedAt: page.updated_at,
  }));
}

// ============================================================
// REVALIDATE (stub — no Shopify webhooks)
// ============================================================

export async function revalidate(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json({ status: 200 });
}
