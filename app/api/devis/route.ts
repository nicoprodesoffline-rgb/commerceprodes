import { NextRequest, NextResponse } from "next/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CONTACT_EMAIL = "contact@prodes.fr";

// ── Rate limiting ────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

// ── Sanitisation HTML ────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Types ────────────────────────────────────────────────────
type DevisData = {
  nom: string;
  email: string;
  produit: string;
  telephone?: string;
  quantite?: number;
  sku?: string;
  message?: string;
};

// ── Validation ───────────────────────────────────────────────
function validateDevisBody(
  body: unknown,
): { valid: false; error: string } | { valid: true; data: DevisData } {
  if (!body || typeof body !== "object")
    return { valid: false, error: "Corps invalide" };
  const b = body as Record<string, unknown>;

  if (
    !b.nom ||
    typeof b.nom !== "string" ||
    b.nom.trim().length < 2 ||
    b.nom.trim().length > 100
  )
    return { valid: false, error: "Nom invalide (2-100 caractères)" };

  if (
    !b.email ||
    typeof b.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) ||
    b.email.length > 254
  )
    return { valid: false, error: "Email invalide" };

  if (
    !b.produit ||
    typeof b.produit !== "string" ||
    b.produit.trim().length < 1
  )
    return { valid: false, error: "Produit manquant" };

  if (
    b.telephone &&
    typeof b.telephone === "string" &&
    b.telephone.length > 20
  )
    return { valid: false, error: "Téléphone trop long" };

  if (
    b.quantite !== undefined &&
    (typeof b.quantite !== "number" ||
      b.quantite < 1 ||
      b.quantite > 100000 ||
      !Number.isInteger(b.quantite))
  )
    return { valid: false, error: "Quantité invalide (1-100000)" };

  if (b.message && typeof b.message === "string" && b.message.length > 2000)
    return { valid: false, error: "Message trop long (max 2000 caractères)" };

  if (b.sku && typeof b.sku === "string" && b.sku.length > 100)
    return { valid: false, error: "SKU trop long" };

  return {
    valid: true,
    data: {
      nom: (b.nom as string).trim(),
      email: (b.email as string).trim().toLowerCase(),
      produit: String(b.produit).trim(),
      telephone:
        b.telephone && typeof b.telephone === "string"
          ? b.telephone.trim()
          : undefined,
      quantite:
        b.quantite !== undefined ? Number(b.quantite) : undefined,
      sku:
        b.sku && typeof b.sku === "string" ? b.sku.trim() : undefined,
      message:
        b.message && typeof b.message === "string"
          ? b.message.trim()
          : undefined,
    },
  };
}

// ── Email builders ───────────────────────────────────────────
function buildEmailHtml(data: DevisData) {
  const nom = escapeHtml(data.nom);
  const email = escapeHtml(data.email);
  const produit = escapeHtml(data.produit);
  const sku = data.sku ? escapeHtml(data.sku) : null;
  const telephone = data.telephone ? escapeHtml(data.telephone) : null;
  const message = data.message ? escapeHtml(data.message) : null;

  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1f2937;">Nouvelle demande de devis — PRODES</h2>
  <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
    <tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold; width: 160px;">Produit</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${produit}</td>
    </tr>
    ${sku ? `<tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold;">Référence</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${sku}</td>
    </tr>` : ""}
    <tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold;">Nom</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${nom}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold;">Email</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${email}</td>
    </tr>
    ${telephone ? `<tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold;">Téléphone</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${telephone}</td>
    </tr>` : ""}
    ${data.quantite ? `<tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold;">Quantité</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${data.quantite}</td>
    </tr>` : ""}
    ${message ? `<tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold; vertical-align: top;">Message</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; white-space: pre-wrap;">${message}</td>
    </tr>` : ""}
  </table>
  <p style="margin-top: 24px; font-size: 12px; color: #6b7280;">
    Demande reçue depuis le site PRODES — prodes.fr
  </p>
</div>`;
}

function buildConfirmationHtml(data: DevisData) {
  const nom = escapeHtml(data.nom);
  const produit = escapeHtml(data.produit);
  const sku = data.sku ? escapeHtml(data.sku) : null;

  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1f2937;">Votre demande de devis a bien été reçue</h2>
  <p>Bonjour ${nom},</p>
  <p>Nous avons bien reçu votre demande de devis pour :</p>
  <ul>
    <li><strong>${produit}</strong>${sku ? ` (Réf : ${sku})` : ""}</li>
    ${data.quantite ? `<li>Quantité : ${data.quantite}</li>` : ""}
  </ul>
  <p>Notre équipe vous répondra dans les plus brefs délais.</p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
  <p style="color: #6b7280; font-size: 13px;">
    <strong>PRODES</strong> — Au service des Collectivités<br/>
    📞 04 67 24 30 34 · ✉️ contact@prodes.fr<br/>
    Lun–Sam 8h30–19h
  </p>
</div>`;
}

// ── POST handler ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Rate limiting
  const ip =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez dans 10 minutes." },
      { status: 429 },
    );
  }

  // Parse body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  // Validate
  const result = validateDevisBody(rawBody);
  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const data = result.data;

  try {
    // Sauvegarder en base si possible
    try {
      const { createDevisRequest } = await import("lib/supabase/index");
      await createDevisRequest({
        nom: data.nom,
        email: data.email,
        telephone: data.telephone,
        produit: data.produit,
        sku: data.sku,
        quantite: data.quantite,
        message: data.message,
        ip_address: ip === "unknown" ? undefined : ip,
      });
    } catch {
      // Mode dégradé — log seulement
      console.log("[DEVIS] DB save skipped (table may not exist yet)");
    }

    console.log("[DEVIS] Nouvelle demande:", {
      nom: data.nom,
      email: data.email,
      produit: data.produit,
    });

    if (RESEND_API_KEY) {
      const { Resend } = await import("resend");
      const resend = new Resend(RESEND_API_KEY);
      const subject = `Demande de devis – ${data.produit} – ${data.nom}`;

      await resend.emails.send({
        from: "PRODES Site <noreply@prodes.fr>",
        to: CONTACT_EMAIL,
        replyTo: data.email,
        subject,
        html: buildEmailHtml(data),
      });

      await resend.emails.send({
        from: "PRODES <noreply@prodes.fr>",
        to: data.email,
        subject: "Confirmation de votre demande de devis — PRODES",
        html: buildConfirmationHtml(data),
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[DEVIS] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
