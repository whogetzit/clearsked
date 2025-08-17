// pages/api/signup.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/db";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const zipcodes = require("zipcodes");

type Prefs = { tempMin?: number; tempMax?: number; windMax?: number; uvMax?: number; aqiMax?: number; };

function toInt(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? Math.round(n as number) : fallback;
}
function normalizeE164US(input: string): string | null {
  const digits = (input || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (input.startsWith("+") && digits.length >= 10) return input;
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ message: "Method Not Allowed" });
    }

    // simple bot traps
    const hp = (req.body?.hp ?? "").toString();
    if (hp.trim()) return res.status(400).json({ message: "Bad request" });
    const latencySec = Number(req.headers["x-form-latency"]);
    if (Number.isFinite(latencySec) && latencySec < 1) {
      // too fast; likely not human
      return res.status(400).json({ message: "Please try again" });
    }

    const {
      zip,
      phone,
      durationMin: dm1,
      duration: dm2, // accept either key
      prefs: rawPrefs,
      deliveryHourLocal,
      timeZone,
    } = (req.body ?? {}) as {
      zip?: string;
      phone?: string;
      durationMin?: number | string;
      duration?: number | string;
      prefs?: Prefs;
      deliveryHourLocal?: number;
      timeZone?: string;
    };

    if (!zip || !/^\d{5}$/.test(zip)) return res.status(400).json({ message: "Invalid ZIP" });
    const phoneE164 = phone ? normalizeE164US(phone) : null;
    if (!phoneE164) return res.status(400).json({ message: "Invalid phone" });

    const z = zipcodes.lookup(zip);
    if (!z || typeof z.latitude !== "number" || typeof z.longitude !== "number") {
      return res.status(400).json({ message: "ZIP not found" });
    }

    const durationInt = toInt(dm1 ?? dm2, 60);

    const prefs: Prefs & { deliveryHourLocal?: number; timeZone?: string } = {
      ...(rawPrefs ?? {}),
      ...(typeof deliveryHourLocal === "number" ? { deliveryHourLocal } : {}),
      ...(timeZone ? { timeZone } : {}),
    };

    const data = {
      zip,
      latitude: z.latitude as number,
      longitude: z.longitude as number,
      durationMin: durationInt,
      active: true,
      prefs,
    };

    const out = await prisma.subscriber.upsert({
      where: { phoneE164 },
      update: data,
      create: { phoneE164, ...data },
    });

    return res.status(200).json({ ok: true, id: out.id });
  } catch (err: any) {
    console.error("signup error", err);
    return res.status(500).json({ message: err?.message ?? "Server error" });
  }
}
