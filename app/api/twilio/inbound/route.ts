// app/api/twilio/inbound/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import Twilio from "twilio";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalForPrisma = globalThis as any;
const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["error", "warn"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

function fullUrl(req: Request): string {
  const u = new URL(req.url);
  return `${u.origin}${u.pathname}`;
}

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const params = Object.fromEntries(new URLSearchParams(raw));
    const signature = req.headers.get("x-twilio-signature") || "";
    const url = fullUrl(req);

    if (!env.TWILIO_AUTH_TOKEN) {
      return NextResponse.json({ ok: false, error: "twilio auth token missing" }, { status: 500 });
    }

    const valid = Twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params);
    if (!valid) return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 403 });

    const from = params.From as string | undefined;
    const body = (params.Body as string | undefined)?.trim().toUpperCase() || "";
    if (!from) return NextResponse.json({ ok: false, error: "no From" }, { status: 400 });

    let setActive: boolean | null = null;
    if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(body)) setActive = false;
    else if (["START", "YES", "UNSTOP"].includes(body)) setActive = true;

    if (setActive !== null) {
      await prisma.subscriber.updateMany({ where: { phoneE164: from }, data: { active: setActive } });
    }

    return NextResponse.json({ ok: true, from, updatedActive: setActive });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "err" }, { status: 500 });
  }
}
