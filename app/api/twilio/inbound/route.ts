// app/api/twilio/inbound/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import Twilio from "twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// If your middleware protects /api/*, consider exempting this path or
// checking Twilio signature *before* rejecting unauthenticated callers.

const globalForPrisma = globalThis as any;
const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["error", "warn"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

function fullUrl(req: Request): string {
  // Twilio signs the full URL (scheme+host+path)
  const u = new URL(req.url);
  return `${u.origin}${u.pathname}`;
}

export async function POST(req: Request) {
  try {
    // Twilio posts x-www-form-urlencoded
    const raw = await req.text();
    const params = Object.fromEntries(new URLSearchParams(raw));
    const signature = req.headers.get("x-twilio-signature") || "";
    const url = fullUrl(req);

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      return NextResponse.json({ ok: false, error: "twilio creds missing" }, { status: 500 });
    }

    const valid = Twilio.validateRequest(token, signature, url, params);
    if (!valid) {
      return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 403 });
    }

    const from = params.From as string | undefined;
    const body = (params.Body as string | undefined)?.trim().toUpperCase() || "";

    if (!from) {
      return NextResponse.json({ ok: false, error: "no From" }, { status: 400 });
    }

    let setActive: boolean | null = null;
    if (body === "STOP" || body === "STOPALL" || body === "UNSUBSCRIBE" || body === "CANCEL" || body === "END" || body === "QUIT") {
      setActive = false;
    } else if (body === "START" || body === "YES" || body === "UNSTOP") {
      setActive = true;
    }

    if (setActive !== null) {
      await prisma.subscriber.updateMany({
        where: { phoneE164: from },
        data: { active: setActive },
      });
    }

    // Twilio expects a 200. We can optionally reply a message body, but not required.
    return NextResponse.json({ ok: true, from, updatedActive: setActive });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "err" }, { status: 500 });
  }
}
