// ============================================================
// Public API types — same shape as lib/shopify/types for
// full component compatibility (only import paths need to change)
// ============================================================

export type Maybe<T> = T | null;

export type Money = {
  amount: string;
  currencyCode: string;
};

export type Image = {
  url: string;
  altText: string;
  width: number;
  height: number;
};

export type SEO = {
  title: string;
  description: string;
};

export type ProductOption = {
  id: string;
  name: string;
  values: string[];
};

export type ProductVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  selectedOptions: {
    name: string;
    value: string;
  }[];
  price: Money;
};

export type CartProduct = {
  id: string;
  handle: string;
  title: string;
  featuredImage: Image;
};

export type CartItem = {
  id: string | undefined;
  quantity: number;
  cost: {
    totalAmount: Money;
  };
  merchandise: {
    id: string;
    title: string;
    selectedOptions: {
      name: string;
      value: string;
    }[];
    product: CartProduct;
  };
};

export type Cart = {
  id: string | undefined;
  checkoutUrl: string;
  cost: {
    subtotalAmount: Money;
    totalAmount: Money;
    totalTaxAmount: Money;
  };
  lines: CartItem[];
  totalQuantity: number;
};

export type Collection = {
  handle: string;
  title: string;
  description: string;
  seo: SEO;
  path: string;
  updatedAt: string;
};

export type Menu = {
  title: string;
  path: string;
};

export type Page = {
  id: string;
  title: string;
  handle: string;
  body: string;
  bodySummary: string;
  seo?: SEO;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  handle: string;
  availableForSale: boolean;
  title: string;
  description: string;
  descriptionHtml: string;
  options: ProductOption[];
  priceRange: {
    maxVariantPrice: Money;
    minVariantPrice: Money;
  };
  variants: ProductVariant[];
  featuredImage: Image;
  images: Image[];
  seo: SEO;
  tags: string[];
  updatedAt: string;
};

// ============================================================
// Raw Supabase DB types (for internal use in index.ts)
// ============================================================

export type DbPriceTier = {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  min_quantity: number;
  price: number | null;
  discount_percent: number | null;
  position: number;
};

export type DbProduct = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  short_description: string | null;
  type: "simple" | "variable";
  status: "publish" | "draft" | "private";
  featured: boolean;
  regular_price: number | null;
  sale_price: number | null;
  stock_status: "instock" | "outofstock" | "onbackorder";
  pbq_enabled: boolean;
  pbq_pricing_type: "fixed" | "percentage" | null;
  seo_title: string | null;
  seo_description: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type DbVariant = {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  regular_price: number | null;
  sale_price: number | null;
  stock_status: "instock" | "outofstock" | "onbackorder";
  min_order_quantity: number;
  status: "publish" | "draft" | "private";
  position: number;
  created_at: string;
  updated_at: string;
};

export type DbCategory = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  image_url: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};
