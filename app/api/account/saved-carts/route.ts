import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "lib/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SNAPSHOT_SIZE = 50; // max lines in cart snapshot
const MAX_NAME_LEN = 80;

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }

  try {
    const client = supabaseServer();
    const { data, error } = await client
      .from("saved_carts")
      .select("id, email, name, cart_snapshot, created_at, updated_at")
      .eq("email", email.toLowerCase())
      .order("updated_at", { ascending: false });

    if (error?.code === "42P01") {
      return NextResponse.json({ carts: [], degraded: true, reason: "Table absente — appliquer migration 011" });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ carts: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : null;
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME_LEN) : null;
  if (!name) {
    return NextResponse.json({ error: "Nom du panier requis" }, { status: 400 });
  }

  if (!Array.isArray(body.cart_snapshot) || body.cart_snapshot.length === 0) {
    return NextResponse.json({ error: "Panier vide ou invalide" }, { status: 400 });
  }
  if (body.cart_snapshot.length > MAX_SNAPSHOT_SIZE) {
    return NextResponse.json({ error: `Panier trop grand (max ${MAX_SNAPSHOT_SIZE} lignes)` }, { status: 400 });
  }

  try {
    const client = supabaseServer();
    const { data, error } = await client
      .from("saved_carts")
      .insert({ email, name, cart_snapshot: body.cart_snapshot })
      .select("id, email, name, cart_snapshot, created_at, updated_at")
      .single();

    if (error?.code === "42P01") {
      return NextResponse.json({ error: "Table absente — appliquer migration 011", degraded: true }, { status: 503 });
    }
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Un panier avec ce nom existe déjà" }, { status: 409 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ cart: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
