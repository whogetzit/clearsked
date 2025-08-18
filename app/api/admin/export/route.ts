// app/api/admin/export/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reuse Prisma in dev
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["error", "warn"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** -------- helpers -------- */
function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  // keep country code & last 2 digits: +1********21
  return e164.replace(/^(\+\d)(\d+)(\d{2})$/, (_m, a, mid, b) => a + "*".repeat(mid.length) + b);
}
function toISO(d?: Date | null): string {
  return d ? new Date(d).toISOString() : "";
}

/** Flattens a subscriber row to plain key/value for CSV or JSON */
function flattenSub(s: any, opts: { mask: boolean }) {
  const p = (s.prefs as any) || {};
  const timeZone = p.timeZone ?? s.timeZone ?? "";
  const deliveryHourLocal = p.deliveryHourLocal ?? s.deliveryHourLocal ?? "";

  return {
    phone: opts.mask ? maskPhone(s.phoneE164) : s.phoneE164,
    active: s.active,
    zip: s.zip,
    latitude: s.latitude,
    longitude: s.longitude,
    durationMin: s.durationMin,
    timeZone,
    deliveryHourLocal,
    createdAt: toISO(s.createdAt),
    lastSentAt: toISO(s.lastSentAt),

    // preferences (may be undefined)
    tempMin: p.tempMin ?? "",
    tempMax: p.tempMax ?? "",
    windMax: p.windMax ?? "",
    uvMax: p.uvMax ?? "",
    aqiMax: p.aqiMax ?? "",
    humidityMax: p.humidityMax ?? "",
    precipMax: p.precipMax ?? "",
    cloudMax: p.cloudMax ?? "",
  };
}

/** -------- GET /api/admin/export --------
 * Protected by middleware.ts (ADMIN_TOKEN required via header or ?token=)
 * Query params:
 *   - format=csv|json (default csv)
 *   - mask=1 (mask phone numbers)
 *   - active=1 (only active)
 *   - zip=61550 (filter by ZIP)
 *   - createdSince=2025-08-01 (ISO date; gte)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") || "csv").toLowerCase();
    const mask = ["1", "true", "yes"].includes(
      (url.searchParams.get("mask") || "").toLowerCase()
    );
    const activeOnly = ["1", "true", "yes"].includes(
      (url.searchParams.get("active") || "").toLowerCase()
    );
    const zip = url.searchParams.get("zip") || undefined;
    const createdSinceRaw = url.searchParams.get("createdSince") || undefined;

    const where: any = {};
    if (activeOnly) where.active = true;
    if (zip) where.zip = zip;
    if (createdSinceRaw) {
      const dt = new Date(createdSinceRaw);
      if (!isNaN(dt.getTime())) where.createdAt = { gte: dt };
    }

    const subs = await prisma.subscriber.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const rows = subs.map((s) => flattenSub(s, { mask }));

    if (format === "json") {
      return NextResponse.json({ ok: true, count: rows.length, rows });
    }

    // CSV
    const headers = [
      "phone",
      "active",
      "zip",
      "latitude",
      "longitude",
      "durationMin",
      "timeZone",
      "deliveryHourLocal",
      "createdAt",
      "lastSentAt",
      "tempMin",
      "tempMax",
      "windMax",
      "uvMax",
      "aqiMax",
      "humidityMax",
      "precipMax",
      "cloudMax",
    ];

    const csvLines = [
      headers.join(","), // header
      ...rows.map((r) => headers.map((h) => csvEscape((r as any)[h])).join(",")),
    ];
    const csv = csvLines.join("\n");

    const yyyymmdd = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    })
      .format(new Date())
      .replace(/-/g, "");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="clearsked-subscribers-${yyyymmdd}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "export_failed" },
      { status: 500 }
    );
  }
}
