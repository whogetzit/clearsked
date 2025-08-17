// app/api/admin/subscribers/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function maskPhone(p?: string | null) {
  if (!p) return null;
  // +1XXXXXXXXXX -> +1•••-•••-1234
  const last4 = p.slice(-4);
  return `•••-•••-${last4}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const headerKey = req.headers.get("x-admin-key");
  const queryKey = url.searchParams.get("key"); // convenience for curl/browser
  const adminKey = process.env.ADMIN_KEY;

  if (!adminKey || (headerKey ?? queryKey) !== adminKey) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("limit") ?? 50))
  );

  const rows = await prisma.subscriber.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      phoneE164: true,
      zip: true,
      durationMin: true,
      active: true,
      lastSentAt: true,
      prefs: true,
    },
  });

  const data = rows.map((r) => ({
    ...r,
    phoneMasked: maskPhone(r.phoneE164),
  }));

  return NextResponse.json({ count: data.length, rows: data }, { status: 200 });
}
