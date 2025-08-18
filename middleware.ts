// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

export const config = {
  matcher: ["/api/cron/:path*", "/api/admin/:path*", "/admin", "/api/diag"],
};

export function middleware(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname;

  // Protect cron routes: allow either scheduled Vercel Cron or Bearer CRON_SECRET
  if (path.startsWith("/api/cron/")) {
    const auth = req.headers.get("authorization");
    const fromVercelCron = req.headers.get("x-vercel-cron");
    const bearerOk = !!env.CRON_SECRET && auth === `Bearer ${env.CRON_SECRET}`;
    const scheduledOk = !!fromVercelCron;
    if (!bearerOk && !scheduledOk) {
      return NextResponse.json({ ok: false, error: "unauthorized (cron)" }, { status: 401 });
    }
  }

  // Protect admin + diag with ADMIN_TOKEN (header or ?token=)
  if (path === "/admin" || path.startsWith("/api/admin") || path === "/api/diag") {
    const token = req.headers.get("x-admin-token") ?? url.searchParams.get("token");
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
      return NextResponse.json({ ok: false, error: "unauthorized (admin)" }, { status: 401 });
    }
  }

  return NextResponse.next();
}
