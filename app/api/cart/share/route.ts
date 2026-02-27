import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "lib/supabase/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items } = body as { items: unknown[] };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Panier vide" }, { status: 400 });
    }

    const client = supabaseServer();
    const { data, error } = await client
      .from("shared_carts")
      .insert({ items_json: items })
      .select("id")
      .single();

    if (error) {
      console.error("share cart error", error);
      return NextResponse.json({ error: "Impossible de partager" }, { status: 500 });
    }

    const host = req.headers.get("host") ?? "prodes.fr";
    const protocol = host.includes("localhost") ? "http" : "https";
    const url = `${protocol}://${host}/panier/${data.id}`;

    return NextResponse.json({ url, id: data.id });
  } catch (err) {
    console.error("share cart exception", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
