import { NextResponse } from "next/server";

/**
 * GET /api/auth/register/status
 * Returns whether the customer_accounts table is available.
 * Used by /inscription and checkout to show degraded-mode banners.
 */
export async function GET() {
  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();
    const { error } = await client
      .from("customer_accounts")
      .select("id")
      .limit(1);

    if (error) {
      const errAny = error as unknown as Record<string, unknown>;
      const code = errAny.code as string | undefined;
      const msg = (error.message ?? "").toLowerCase();
      const isMissing =
        code === "42P01" ||
        msg.includes("does not exist") ||
        msg.includes("schema cache") ||
        msg.includes("could not find the table");
      return NextResponse.json(
        {
          available: false,
          reason: isMissing ? "MIGRATION_REQUIRED" : "DB_ERROR",
          ...(isMissing
            ? {
                action:
                  "Appliquer docs/sql-migrations/009-customer-accounts.sql dans Supabase",
              }
            : { detail: error.message }),
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ available: true });
  } catch {
    return NextResponse.json(
      { available: false, reason: "SERVER_ERROR" },
      { status: 200 }
    );
  }
}
