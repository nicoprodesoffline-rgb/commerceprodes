// ─── Email sender with graceful degradation ──────────────────────────────────
// If RESEND_API_KEY is absent, logs to console instead of failing.

export interface EmailItem {
  title: string;
  variant?: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface ConfirmationEmailData {
  orderId: string;
  name: string;
  email: string;
  items: EmailItem[];
  totalHT: number;
  totalTTC: number;
  modePaiement: string;
}

interface InternalAlertEmailData {
  orderId: string;
  customer: string;
  email: string;
  telephone?: string;
  organisme?: string;
  items: EmailItem[];
  totalHT: number;
  modePaiement: string;
}

interface DevisExpressEmailData {
  name: string;
  email: string;
  need: string;
  organisme?: string;
}

interface ContactConfirmEmailData {
  name: string;
  email: string;
}

function formatHT(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(n) + " € HT";
}
function formatTTC(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(n) + " € TTC";
}

function itemsTable(items: EmailItem[]): string {
  const rows = items
    .map(
      (item) => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:8px 12px;font-size:13px;color:#111827">${item.title}${item.variant ? ` — ${item.variant}` : ""}${item.sku ? ` <span style="color:#9ca3af;font-size:11px">(${item.sku})</span>` : ""}</td>
      <td style="padding:8px 12px;text-align:center;font-size:13px;color:#374151">×${item.quantity}</td>
      <td style="padding:8px 12px;text-align:right;font-size:13px;color:#111827;font-weight:600">${formatHT(item.lineTotal)}</td>
    </tr>`,
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0">
    <thead><tr style="background:#f9fafb">
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280">Produit</th>
      <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280">Qté</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280">Total HT</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function modeLabel(mode: string): string {
  const labels: Record<string, string> = {
    virement: "Virement bancaire",
    cheque: "Chèque",
    mandat: "Mandat administratif",
    carte: "Carte bancaire",
  };
  return labels[mode] ?? mode;
}

export function confirmationEmailHtml(data: ConfirmationEmailData): string {
  return `<!DOCTYPE html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#cc1818;padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:white;margin:0;font-size:20px">✅ Votre demande a bien été reçue</h1>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <p>Bonjour <strong>${data.name}</strong>,</p>
    <p>Nous avons bien reçu votre demande <strong>#${data.orderId}</strong>. Notre équipe vous contactera sous 24h ouvrées.</p>
    <p><strong>Mode de règlement :</strong> ${modeLabel(data.modePaiement)}</p>
    ${itemsTable(data.items)}
    <div style="background:#f9fafb;padding:12px 16px;border-radius:6px;margin-top:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="color:#6b7280">Sous-total HT</span>
        <strong>${formatHT(data.totalHT)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="color:#6b7280">TVA 20%</span>
        <strong>${formatHT(data.totalHT * 0.2)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid #e5e7eb;padding-top:8px;margin-top:8px">
        <span style="font-weight:700">Total TTC</span>
        <strong style="color:#cc1818">${formatTTC(data.totalTTC)}</strong>
      </div>
    </div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="font-size:13px;color:#6b7280">📞 04 67 24 30 34 · ✉️ contact@prodes.fr · Lun–Sam 8h30–19h</p>
    <p style="font-size:12px;color:#9ca3af">PRODES — Le spécialiste des équipements pour collectivités</p>
  </div>
</body></html>`;
}

export function internalAlertEmailHtml(data: InternalAlertEmailData): string {
  return `<!DOCTYPE html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#1f2937;padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:white;margin:0;font-size:18px">🛒 Nouvelle demande #${data.orderId}</h1>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <h2 style="font-size:14px;color:#6b7280;margin-top:0">CLIENT</h2>
    <p style="margin:4px 0"><strong>${data.customer}</strong>${data.organisme ? ` — ${data.organisme}` : ""}</p>
    <p style="margin:4px 0">📧 ${data.email}${data.telephone ? ` · 📞 ${data.telephone}` : ""}</p>
    <p style="margin:8px 0"><strong>Mode de règlement :</strong> ${modeLabel(data.modePaiement)}</p>
    ${itemsTable(data.items)}
    <p style="font-size:13px;color:#cc1818;font-weight:600">Total HT : ${formatHT(data.totalHT)}</p>
  </div>
</body></html>`;
}

export function devisExpressEmailHtml(data: DevisExpressEmailData): string {
  return `<!DOCTYPE html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#cc1818;padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:white;margin:0;font-size:20px">📋 Votre demande de devis a été envoyée</h1>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <p>Bonjour <strong>${data.name}</strong>,</p>
    <p>Nous avons bien reçu votre demande de devis. Notre équipe vous répondra sous 24h ouvrées.</p>
    ${data.organisme ? `<p><strong>Organisme :</strong> ${data.organisme}</p>` : ""}
    <div style="background:#f9fafb;padding:12px;border-radius:6px;border-left:3px solid #cc1818">
      <p style="margin:0;font-size:13px;color:#374151">${data.need}</p>
    </div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="font-size:13px;color:#6b7280">📞 04 67 24 30 34 · ✉️ contact@prodes.fr · Lun–Sam 8h30–19h</p>
  </div>
</body></html>`;
}

export function contactConfirmEmailHtml(data: ContactConfirmEmailData): string {
  return `<!DOCTYPE html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#cc1818;padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:white;margin:0;font-size:20px">✅ Message reçu</h1>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <p>Bonjour <strong>${data.name}</strong>,</p>
    <p>Nous avons bien reçu votre message et vous répondrons dans les plus brefs délais.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="font-size:13px;color:#6b7280">📞 04 67 24 30 34 · ✉️ contact@prodes.fr · Lun–Sam 8h30–19h</p>
    <p style="font-size:12px;color:#9ca3af">PRODES — Le spécialiste des équipements pour collectivités</p>
  </div>
</body></html>`;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = opts.from ?? "noreply@prodes.fr";

  if (!apiKey) {
    // Degraded mode
    console.log("[EMAIL:degraded]", {
      to: opts.to,
      subject: opts.subject,
      from,
      preview: opts.html.slice(0, 200),
    });
    return { success: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) {
      console.error("[EMAIL:error]", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error("[EMAIL:exception]", err);
    return { success: false, error: String(err) };
  }
}
