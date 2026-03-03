import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js Edge Middleware.
 * Applies lightweight rate limiting to admin API routes.
 * Note: edge middleware cannot use Node.js crypto → uses basic IP-based throttling.
 */

// In-memory store (per-instance, resets on cold start)
const store = new Map<string, { count: number; resetAt: number }>();

function edgeRateLimit(key: string, maxReqs: number, windowMs: number): boolean {
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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only apply to admin API routes
  if (!pathname.startsWith("/api/admin")) {
    return NextResponse.next();
  }

  // Auth route: very strict (10 req/min per IP against brute-force)
  if (pathname === "/api/admin/auth") {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
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
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const allowed = edgeRateLimit(`ia:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Trop de requêtes IA. Réessayez dans une minute." },
        { status: 429 },
      );
    }
    return NextResponse.next();
  }

  // Other admin routes: 120 req/min per IP (normal usage limit)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = edgeRateLimit(`admin:${ip}`, 120, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez dans une minute." },
      { status: 429 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/admin/:path*"],
};
