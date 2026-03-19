import { NextRequest, NextResponse } from "next/server";
import { sanitizeString, sanitizeEmail } from "lib/validation";
import { rateLimit } from "lib/rate-limit";
import { log } from "lib/logger";
import { sendEmail } from "lib/email/sender";

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
    return NextResponse.json(
      { error: "Champs requis manquants" },
      { status: 400 },
    );
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

  const emailResult = await sendEmail({
    from: "PRODES Site <noreply@prodes.fr>",
    to: "contact@prodes.fr",
    replyTo: email,
    subject: `[Contact] ${objet || "Message depuis le site"} — ${prenom} ${nom}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827">
        <h2 style="margin:0 0 16px;color:#111827">Nouveau message de contact</h2>
        <p><strong>De :</strong> ${prenom} ${nom} &lt;${email}&gt;</p>
        <p><strong>Téléphone :</strong> ${telephone || "—"}</p>
        <p><strong>Objet :</strong> ${objet || "Message depuis le site"}</p>
        <div style="margin-top:16px;padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;white-space:pre-wrap">${message}</div>
      </div>
    `,
    text: `De : ${prenom} ${nom} <${email}>\nTél : ${telephone || "—"}\nObjet : ${objet || "Message depuis le site"}\n\n${message}`,
  });
  if (emailResult.error) {
    log("warn", "contact.email_error", { error: emailResult.error });
  }

  log("info", "contact.submitted", { email, objet });
  return NextResponse.json({ success: true });
}
