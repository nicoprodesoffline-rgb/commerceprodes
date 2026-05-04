import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js Edge Proxy (replaces middleware in Next 15 canary).
 * 1. Site-wide password gate (cookie "site-access")
 * 2. Admin route protection (cookie "admin_session")
 * 3. Rate limiting on admin API routes
 *
 * To disable the password gate, remove SITE_PASSWORD from env.
 */

function log(
  level: "info" | "warn",
  event: string,
  data?: Record<string, unknown>,
) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...data,
    }),
  );
}

// ── Rate limiting (in-memory, per-instance) ──
const store = new Map<string, { count: number; resetAt: number }>();

function edgeRateLimit(
  key: string,
  maxReqs: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxReqs) return false;
  entry.count += 1;
  return true;
}

// ── Password gate helpers ──
const GATE_PUBLIC_PATHS = ["/gate", "/api/gate", "/favicon.ico"];

function isGatePublic(pathname: string): boolean {
  return (
    GATE_PUBLIC_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    ) ||
    pathname.startsWith("/_next/") ||
    pathname.match(
      /\.(ico|png|jpg|jpeg|svg|webp|gif|css|js|woff|woff2|ttf)$/,
    ) !== null
  );
}

function getBearerToken(request: NextRequest): string | null {
  const auth = request.headers.get("Authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

function hasValidAdminBearer(request: NextRequest): boolean {
  const token = getBearerToken(request);
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!token || !expected || token.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminApi = pathname.startsWith("/api/admin");

  // ── 1. Password gate ──
  const sitePassword = process.env.SITE_PASSWORD;
  if (sitePassword && !isGatePublic(pathname)) {
    if (isAdminApi) {
      const bearerToken = getBearerToken(request);
      if (bearerToken && hasValidAdminBearer(request)) {
        // Let bearer-authenticated API calls reach their route-level auth.
      } else if (bearerToken) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
      } else {
        const gateUrl = request.nextUrl.clone();
        gateUrl.pathname = "/gate";
        return NextResponse.redirect(gateUrl);
      }
    } else {
      const cookie = request.cookies.get("site-access");
      if (!cookie || cookie.value !== "granted") {
        const gateUrl = request.nextUrl.clone();
        gateUrl.pathname = "/gate";
        return NextResponse.redirect(gateUrl);
      }
    }
  }

  // ── 2. Admin route protection ──
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-admin-public", "1");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (pathname.startsWith("/admin")) {
    const sessionToken = request.cookies.get("admin_session")?.value;
    if (!sessionToken) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      log("warn", "admin.unauthorized_access", { pathname });
      return NextResponse.redirect(loginUrl);
    }
    log("info", "admin.access", { pathname });
  }

  // ── 3. Rate limiting on admin API routes ──
  if (isAdminApi) {
    // Auth route: very strict (10 req/min per IP)
    if (pathname === "/api/admin/auth") {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "unknown";
      const allowed = edgeRateLimit(`auth:${ip}`, 10, 60_000);
      if (!allowed) {
        return NextResponse.json(
          { error: "Trop de tentatives. Réessayez dans une minute." },
          { status: 429 },
        );
      }
      return NextResponse.next();
    }

    // Expensive IA routes: 10 req/min per IP
    const isIaRoute =
      pathname.startsWith("/api/admin/ia/") &&
      (pathname.includes("generate-descriptions") ||
        pathname.includes("bulk-price-update") ||
        pathname.includes("thematic-cta") ||
        pathname.includes("detect-duplicates"));

    if (isIaRoute) {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "unknown";
      const allowed = edgeRateLimit(`ia:${ip}`, 10, 60_000);
      if (!allowed) {
        return NextResponse.json(
          { error: "Trop de requêtes IA. Réessayez dans une minute." },
          { status: 429 },
        );
      }
      return NextResponse.next();
    }

    // Other admin routes: 120 req/min per IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const allowed = edgeRateLimit(`admin:${ip}`, 120, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Trop de requêtes. Réessayez dans une minute." },
        { status: 429 },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
