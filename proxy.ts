import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function log(level: 'info' | 'warn', event: string, data?: Record<string, unknown>) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...data }));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Exclude /admin/login explicitly — no auth check needed
  // Pass a request header so the admin layout can skip its own auth check
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-admin-public", "1");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Protect all /admin/* routes
  if (pathname.startsWith("/admin")) {
    const sessionToken = request.cookies.get("admin_session")?.value;

    if (!sessionToken) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      log('warn', 'admin.unauthorized_access', { pathname });
      return NextResponse.redirect(loginUrl);
    }

    log('info', 'admin.access', { pathname });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
