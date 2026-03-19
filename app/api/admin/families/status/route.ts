import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkFamiliesDb } from "lib/admin/families-db";

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const status = await checkFamiliesDb();
  return NextResponse.json({
    available: status.available,
    reason: status.reason ?? null,
    table: status.table ?? null,
    migration: "016-product-families.sql",
  });
}
