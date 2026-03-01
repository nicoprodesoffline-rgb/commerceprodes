import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "lib/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIRET_RE = /^\d{14}$/;

function sanitizeText(v: unknown, maxLen = 200): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, maxLen);
  return s || null;
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }

  try {
    const client = supabaseServer();
    const { data, error } = await client
      .from("customer_profiles")
      .select("id, email, nom, organisme, siret, telephone, billing_address, shipping_address, created_at, updated_at")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (error?.code === "42P01") {
      return NextResponse.json({ profile: null, degraded: true, reason: "Table absente — appliquer migration 010" });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ profile: data ?? null });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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

  const siret = sanitizeText(body.siret, 14);
  if (siret && !SIRET_RE.test(siret)) {
    return NextResponse.json({ error: "SIRET invalide (14 chiffres requis)" }, { status: 400 });
  }

  const updates = {
    email,
    nom: sanitizeText(body.nom),
    organisme: sanitizeText(body.organisme),
    siret: siret,
    telephone: sanitizeText(body.telephone, 20),
    billing_address: (typeof body.billing_address === "object" && body.billing_address !== null)
      ? body.billing_address
      : undefined,
    shipping_address: (typeof body.shipping_address === "object" && body.shipping_address !== null)
      ? body.shipping_address
      : undefined,
    updated_at: new Date().toISOString(),
  };

  // Remove undefined values
  const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));

  try {
    const client = supabaseServer();
    const { data, error } = await client
      .from("customer_profiles")
      .upsert(clean, { onConflict: "email" })
      .select("id, email, nom, organisme, siret, telephone, billing_address, shipping_address, updated_at")
      .single();

    if (error?.code === "42P01") {
      return NextResponse.json({ error: "Table absente — appliquer migration 010", degraded: true }, { status: 503 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ profile: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
