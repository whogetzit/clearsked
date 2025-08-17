// app/api/signup/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import zipcodes from "zipcodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient({ log: ["error", "warn"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

function toE164US(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (/^\+\d{8,15}$/.test(input)) return input;
  throw new Error("Invalid phone number");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawPhone = String(body.phone || "");
    const zip = String(body.zip || "");
    const durationMin = Number(body.durationMin ?? 60);
    const prefs = body.prefs ?? {};
    const timeZone = body.timeZone || prefs.timeZone || "America/Chicago";

    const phoneE164 = toE164US(rawPhone);
    if (!/^\d{5}$/.test(zip)) {
      return NextResponse.json({ message: "Invalid ZIP" }, { status: 400 });
    }

    const z = zipcodes.lookup(zip);
    if (!z) {
      return NextResponse.json({ message: "ZIP not found" }, { status: 404 });
    }

    const data = {
      phoneE164,
      zip,
      latitude: Number(z.latitude),
      longitude: Number(z.longitude),
      durationMin: Math.max(10, Math.min(240, durationMin)),
      active: true as const,
      prefs: { ...prefs, timeZone } as any,
    };

    const row = await prisma.subscriber.upsert({
      where: { phoneE164 },
      update: data,
      create: data,
    });

    return NextResponse.json({
      ok: true,
      phoneE164: row.phoneE164,
      zip: row.zip,
      durationMin: row.durationMin,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message || "signup failed" },
      { status: 400 }
    );
  }
}
