import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { deleteAdminSession, saveAdminSession } from "lib/admin/sessions";
import { rateLimit } from "lib/rate-limit";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// POST — Login
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (!rateLimit(ip, 5, 60000)) {
    return NextResponse.json({ error: "Trop de tentatives" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const { password } = body as Record<string, unknown>;
  if (!password || typeof password !== "string") {
    return NextResponse.json(
      { error: "Mot de passe manquant" },
      { status: 400 },
    );
  }

  if (!ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD non configuré" },
      { status: 500 },
    );
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(ADMIN_PASSWORD);
  const received = Buffer.from(password);
  const match =
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received);

  if (!match) {
    // Anti-bruteforce: wait 1 second
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json(
      { error: "Mot de passe incorrect" },
      { status: 401 },
    );
  }

  // Generate session token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h

  // Try to save in DB
  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();
    await client.from("admin_sessions").insert({
      token,
      expires_at: new Date(expiresAt).toISOString(),
      ip_address:
        req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });
  } catch {
    // DB session storage unavailable; rely on shared in-memory fallback.
  }
  saveAdminSession(token, expiresAt);

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set("admin_session", token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 86400,
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ success: true });
}

// DELETE — Logout
export async function DELETE(req: NextRequest) {
  const token = req.cookies.get("admin_session")?.value;

  if (token) {
    // Try DB cleanup
    try {
      const { supabaseServer } = await import("lib/supabase/client");
      const client = supabaseServer();
      await client.from("admin_sessions").delete().eq("token", token);
    } catch {
      // Fall back to the shared in-memory session store.
    }
    deleteAdminSession(token);
  }

  const cookieStore = await cookies();
  cookieStore.delete("admin_session");

  return NextResponse.json({ success: true });
}
