// app/api/debug/subscribers/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["error", "warn"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

function maskPhone(p?: string | null) {
  if (!p) return null;
  // keep +1 and last 2 digits
  return p.replace(/^(\+\d)(\d+)(\d{2})$/, (_m, a, mid, b) => a + "*".repeat(mid.length) + b);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || ""; // optional substring filter
  const take = Number(url.searchParams.get("take") || 20);

  const where: any = q
    ? { phoneE164: { contains: q } }
    : {};

  const rows = await prisma.subscriber.findMany({
    where,
    take,
    orderBy: { createdAt: "desc" },
    select: {
      phoneE164: true,
      active: true,
      zip: true,
      durationMin: true,
      lastSentAt: true,
      prefs: true,
      createdAt: true,
    },
  });

  const data = rows.map((r) => ({
    phone: maskPhone(r.phoneE164),
    active: r.active,
    zip: r.zip,
    durationMin: r.durationMin,
    lastSentAt: r.lastSentAt,
    timeZone: (r.prefs as any)?.timeZone ?? null,
    deliveryHourLocal: (r.prefs as any)?.deliveryHourLocal ?? null,
    createdAt: r.createdAt,
  }));

  return NextResponse.json({ count: rows.length, sample: data });
}
