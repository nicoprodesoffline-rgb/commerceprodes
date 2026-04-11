/**
 * Helpers to check if family / variation tables exist (degraded mode support).
 * Returns { available: true } if migration 016/017 was applied,
 * { available: false, reason: "MIGRATION_REQUIRED" } otherwise.
 */
import { supabaseServer } from "lib/supabase/client";

export interface DbStatus {
  available: boolean;
  reason?: string;
  table?: string;
}

/** Check that a given table exists by querying it with limit 0 */
async function tableExists(table: string): Promise<boolean> {
  const client = supabaseServer();
  const { error } = await client
    .from(table as never)
    .select("id")
    .limit(0);
  // 42P01 = undefined_table
  if (error && error.code === "42P01") return false;
  return true;
}

export async function checkFamiliesDb(): Promise<DbStatus> {
  const exists = await tableExists("product_families");
  if (!exists) {
    return {
      available: false,
      reason: "MIGRATION_REQUIRED",
      table: "product_families",
    };
  }
  return { available: true };
}

export async function checkVariationsDb(): Promise<DbStatus> {
  // Migration 017 adds columns to variants — check a specific column
  const client = supabaseServer();
  const { error } = await client
    .from("variants")
    .select("gtin_upc_ean_isbn")
    .limit(0);
  if (error && (error.code === "42703" || error.code === "42P01")) {
    return {
      available: false,
      reason: "MIGRATION_REQUIRED",
      table: "variants (missing commercial fields)",
    };
  }
  return { available: true };
}

export async function checkCommercialPricingDb(): Promise<DbStatus> {
  const client = supabaseServer();

  const promoCheck = await client
    .from("product_promotion_layers")
    .select("id")
    .limit(0);
  if (
    promoCheck.error &&
    (promoCheck.error.code === "42703" || promoCheck.error.code === "42P01")
  ) {
    return {
      available: false,
      reason: "MIGRATION_REQUIRED",
      table: "product_promotion_layers",
    };
  }

  const rulesCheck = await client
    .from("pricing_attribute_rules")
    .select("id")
    .limit(0);
  if (
    rulesCheck.error &&
    (rulesCheck.error.code === "42703" || rulesCheck.error.code === "42P01")
  ) {
    return {
      available: false,
      reason: "MIGRATION_REQUIRED",
      table: "pricing_attribute_rules",
    };
  }

  return { available: true };
}

export async function checkLotPricingDb(): Promise<DbStatus> {
  const client = supabaseServer();

  const profilesCheck = await client
    .from("product_pricing_profiles")
    .select("id")
    .limit(0);
  if (
    profilesCheck.error &&
    (profilesCheck.error.code === "42703" ||
      profilesCheck.error.code === "42P01")
  ) {
    return {
      available: false,
      reason: "MIGRATION_REQUIRED",
      table: "product_pricing_profiles",
    };
  }

  const offersCheck = await client
    .from("product_lot_offers")
    .select("id")
    .limit(0);
  if (
    offersCheck.error &&
    (offersCheck.error.code === "42703" || offersCheck.error.code === "42P01")
  ) {
    return {
      available: false,
      reason: "MIGRATION_REQUIRED",
      table: "product_lot_offers",
    };
  }

  return { available: true };
}

export function degradedResponse(status: DbStatus) {
  return {
    available: false,
    reason: status.reason ?? "MIGRATION_REQUIRED",
    table: status.table,
    message:
      "Appliquez la migration SQL dans Supabase Dashboard puis rechargez.",
  };
}
