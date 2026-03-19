import { NextRequest, NextResponse } from "next/server";
import { getCatalogFilterOptions } from "lib/supabase";
import { rateLimit } from "lib/rate-limit";
import { sanitizeString } from "lib/validation";

export const revalidate = 300;

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";

  if (!rateLimit(ip, 30, 60000)) {
    return NextResponse.json(
      {
        error: "Trop de requêtes",
        priceMin: 0,
        priceMax: 0,
        suppliers: [],
        ecoCount: 0,
        total: 0,
      },
      { status: 429 },
    );
  }

  const { searchParams } = request.nextUrl;
  const collection =
    sanitizeString(searchParams.get("collection"), 120) || undefined;
  const query = sanitizeString(searchParams.get("q"), 100) || undefined;
  const options = await getCatalogFilterOptions({ collection, query });

  return NextResponse.json(options);
}
