import { NextRequest, NextResponse } from "next/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CONTACT_EMAIL = "contact@prodes.fr";

function buildEmailHtml(body: {
  nom: string;
  email: string;
  telephone?: string;
  quantite?: number | string;
  produit: string;
  sku?: string;
  message?: string;
}) {
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1f2937;">Nouvelle demande de devis — PRODES</h2>
  <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
    <tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold; width: 160px;">Produit</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${body.produit}</td>
    </tr>
    ${body.sku ? `<tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold;">Référence</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${body.sku}</td>
    </tr>` : ""}
    <tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold;">Nom</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${body.nom}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold;">Email</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${body.email}</td>
    </tr>
    ${body.telephone ? `<tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold;">Téléphone</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${body.telephone}</td>
    </tr>` : ""}
    ${body.quantite ? `<tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold;">Quantité</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${body.quantite}</td>
    </tr>` : ""}
    ${body.message ? `<tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold; vertical-align: top;">Message</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; white-space: pre-wrap;">${body.message}</td>
    </tr>` : ""}
  </table>
  <p style="margin-top: 24px; font-size: 12px; color: #6b7280;">
    Demande reçue depuis le site PRODES — prodes.fr
  </p>
</div>`;
}

function buildConfirmationHtml(body: { nom: string; produit: string; sku?: string; quantite?: number | string }) {
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1f2937;">Votre demande de devis a bien été reçue</h2>
  <p>Bonjour ${body.nom},</p>
  <p>Nous avons bien reçu votre demande de devis pour :</p>
  <ul>
    <li><strong>${body.produit}</strong>${body.sku ? ` (Réf : ${body.sku})` : ""}</li>
    ${body.quantite ? `<li>Quantité : ${body.quantite}</li>` : ""}
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[DEVIS] Nouvelle demande de devis:", body);

    if (RESEND_API_KEY) {
      const { Resend } = await import("resend");
      const resend = new Resend(RESEND_API_KEY);

      const subject = `Demande de devis – ${body.produit || "produit"} – ${body.nom || "client"}`;

      // Email to PRODES
      await resend.emails.send({
        from: "PRODES Site <noreply@prodes.fr>",
        to: CONTACT_EMAIL,
        replyTo: body.email,
        subject,
        html: buildEmailHtml(body),
      });

      // Confirmation to client
      if (body.email) {
        await resend.emails.send({
          from: "PRODES <noreply@prodes.fr>",
          to: body.email,
          subject: "Confirmation de votre demande de devis — PRODES",
          html: buildConfirmationHtml(body),
        });
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[DEVIS] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
