// app/api/health/db/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

// Prisma needs Node.js runtime (not Edge)
export const runtime = "nodejs";
// Always compute fresh status
export const dynamic = "force-dynamic";

function inspectDbUrl(url?: string) {
  try {
    if (!url) return {};
    const u = new URL(url);
    const pooled =
      u.hostname.includes("-pooler") || u.searchParams.get("pgbouncer") === "true";
    return {
      host: u.hostname,
      database: u.pathname.replace(/^\//, ""),
      pooled,
    };
  } catch {
    return {};
  }
}

export async function GET() {
  const started = Date.now();
  let ok = false;
  let latency: number | null = null;
  let error: string | null = null;

  try {
    // Fast no-op query
    await prisma.$queryRaw`SELECT 1`;
    ok = true;
    latency = Date.now() - started;
  } catch (e: any) {
    error = e?.message ?? "unknown";
  }

  const status = ok ? 200 : 503;
  const payload = {
    status: ok ? "ok" : "error",
    env: process.env.VERCEL_ENV ?? "local",
    region: process.env.VERCEL_REGION ?? "unknown",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    db: {
      ok,
      latency_ms: latency,
      error,
      ...inspectDbUrl(process.env.DATABASE_URL),
    },
  };

  return NextResponse.json(payload, { status });
}
