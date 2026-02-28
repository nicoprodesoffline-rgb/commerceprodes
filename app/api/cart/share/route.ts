import { NextRequest, NextResponse } from "next/server";

function isMissingTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const code = e.code as string | undefined;
  const msg = (e.message as string | undefined) ?? "";
  return code === "42P01" || msg.toLowerCase().includes("does not exist");
}

export async function POST(req: NextRequest) {
  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
  }

  const { items } = body as Record<string, unknown>;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Panier vide ou invalide" }, { status: 400 });
  }

  // Validate max size
  if (items.length > 200) {
    return NextResponse.json({ error: "Panier trop volumineux" }, { status: 400 });
  }

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();
    const { data, error } = await client
      .from("shared_carts")
      .insert({ items_json: items })
      .select("id")
      .single();

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json(
          {
            error_code: "MIGRATION_REQUIRED",
            message:
              "La table shared_carts n'existe pas. Contactez l'administrateur pour appliquer la migration.",
          },
          { status: 503 }
        );
      }
      console.error("[share cart] db error", error);
      return NextResponse.json(
        { error: "Impossible de partager le panier. Réessayez." },
        { status: 500 }
      );
    }

    const host = req.headers.get("host") ?? "prodes.fr";
    const protocol = host.includes("localhost") ? "http" : "https";
    const url = `${protocol}://${host}/panier/${data.id}`;

    return NextResponse.json({ url, id: data.id });
  } catch (err) {
    console.error("[share cart] exception", err);
    return NextResponse.json({ error: "Erreur serveur inattendue" }, { status: 500 });
  }
}
