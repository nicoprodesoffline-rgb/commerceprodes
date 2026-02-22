import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ handle: string }> },
) {
  // Auth check
  const session = req.cookies.get("admin_session")?.value;
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { handle } = await props.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const { description, short_description } = body as Record<string, unknown>;

  if (description !== undefined && typeof description !== "string") {
    return NextResponse.json({ error: "Description invalide" }, { status: 400 });
  }
  if (short_description !== undefined && typeof short_description !== "string") {
    return NextResponse.json({ error: "Description courte invalide" }, { status: 400 });
  }

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    const update: Record<string, unknown> = {};
    if (description !== undefined) update.description = description;
    if (short_description !== undefined) update.short_description = short_description;

    const { error } = await client
      .from("products")
      .update(update)
      .eq("slug", handle);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ADMIN PRODUCTS] PATCH error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
