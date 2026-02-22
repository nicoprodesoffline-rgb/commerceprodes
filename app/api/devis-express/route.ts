import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from 'lib/supabase/client';
import { rateLimit } from 'lib/rate-limit';
import { log } from 'lib/logger';
import { sanitizeString, sanitizeEmail } from 'lib/validation';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';

  if (!rateLimit(ip, 5, 60000)) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  const name = sanitizeString(b.name, 200);
  const organisme = sanitizeString(b.organisme, 200);
  const email = sanitizeEmail(b.email);
  const phone = sanitizeString(b.phone, 50);
  const typeProduct = sanitizeString(b.type_product, 100);
  const description = sanitizeString(b.description, 2000);
  const quantite = sanitizeString(b.quantite, 50);
  const budget = sanitizeString(b.budget, 100);
  const delai = sanitizeString(b.delai, 100);
  const numMarche = sanitizeString(b.num_marche, 200);

  if (!name || !email || !description) {
    return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 422 });
  }

  const message = [
    `Organisme : ${organisme}`,
    `Type de produit : ${typeProduct}`,
    `Description : ${description}`,
    `Quantité approximative : ${quantite || 'Non renseignée'}`,
    `Budget indicatif : ${budget || 'Non renseigné'}`,
    `Délai souhaité : ${delai || 'Non renseigné'}`,
    numMarche ? `N° marché : ${numMarche}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const client = supabaseServer();

  const { data: inserted, error } = await client
    .from('devis_requests')
    .insert({
      nom: name,
      email,
      telephone: phone || null,
      produit: typeProduct || 'Devis express',
      sku: 'DEVIS-EXPRESS',
      quantite: null,
      message,
      status: 'nouveau',
      ip_address: ip,
    })
    .select('id')
    .single();

  if (error) {
    log('error', 'devis_express.insert_failed', { error: error.message });
    return NextResponse.json({ error: 'Erreur lors de l\'enregistrement' }, { status: 500 });
  }

  log('info', 'devis_express.submitted', { email, typeProduct, id: inserted?.id });

  // Email via Resend (graceful degradation)
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'PRODES <noreply@prodes.fr>',
          to: ['contact@prodes.fr'],
          subject: `Devis express — ${name} (${organisme})`,
          text: `Nouvelle demande de devis express\n\nDe : ${name}\nEmail : ${email}\nTél : ${phone}\n\n${message}\n\nRéférence : ${inserted?.id}`,
        }),
      });
    } catch (e) {
      log('warn', 'email.send_failed', { error: String(e) });
    }
  } else {
    log('warn', 'email.skipped', { reason: 'no_api_key' });
  }

  return NextResponse.json({ success: true, id: inserted?.id });
}
