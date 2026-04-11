import { NextRequest, NextResponse } from "next/server";
import { supabase } from "lib/supabase/client";
import { getCart } from "lib/supabase";
import { cookies } from "next/headers";
import { log } from "lib/logger";
import { rateLimit } from "lib/rate-limit";
import { sanitizeString, sanitizeEmail } from "lib/validation";
import {
  confirmationEmailHtml,
  internalAlertEmailHtml,
  sendEmail,
  type EmailItem,
} from "lib/email/sender";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!rateLimit(ip, 5, 60000)) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  try {
    const body = await req.json();

    const prenom = sanitizeString(body.prenom, 50);
    const nom = sanitizeString(body.nom, 50);
    const organisme = sanitizeString(body.organisme, 100);
    const email = sanitizeEmail(body.email);
    const telephone = sanitizeString(body.telephone, 20);
    const adresse = sanitizeString(body.adresse, 200);
    const complement = sanitizeString(body.complement, 200);
    const codePostal = sanitizeString(body.codePostal, 10);
    const ville = sanitizeString(body.ville, 100);
    const joursReception = sanitizeString(body.joursReception, 200);
    const horairesReception = sanitizeString(body.horairesReception, 200);
    const notes = sanitizeString(body.notes, 1000);
    const modePaiement = sanitizeString(body.modePaiement, 50);
    const livraisonRdv = body.livraisonRdv === true;

    // Validation des champs obligatoires
    if (
      !prenom ||
      !nom ||
      !organisme ||
      !email ||
      !telephone ||
      !adresse ||
      !codePostal ||
      !ville
    ) {
      return NextResponse.json(
        { error: "Champs obligatoires manquants" },
        { status: 400 },
      );
    }

    // Récupérer le panier
    const cart = await getCart();
    if (!cart || cart.lines.length === 0) {
      return NextResponse.json({ error: "Panier vide" }, { status: 400 });
    }

    const orderId = crypto.randomUUID();
    const orderRef = `PRODES-${orderId.slice(0, 8).toUpperCase()}`;

    // Total HT
    const totalHT = Number(cart.cost.subtotalAmount.amount);
    const tva = totalHT * 0.2;
    const totalTTC = totalHT + tva + (livraisonRdv ? 20 : 0);

    // Résumé des produits
    const lignes = cart.lines.map((item) => {
      const unitPrice = Number(item.cost.totalAmount.amount) / item.quantity;
      const opts = item.merchandise.selectedOptions
        .filter((o) => o.value && o.value !== "Default Title")
        .map((o) => o.value)
        .join(", ");
      return {
        titre: item.merchandise.product.title,
        variant: opts || null,
        quantite: item.quantity,
        prixUnit: unitPrice,
        total: Number(item.cost.totalAmount.amount),
      };
    });

    const produitSummary = lignes
      .map(
        (l) =>
          `${l.titre}${l.variant ? ` (${l.variant})` : ""} × ${l.quantite} = ${l.total.toFixed(2)} €`,
      )
      .join("\n");

    const emailItems: EmailItem[] = lignes.map((ligne) => ({
      title: ligne.titre,
      variant: ligne.variant ?? undefined,
      quantity: ligne.quantite,
      unitPrice: ligne.prixUnit,
      lineTotal: ligne.total,
    }));

    const messageComplet = [
      `=== COMMANDE ${orderRef} ===`,
      ``,
      `ORGANISME : ${organisme}`,
      `CONTACT : ${prenom} ${nom}`,
      `EMAIL : ${email}`,
      `TÉL : ${telephone}`,
      ``,
      `ADRESSE LIVRAISON :`,
      adresse,
      complement || "",
      `${codePostal} ${ville}`,
      joursReception ? `Jours réception : ${joursReception}` : "",
      horairesReception ? `Horaires : ${horairesReception}` : "",
      ``,
      `PRODUITS :`,
      produitSummary,
      ``,
      `Total HT : ${totalHT.toFixed(2)} €`,
      `TVA 20% : ${tva.toFixed(2)} €`,
      livraisonRdv ? `Livraison RDV : 20,00 €` : "",
      `Total TTC : ${totalTTC.toFixed(2)} €`,
      ``,
      `MODE PAIEMENT : ${modePaiement}`,
      notes ? `\nNOTES : ${notes}` : "",
    ]
      .filter((l) => l !== undefined)
      .join("\n");

    // Sauvegarder en base (une ligne par commande dans devis_requests)
    const { error: dbError } = await supabase.from("devis_requests").insert({
      nom: `${prenom} ${nom}`,
      email,
      telephone,
      produit: `COMMANDE ${orderRef} — ${organisme}`,
      sku: orderRef,
      quantite: cart.totalQuantity,
      message: messageComplet,
      status: "nouveau",
      ip_address:
        req.headers.get("x-forwarded-for") ??
        req.headers.get("x-real-ip") ??
        null,
    });

    if (dbError) {
      console.error("DB error:", dbError);
      return NextResponse.json(
        { error: "Erreur base de données" },
        { status: 500 },
      );
    }

    const internalResult = await sendEmail({
      from: "PRODES Boutique <noreply@prodes.fr>",
      to: "contact@prodes.fr",
      replyTo: email,
      subject: `[COMMANDE] ${orderRef} — ${organisme}`,
      html: buildInternalCheckoutEmail({
        orderRef,
        organisme,
        prenom,
        nom,
        email,
        telephone,
        adresse,
        complement,
        codePostal,
        ville,
        joursReception,
        horairesReception,
        notes,
        modePaiement,
        livraisonRdv,
        items: emailItems,
        totalHT,
      }),
      text: messageComplet,
    });
    if (internalResult.error) {
      log("warn", "checkout.email_internal_failed", {
        error: internalResult.error,
        orderRef,
      });
    }

    const customerResult = await sendEmail({
      from: "PRODES <contact@prodes.fr>",
      to: email,
      subject: `Confirmation de commande ${orderRef} — PRODES`,
      html: buildCustomerCheckoutEmail({
        orderRef,
        prenom,
        modePaiement,
        notes,
        livraisonRdv,
        items: emailItems,
        totalHT,
        totalTTC,
      }),
      text: buildConfirmationEmailText({
        orderRef,
        prenom,
        modePaiement,
        lignes,
        totalHT,
        tva,
        totalTTC,
      }),
    });
    if (customerResult.error) {
      log("warn", "checkout.email_customer_failed", {
        error: customerResult.error,
        orderRef,
      });
    }

    // Vider le panier (supprimer le cookie)
    const cookieStore = await cookies();
    cookieStore.delete("cartId");

    return NextResponse.json({
      success: true,
      orderId: orderRef,
      modePaiement,
    });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

function buildConfirmationEmailText(params: {
  orderRef: string;
  prenom: string;
  modePaiement: string;
  lignes: {
    titre: string;
    variant: string | null;
    quantite: number;
    prixUnit: number;
    total: number;
  }[];
  totalHT: number;
  tva: number;
  totalTTC: number;
}): string {
  const { orderRef, prenom, modePaiement, lignes, totalHT, tva, totalTTC } =
    params;
  const modeInstructions: Record<string, string> = {
    virement:
      "Vous recevrez nos coordonnées bancaires sous 24h. Merci d'effectuer votre virement dans les 7 jours.",
    cheque:
      "Merci d'envoyer votre chèque à l'ordre de PRODES à notre adresse dans les 7 jours.",
    mandat:
      "Votre commande sera traitée à réception de votre bon de commande daté, signé et tamponné. Envoyez-le signé à contact@prodes.fr.",
    carte:
      "Le paiement en ligne sera disponible prochainement. Notre équipe vous contactera.",
  };

  const lignesText = lignes
    .map(
      (l) =>
        `  - ${l.titre}${l.variant ? ` (${l.variant})` : ""} × ${l.quantite} = ${l.total.toFixed(2)} € HT`,
    )
    .join("\n");

  return [
    `Bonjour ${prenom},`,
    ``,
    `Nous avons bien reçu votre commande ${orderRef}.`,
    ``,
    `RÉCAPITULATIF :`,
    lignesText,
    ``,
    `  Sous-total HT : ${totalHT.toFixed(2)} €`,
    `  TVA 20%       : ${tva.toFixed(2)} €`,
    `  Total TTC     : ${totalTTC.toFixed(2)} €`,
    ``,
    `MODE DE PAIEMENT : ${modePaiement}`,
    modeInstructions[modePaiement] || "",
    ``,
    `Notre équipe traite votre demande dans les meilleurs délais.`,
    `Pour toute question : contact@prodes.fr — 04 67 24 30 34 (Lun–Sam 8h30–19h)`,
    ``,
    `Cordialement,`,
    `L'équipe PRODES`,
  ].join("\n");
}

function buildInternalCheckoutEmail(params: {
  orderRef: string;
  organisme: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  adresse: string;
  complement?: string;
  codePostal: string;
  ville: string;
  joursReception?: string;
  horairesReception?: string;
  notes?: string;
  modePaiement: string;
  livraisonRdv?: boolean;
  items: EmailItem[];
  totalHT: number;
}): string {
  const base = internalAlertEmailHtml({
    orderId: params.orderRef,
    customer: `${params.prenom} ${params.nom}`,
    email: params.email,
    telephone: params.telephone,
    organisme: params.organisme,
    items: params.items,
    totalHT: params.totalHT,
    modePaiement: params.modePaiement,
  });

  const extra = `
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb">
      <h3 style="margin:0 0 12px;font-size:14px;color:#6b7280">LIVRAISON</h3>
      <p style="margin:4px 0">${params.adresse}</p>
      ${params.complement ? `<p style="margin:4px 0">${params.complement}</p>` : ""}
      <p style="margin:4px 0">${params.codePostal} ${params.ville}</p>
      ${params.joursReception ? `<p style="margin:4px 0"><strong>Jours :</strong> ${params.joursReception}</p>` : ""}
      ${params.horairesReception ? `<p style="margin:4px 0"><strong>Horaires :</strong> ${params.horairesReception}</p>` : ""}
      <p style="margin:4px 0"><strong>Livraison RDV :</strong> ${params.livraisonRdv ? "Oui" : "Non"}</p>
      ${params.notes ? `<div style="margin-top:12px;padding:12px;background:#f9fafb;border-radius:6px;white-space:pre-wrap"><strong>Notes :</strong><br>${params.notes}</div>` : ""}
    </div>
  `;

  return base.replace("</div>\n</body></html>", `${extra}</div></body></html>`);
}

function buildCustomerCheckoutEmail(params: {
  orderRef: string;
  prenom: string;
  modePaiement: string;
  notes?: string;
  livraisonRdv?: boolean;
  items: EmailItem[];
  totalHT: number;
  totalTTC: number;
}): string {
  const base = confirmationEmailHtml({
    orderId: params.orderRef,
    name: params.prenom,
    email: "",
    items: params.items,
    totalHT: params.totalHT,
    totalTTC: params.totalTTC,
    modePaiement: params.modePaiement,
  });

  const summaryText = buildConfirmationEmailText({
    orderRef: params.orderRef,
    prenom: params.prenom,
    modePaiement: params.modePaiement,
    lignes: params.items.map((item) => ({
      titre: item.title,
      variant: item.variant ?? null,
      quantite: item.quantity,
      prixUnit: item.unitPrice,
      total: item.lineTotal,
    })),
    totalHT: params.totalHT,
    tva: params.totalHT * 0.2,
    totalTTC: params.totalTTC,
  });

  const extra = `
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb">
      <p style="margin:4px 0"><strong>Livraison RDV :</strong> ${params.livraisonRdv ? "Oui" : "Non"}</p>
      ${params.notes ? `<div style="margin-top:12px;padding:12px;background:#f9fafb;border-radius:6px;white-space:pre-wrap"><strong>Notes :</strong><br>${params.notes}</div>` : ""}
      <div style="margin-top:16px;padding:12px;background:#f9fafb;border-radius:6px;white-space:pre-wrap;font-size:12px;color:#374151">${summaryText}</div>
    </div>
  `;

  return base.replace("</div>\n</body></html>", `${extra}</div></body></html>`);
}
