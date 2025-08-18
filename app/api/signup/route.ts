// app/api/signup/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import zipcodes from "zipcodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient({ log: ["error", "warn"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// naive in-memory limiter (ok for MVP; use Upstash for prod)
const lastHit = new Map<string, number>();

type Prefs = {
  tempMin?: number; tempMax?: number;
  windMax?: number; uvMax?: number; aqiMax?: number;
  humidityMax?: number; precipMax?: number; cloudMax?: number;
  timeZone?: string; deliveryHourLocal?: number;
};

function validatePhone(e164: string): boolean {
  return /^\+\d{10,15}$/.test(e164);
}
function validateZip(zip: string): boolean {
  return /^\d{5}$/.test(zip);
}
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function parseIntSafe(v: any, def: number) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : def; }

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  if (now - (lastHit.get(ip) ?? 0) < 4000) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  lastHit.set(ip, now);

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const phone = String(body?.phone ?? "").trim();
  const zip = String(body?.zip ?? "").trim();
  if (!validatePhone(phone)) return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 400 });
  if (!validateZip(zip)) return NextResponse.json({ ok: false, error: "invalid_zip" }, { status: 400 });

  const z = zipcodes.lookup(zip);
  if (!z || typeof z.latitude !== "number" || typeof z.longitude !== "number") {
    return NextResponse.json({ ok: false, error: "zip_not_found" }, { status: 400 });
  }

  const durationMin = clamp(parseIntSafe(body?.durationMin, 60), 10, 240);

  const prefs: Prefs = {
    tempMin: clamp(parseIntSafe(body?.prefs?.tempMin, 40), -40, 130),
    tempMax: clamp(parseIntSafe(body?.prefs?.tempMax, 70), -40, 130),
    windMax: clamp(parseIntSafe(body?.prefs?.windMax, 10), 0, 100),
    uvMax: clamp(parseIntSafe(body?.prefs?.uvMax, 5), 0, 12),
    aqiMax: clamp(parseIntSafe(body?.prefs?.aqiMax, 60), 0, 500),
    humidityMax: clamp(parseIntSafe(body?.prefs?.humidityMax ?? 100, 0), 0, 100),
    precipMax: clamp(parseIntSafe(body?.prefs?.precipMax ?? 40, 0), 0, 100),
    cloudMax: clamp(parseIntSafe(body?.prefs?.cloudMax ?? 80, 0), 0, 100),
    timeZone: String(body?.prefs?.timeZone || "") || undefined,
    deliveryHourLocal: parseIntSafe(body?.prefs?.deliveryHourLocal, 5),
  };

  const upsert = await prisma.subscriber.upsert({
    where: { phoneE164: phone },
    update: {
      zip,
      latitude: z.latitude,
      longitude: z.longitude,
      durationMin,
      active: true,
      prefs,
    },
    create: {
      phoneE164: phone,
      zip,
      latitude: z.latitude,
      longitude: z.longitude,
      durationMin,
      active: true,
      prefs,
    },
  });

  return NextResponse.json({ ok: true, id: upsert.id, createdAt: upsert.createdAt });
}
