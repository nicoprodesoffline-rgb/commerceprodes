import { NextRequest, NextResponse } from "next/server";
import { sanitizeString, sanitizeEmail } from "lib/validation";
import { scrypt as scryptCb, randomBytes } from "crypto";
import { promisify } from "util";
import { sendEmail } from "lib/email/sender";

const scrypt = promisify(scryptCb);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

/** Detect Supabase error meaning table does not exist */
function isMissingTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const code = e.code as string | undefined;
  const msg = (e.message as string | undefined) ?? "";
  // Postgres code 42P01 = undefined_table, PostgREST = schema cache
  const lmsg = msg.toLowerCase();
  return (
    code === "42P01" ||
    lmsg.includes("does not exist") ||
    lmsg.includes("schema cache") ||
    lmsg.includes("could not find the table")
  );
}

export async function GET() {
  return checkAvailability();
}

async function checkAvailability(): Promise<NextResponse> {
  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();
    const { error } = await client
      .from("customer_accounts")
      .select("id")
      .limit(1);
    if (error && isMissingTable(error)) {
      return NextResponse.json(
        { available: false, reason: "MIGRATION_REQUIRED" },
        { status: 200 }
      );
    }
    if (error) {
      return NextResponse.json(
        { available: false, reason: "DB_ERROR", detail: error.message },
        { status: 200 }
      );
    }
    return NextResponse.json({ available: true });
  } catch {
    return NextResponse.json(
      { available: false, reason: "SERVER_ERROR" },
      { status: 200 }
    );
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;

  // Validation email
  const email = sanitizeEmail(data.email);
  if (!email) {
    return NextResponse.json(
      { error: "Email invalide", field: "email" },
      { status: 400 }
    );
  }

  // Validation mot de passe
  const password = typeof data.password === "string" ? data.password : "";
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Mot de passe trop court (8 caractères minimum)", field: "password" },
      { status: 400 }
    );
  }
  if (password.length > 100) {
    return NextResponse.json(
      { error: "Mot de passe trop long", field: "password" },
      { status: 400 }
    );
  }

  const prenom = sanitizeString(data.prenom, 100);
  const nom = sanitizeString(data.nom, 100);
  const organisme = sanitizeString(data.organisme, 200);
  const telephone = sanitizeString(data.telephone, 20);

  try {
    const password_hash = await hashPassword(password);
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    // Vérifier si le compte existe déjà
    const { data: existing, error: checkError } = await client
      .from("customer_accounts")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    // Détecter table absente => 503 actionnable
    if (checkError && isMissingTable(checkError)) {
      return NextResponse.json(
        {
          error_code: "MIGRATION_REQUIRED",
          message:
            "La table customer_accounts n'existe pas. Veuillez appliquer la migration SQL 009 via le dashboard Supabase.",
          migration_file: "docs/sql-migrations/009-customer-accounts.sql",
        },
        { status: 503 }
      );
    }

    if (checkError) throw checkError;

    const isNew = !existing;

    const { data: result, error: upsertError } = await client
      .from("customer_accounts")
      .upsert(
        { email, password_hash, prenom, nom, organisme, telephone },
        { onConflict: "email" }
      )
      .select("id, email, created_at")
      .single();

    if (upsertError && isMissingTable(upsertError)) {
      return NextResponse.json(
        {
          error_code: "MIGRATION_REQUIRED",
          message:
            "La table customer_accounts n'existe pas. Veuillez appliquer la migration SQL 009.",
          migration_file: "docs/sql-migrations/009-customer-accounts.sql",
        },
        { status: 503 }
      );
    }

    if (upsertError) throw upsertError;

    // Email de bienvenue — non bloquant (fire and forget)
    if (isNew) {
      sendEmail({
        to: email,
        subject: "Bienvenue sur PRODES — Votre compte est créé",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;color:#333">
            <h2 style="color:#cc1818;margin-bottom:8px">Bienvenue sur PRODES</h2>
            <p>Bonjour${prenom ? ` ${prenom}` : ""}${nom ? ` ${nom}` : ""},</p>
            <p>Votre compte client PRODES a été créé avec succès pour l'adresse <strong>${email}</strong>.</p>
            ${organisme ? `<p>Organisme enregistré : <strong>${organisme}</strong></p>` : ""}
            <p>Vous pouvez désormais retrouver vos commandes et devis dans votre espace client.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
            <small style="color:#999">PRODES — Équipements pour collectivités</small>
          </div>
        `,
      }).catch((e) => console.error("[register:email]", e));
    }

    return NextResponse.json(
      { success: true, created: isNew, email: result.email, id: result.id },
      { status: isNew ? 201 : 200 }
    );
  } catch (err: unknown) {
    console.error("register error", err);
    return NextResponse.json({ error: "Erreur création de compte" }, { status: 500 });
  }
}
