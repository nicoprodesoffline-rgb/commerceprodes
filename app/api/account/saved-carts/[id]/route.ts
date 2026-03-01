import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME_LEN = 80;
const MAX_SNAPSHOT_SIZE = 50;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, MAX_NAME_LEN);
    if (!name) return NextResponse.json({ error: "Nom invalide" }, { status: 400 });
    updates.name = name;
  }

  if (Array.isArray(body.cart_snapshot)) {
    if (body.cart_snapshot.length === 0) {
      return NextResponse.json({ error: "Panier vide" }, { status: 400 });
    }
    if (body.cart_snapshot.length > MAX_SNAPSHOT_SIZE) {
      return NextResponse.json({ error: "Panier trop grand" }, { status: 400 });
    }
    updates.cart_snapshot = body.cart_snapshot;
  }

  try {
    const client = supabaseServer();
    const { data, error } = await client
      .from("saved_carts")
      .update(updates)
      .eq("id", id)
      .select("id, name, cart_snapshot, updated_at")
      .single();

    if (error?.code === "42P01") {
      return NextResponse.json({ error: "Table absente — appliquer migration 011", degraded: true }, { status: 503 });
    }
    if (error?.code === "PGRST116") {
      return NextResponse.json({ error: "Panier introuvable" }, { status: 404 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ cart: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  }

  try {
    const client = supabaseServer();
    const { error } = await client.from("saved_carts").delete().eq("id", id);

    if (error?.code === "42P01") {
      return NextResponse.json({ error: "Table absente", degraded: true }, { status: 503 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
