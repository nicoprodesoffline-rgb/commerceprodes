import { NextRequest, NextResponse } from "next/server";
import { supabase } from "lib/supabase/client";
import { getCart } from "lib/supabase";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      prenom,
      nom,
      organisme,
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
    } = body;

    // Validation des champs obligatoires
    if (!prenom || !nom || !organisme || !email || !telephone || !adresse || !codePostal || !ville) {
      return NextResponse.json({ error: "Champs obligatoires manquants" }, { status: 400 });
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
      .map((l) => `${l.titre}${l.variant ? ` (${l.variant})` : ""} × ${l.quantite} = ${l.total.toFixed(2)} €`)
      .join("\n");

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
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
    });

    if (dbError) {
      console.error("DB error:", dbError);
      return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
    }

    // Tentative d'envoi email via Resend (dégradé si pas de clé)
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (RESEND_API_KEY) {
      try {
        const emailPayload = {
          from: "PRODES Boutique <noreply@prodes.fr>",
          to: ["contact@prodes.fr"],
          subject: `[COMMANDE] ${orderRef} — ${organisme}`,
          text: messageComplet,
        };
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(emailPayload),
        });

        // Email de confirmation au client
        const confirmText = buildConfirmationEmail({ orderRef, prenom, modePaiement, lignes, totalHT, tva, totalTTC });
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "PRODES <contact@prodes.fr>",
            to: [email],
            subject: `Confirmation de commande ${orderRef} — PRODES`,
            text: confirmText,
          }),
        });
      } catch (emailErr) {
        console.error("Email send error (non-blocking):", emailErr);
      }
    }

    // Vider le panier (supprimer le cookie)
    const cookieStore = await cookies();
    cookieStore.delete("cartId");

    return NextResponse.json({ success: true, orderId: orderRef, modePaiement });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

function buildConfirmationEmail(params: {
  orderRef: string;
  prenom: string;
  modePaiement: string;
  lignes: { titre: string; variant: string | null; quantite: number; prixUnit: number; total: number }[];
  totalHT: number;
  tva: number;
  totalTTC: number;
}): string {
  const { orderRef, prenom, modePaiement, lignes, totalHT, tva, totalTTC } = params;

  const modeInstructions: Record<string, string> = {
    virement: "Vous recevrez nos coordonnées bancaires sous 24h. Merci d'effectuer votre virement dans les 7 jours.",
    cheque: "Merci d'envoyer votre chèque à l'ordre de PRODES à notre adresse dans les 7 jours.",
    mandat: "Votre commande sera traitée à réception de votre bon de commande daté, signé et tamponné. Envoyez-le signé à contact@prodes.fr.",
    carte: "Le paiement en ligne sera disponible prochainement. Notre équipe vous contactera.",
  };

  const lignesText = lignes
    .map((l) => `  - ${l.titre}${l.variant ? ` (${l.variant})` : ""} × ${l.quantite} = ${l.total.toFixed(2)} € HT`)
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
