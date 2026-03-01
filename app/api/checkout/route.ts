import { NextRequest, NextResponse } from "next/server";
import { supabase } from "lib/supabase/client";
import { getCart } from "lib/supabase";
import { cookies } from "next/headers";

// ── Cart snapshot types ────────────────────────────────────────

type CartLineSnapshot = {
  id?: string;
  title: string;
  variant?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  ecoUnit?: number;
  imageUrl?: string | null;
};

function isValidCartSnapshot(snap: unknown): snap is CartLineSnapshot[] {
  if (!Array.isArray(snap) || snap.length === 0) return false;
  return snap.every(
    (l) =>
      typeof l === "object" &&
      l !== null &&
      typeof (l as CartLineSnapshot).title === "string" &&
      (l as CartLineSnapshot).title.length > 0 &&
      typeof (l as CartLineSnapshot).quantity === "number" &&
      (l as CartLineSnapshot).quantity > 0 &&
      typeof (l as CartLineSnapshot).unitPrice === "number" &&
      (l as CartLineSnapshot).unitPrice >= 0 &&
      typeof (l as CartLineSnapshot).lineTotal === "number" &&
      (l as CartLineSnapshot).lineTotal >= 0,
  );
}

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
      purchaseOrderNumber,
      serviceReference,
      cart_snapshot,
      ecoTotal: ecoTotalFromFront,
    } = body;

    // Validation des champs obligatoires
    if (!prenom || !nom || !organisme || !email || !telephone || !adresse || !codePostal || !ville) {
      return NextResponse.json({ error: "Champs obligatoires manquants" }, { status: 400 });
    }

    // Validation bon de commande si mode l'exige
    const REQUIRES_PO = ["bon_commande", "mandat"];
    if (REQUIRES_PO.includes(modePaiement) && !purchaseOrderNumber) {
      return NextResponse.json({ error: "Numéro de bon de commande requis" }, { status: 400 });
    }

    // ── Source du panier ──────────────────────────────────────
    // Primaire : cart_snapshot envoyé par le front (localStorage-backed)
    // Fallback : getCart() (cookie-backed, peut être vide si cookie absent)

    let lignes: { titre: string; variant: string | null; quantite: number; prixUnit: number; total: number; ecoUnit: number }[];
    let totalHT: number;
    let ecoTotal: number;
    let totalQuantity: number;

    if (isValidCartSnapshot(cart_snapshot)) {
      // Source primaire : snapshot front
      lignes = cart_snapshot.map((l) => ({
        titre: l.title,
        variant: l.variant || null,
        quantite: l.quantity,
        prixUnit: l.unitPrice,
        total: l.lineTotal,
        ecoUnit: l.ecoUnit ?? 0,
      }));
      totalHT = lignes.reduce((s, l) => s + l.total, 0);
      ecoTotal =
        typeof ecoTotalFromFront === "number" && ecoTotalFromFront >= 0
          ? ecoTotalFromFront
          : lignes.reduce((s, l) => s + l.quantite * l.ecoUnit, 0);
      totalQuantity = lignes.reduce((s, l) => s + l.quantite, 0);
    } else {
      // Fallback : panier serveur (cookie)
      const cart = await getCart();
      if (!cart || cart.lines.length === 0) {
        return NextResponse.json({ error: "Panier vide" }, { status: 400 });
      }
      lignes = cart.lines.map((item) => {
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
          ecoUnit: 0,
        };
      });
      totalHT = Number(cart.cost.subtotalAmount.amount);
      ecoTotal = 0;
      totalQuantity = cart.totalQuantity;
    }

    const orderId = crypto.randomUUID();
    const orderRef = `PRODES-${orderId.slice(0, 8).toUpperCase()}`;

    const tva = totalHT * 0.2;
    const livraisonSupplement = livraisonRdv ? 20 : 0;
    const totalTTC = totalHT + ecoTotal + tva + livraisonSupplement;

    // ── Résumé produits ───────────────────────────────────────
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
      ecoTotal > 0 ? `Éco-participation : ${ecoTotal.toFixed(2)} €` : "",
      `TVA 20% : ${tva.toFixed(2)} €`,
      livraisonRdv ? `Livraison RDV : ${livraisonSupplement.toFixed(2)} €` : "",
      `Total TTC : ${totalTTC.toFixed(2)} €`,
      ``,
      `MODE PAIEMENT : ${modePaiement}`,
      purchaseOrderNumber ? `N° BON DE COMMANDE : ${purchaseOrderNumber}` : "",
      serviceReference ? `RÉFÉRENCE SERVICE : ${serviceReference}` : "",
      notes ? `\nNOTES : ${notes}` : "",
    ]
      .filter((l) => l !== undefined && l !== "")
      .join("\n");

    // ── Sauvegarder en base ───────────────────────────────────
    const { error: dbError } = await supabase.from("devis_requests").insert({
      nom: `${prenom} ${nom}`,
      email,
      telephone,
      produit: `COMMANDE ${orderRef} — ${organisme}`,
      sku: orderRef,
      quantite: totalQuantity,
      message: messageComplet,
      status: "nouveau",
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
    });

    if (dbError) {
      console.error("DB error:", dbError);
      return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
    }

    // ── Envoi emails via Resend ───────────────────────────────
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (RESEND_API_KEY) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "PRODES Boutique <noreply@prodes.fr>",
            to: ["contact@prodes.fr"],
            subject: `[COMMANDE] ${orderRef} — ${organisme}`,
            text: messageComplet,
          }),
        });

        const confirmText = buildConfirmationEmail({
          orderRef,
          prenom,
          modePaiement,
          lignes,
          totalHT,
          ecoTotal,
          tva,
          totalTTC,
        });
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

    // ── Vider le panier côté cookie (si présent) ──────────────
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
  lignes: { titre: string; variant: string | null; quantite: number; prixUnit: number; total: number; ecoUnit: number }[];
  totalHT: number;
  ecoTotal: number;
  tva: number;
  totalTTC: number;
}): string {
  const { orderRef, prenom, modePaiement, lignes, totalHT, ecoTotal, tva, totalTTC } = params;

  const modeInstructions: Record<string, string> = {
    virement: "Vous recevrez nos coordonnées bancaires sous 24h. Merci d'effectuer votre virement dans les 7 jours.",
    cheque: "Merci d'envoyer votre chèque à l'ordre de PRODES à notre adresse dans les 7 jours.",
    mandat:
      "Votre commande sera traitée à réception de votre bon de commande daté, signé et tamponné. Envoyez-le signé à contact@prodes.fr.",
    carte: "Le paiement en ligne sera disponible prochainement. Notre équipe vous contactera.",
  };

  const lignesText = lignes
    .map((l) => `  - ${l.titre}${l.variant ? ` (${l.variant})` : ""} × ${l.quantite} = ${l.total.toFixed(2)} € HT`)
    .join("\n");

  const totalsLines = [
    `  Sous-total HT   : ${totalHT.toFixed(2)} €`,
    ecoTotal > 0 ? `  Éco-participation: ${ecoTotal.toFixed(2)} €` : null,
    `  TVA 20%         : ${tva.toFixed(2)} €`,
    `  Total TTC       : ${totalTTC.toFixed(2)} €`,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    `Bonjour ${prenom},`,
    ``,
    `Nous avons bien reçu votre commande ${orderRef}.`,
    ``,
    `RÉCAPITULATIF :`,
    lignesText,
    ``,
    totalsLines,
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
