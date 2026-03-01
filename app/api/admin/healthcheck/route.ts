/**
 * GET /api/admin/healthcheck
 * Teste les routes critiques et retourne un rapport structuré.
 *
 * Query params:
 *   ?format=json (défaut) | text
 *   ?timeout=5000 (ms par route, défaut 5000)
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";

interface CheckResult {
  name: string;
  url: string;
  method: string;
  expected_status: number;
  actual_status: number | null;
  latency_ms: number | null;
  ok: boolean;
  error?: string;
}

const ROUTES_TO_CHECK: Array<{
  name: string;
  path: string;
  method?: string;
  expected: number;
  body?: string;
  contentType?: string;
}> = [
  { name: "Homepage", path: "/", expected: 200 },
  { name: "Catalogue", path: "/search", expected: 200 },
  { name: "API Search", path: "/api/search?q=test", expected: 200 },
  { name: "API Products List (auth)", path: "/api/admin/products-list?page=0&limit=1", expected: 200 },
  { name: "API Analytics (auth)", path: "/api/admin/analytics", expected: 200 },
  { name: "API Auth Login (no body)", path: "/api/admin/auth", method: "POST", expected: 400, body: "{}", contentType: "application/json" },
  { name: "404 handling (API)", path: "/api/__healthcheck_missing_route__", expected: 404 },
  { name: "API Proposals", path: "/api/admin/proposals", expected: 200 },
  { name: "SEO Audit API", path: "/api/admin/seo/audit?limit=1", expected: 200 },
];

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "json";
  const timeoutMs = Math.min(parseInt(searchParams.get("timeout") ?? "5000"), 30000);

  // Build base URL from request
  const base = `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  // Build auth headers for admin routes
  const cookie = req.headers.get("cookie") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";

  const results: CheckResult[] = [];
  const startAll = Date.now();

  for (const route of ROUTES_TO_CHECK) {
    const url = `${base}${route.path}`;
    const start = Date.now();
    let actual_status: number | null = null;
    let error: string | undefined;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const headers: Record<string, string> = {};
      if (cookie) headers["cookie"] = cookie;
      if (authHeader) headers["authorization"] = authHeader;
      if (route.contentType) headers["content-type"] = route.contentType;

      const res = await fetch(url, {
        method: route.method ?? "GET",
        headers,
        body: route.body,
        signal: controller.signal,
        // No cache for healthcheck
        cache: "no-store",
      });

      clearTimeout(timer);
      actual_status = res.status;
    } catch (e) {
      error = e instanceof Error ? (e.name === "AbortError" ? `Timeout (${timeoutMs}ms)` : e.message) : String(e);
    }

    const latency_ms = Date.now() - start;
    const ok = actual_status === route.expected;

    results.push({
      name: route.name,
      url: route.path,
      method: route.method ?? "GET",
      expected_status: route.expected,
      actual_status,
      latency_ms: error ? null : latency_ms,
      ok,
      ...(error ? { error } : {}),
    });
  }

  const totalMs = Date.now() - startAll;
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const status = failed === 0 ? "healthy" : failed <= 2 ? "degraded" : "unhealthy";

  if (format === "text") {
    const lines = [
      `PRODES Healthcheck — ${new Date().toISOString()}`,
      `Status: ${status.toUpperCase()} (${passed}/${results.length} OK, ${totalMs}ms total)`,
      "",
      ...results.map((r) => {
        const mark = r.ok ? "✓" : "✗";
        const latency = r.latency_ms != null ? `${r.latency_ms}ms` : "—";
        const detail = r.error ? ` [${r.error}]` : ` (HTTP ${r.actual_status ?? "—"})`;
        return `${mark} ${r.name.padEnd(30)} ${r.method.padEnd(4)} ${String(r.expected_status)} -> ${String(r.actual_status ?? "?").padEnd(3)} ${latency}${r.ok ? "" : detail}`;
      }),
    ];
    return new NextResponse(lines.join("\n"), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({
    status,
    timestamp: new Date().toISOString(),
    duration_ms: totalMs,
    summary: { total: results.length, passed, failed },
    checks: results,
  });
}
