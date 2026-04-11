import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { RETAB_PIPELINE_SCOPE_MESSAGE } from "lib/admin/retab-config";

const ERROR_MESSAGE = `Etape non migree: ${RETAB_PIPELINE_SCOPE_MESSAGE}`;

function notMigrated() {
  return NextResponse.json(
    {
      success: false,
      migrated: false,
      error: ERROR_MESSAGE,
    },
    { status: 410 },
  );
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req))
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });

  return notMigrated();
}
