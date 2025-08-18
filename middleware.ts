// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  // Protect cron, admin APIs, admin page, and diag
  matcher: ["/api/cron/:path*", "/api/admin/:path*", "/admin", "/api/diag"],
};

export function middleware(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname;

  // ---- Protect cron routes ----
  if (path.startsWith("/api/cron/")) {
    const auth = req.headers.get("authorization");
    const fromVercelCron = req.headers.get("x-vercel-cron"); // set by Vercel scheduled invocations

    // Allow either:
    //  - Scheduled Vercel cron (x-vercel-cron header present), OR
    //  - Manual invocations that present Authorization: Bearer <CRON_SECRET>
    const hasSecret = !!process.env.CRON_SECRET;
    const bearerOk = hasSecret && auth === `Bearer ${process.env.CRON_SECRET}`;
    const scheduledOk = !!fromVercelCron;

    if (!bearerOk && !scheduledOk) {
      return NextResponse.json({ ok: false, error: "unauthorized (cron)" }, { status: 401 });
    }
  }

  // ---- Protect admin & diag with ADMIN_TOKEN (header or ?token=) ----
  if (path === "/admin" || path.startsWith("/api/admin") || path === "/api/diag") {
    const token = req.headers.get("x-admin-token") ?? url.searchParams.get("token");
    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
      return NextResponse.json({ ok: false, error: "unauthorized (admin)" }, { status: 401 });
    }
  }

  return NextResponse.next();
}
