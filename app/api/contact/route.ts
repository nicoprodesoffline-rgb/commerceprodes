import { NextRequest, NextResponse } from "next/server";
import { sanitizeString, sanitizeEmail } from "lib/validation";
import { rateLimit } from "lib/rate-limit";
import { log } from "lib/logger";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";

  if (!rateLimit(ip, 5, 60000)) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const prenom = sanitizeString(String(data.prenom ?? ""), 50);
  const nom = sanitizeString(String(data.nom ?? ""), 50);
  const email = sanitizeEmail(String(data.email ?? ""));
  const telephone = sanitizeString(String(data.telephone ?? ""), 20);
  const objet = sanitizeString(String(data.objet ?? ""), 100);
  const message = sanitizeString(String(data.message ?? ""), 2000);

  if (!email || !message || !nom) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }

  // Persist to devis_requests table
  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();
    await client.from("devis_requests").insert({
      nom: `${prenom} ${nom}`.trim(),
      email,
      telephone: telephone || null,
      produit: objet || "Contact",
      sku: "CONTACT",
      message,
      status: "nouveau",
      ip_address: ip,
    });
  } catch (err) {
    log("warn", "contact.db_error", { error: String(err) });
    // Continue even if DB fails
  }

  // Send email via Resend if configured
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: "PRODES Site <noreply@prodes.fr>",
        to: "contact@prodes.fr",
        subject: `[Contact] ${objet || "Message depuis le site"} — ${prenom} ${nom}`,
        text: `De : ${prenom} ${nom} <${email}>\nTél : ${telephone || "—"}\nObjet : ${objet}\n\n${message}`,
      });
    } catch (err) {
      log("warn", "contact.email_error", { error: String(err) });
    }
  }

  log("info", "contact.submitted", { email, objet });
  return NextResponse.json({ success: true });
}
