import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { safeErrorMessage } from "lib/admin/security";

type HealthCheck = {
  name: string;
  url: string;
  method: "GET";
  status: number | null;
  ok: boolean;
  latency_ms: number;
  error: string | null;
};

function overallFromChecks(checks: HealthCheck[]): "ok" | "degraded" | "error" {
  const criticalErrors = checks.filter(
    (check) => !check.ok && check.error !== "migration_required",
  ).length;

  if (criticalErrors >= 3) return "error";
  if (criticalErrors >= 1) return "degraded";
  return "ok";
}

async function runCheck(
  request: NextRequest,
  name: string,
  url: string,
): Promise<HealthCheck> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const auth = request.headers.get("Authorization") ?? "";

  try {
    const response = await fetch(new URL(url, request.url), {
      method: "GET",
      headers: auth ? { Authorization: auth } : {},
      signal: controller.signal,
      cache: "no-store",
    });

    let error: string | null = null;
    if (!response.ok) {
      error = `http_${response.status}`;
      const payload = await response
        .clone()
        .json()
        .catch(async () => ({ error: await response.text().catch(() => "") }));
      const values = Object.values(payload).join(" ").toLowerCase();
      if (
        response.status === 503 &&
        (values.includes("migration_required") || values.includes("migration requise"))
      ) {
        error = "migration_required";
      }
    }

    return {
      name,
      url,
      method: "GET",
      status: response.status,
      ok: response.ok,
      latency_ms: Date.now() - startedAt,
      error,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : safeErrorMessage(error, "request_failed");
    return {
      name,
      url,
      method: "GET",
      status: null,
      ok: false,
      latency_ms: Date.now() - startedAt,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const checks = await Promise.all([
    runCheck(request, "products-list", "/api/admin/products-list?page=1&limit=1"),
    runCheck(request, "products-status", "/api/admin/products/status"),
    runCheck(request, "devis", "/api/admin/devis?limit=1"),
    runCheck(request, "analytics", "/api/admin/analytics"),
  ]);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    overall: overallFromChecks(checks),
    checks,
  });
}
