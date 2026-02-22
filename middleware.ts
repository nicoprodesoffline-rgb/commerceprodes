import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function log(level: 'info' | 'warn', event: string, data?: Record<string, unknown>) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...data }));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Exclude /admin/login explicitly — no auth check needed
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return NextResponse.next();
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
