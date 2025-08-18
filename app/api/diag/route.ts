// app/api/diag/route.ts
import "server-only";
import { NextResponse } from "next/server";
import Twilio from "twilio";
import { env } from "@/lib/env";
import { weatherkitJWT, fetchWeather } from "@/lib/weatherkit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const redactSid = (sid?: string) => (sid ? `${sid.slice(0, 2)}…${sid.slice(-6)}` : undefined);

export async function GET() {
  // WeatherKit sanity
  const weatherEnvs = {
    TEAM_ID: !!env.WEATHERKIT_TEAM_ID,
    SERVICE_ID: !!env.WEATHERKIT_SERVICE_ID,
    KEY_ID: !!env.WEATHERKIT_KEY_ID,
    P8_BASE64: !!env.WEATHERKIT_P8_BASE64,
  };

  let jwtOk = false;
  try { weatherkitJWT(); jwtOk = true; } catch { jwtOk = false; }

  let weatherOk = false, weatherErr: string | undefined;
  try { await fetchWeather(40.69, -89.59, "America/Chicago"); weatherOk = true; }
  catch (e: any) { weatherOk = false; weatherErr = e?.message || "fetch failed"; }

  // Twilio env flags
  const twilioEnvs = {
    ACCOUNT_SID: !!env.TWILIO_ACCOUNT_SID,
    AUTH_TOKEN: !!env.TWILIO_AUTH_TOKEN,
    FROM: !!env.TWILIO_FROM,
    MESSAGING_SERVICE_SID: !!env.TWILIO_MESSAGING_SERVICE_SID,
  };

  let twilioAuthOk = false;
  let twilioAuthErr: string | undefined;
  let accountSidRedacted: string | undefined;

  const messagingService = {
    present: !!env.TWILIO_MESSAGING_SERVICE_SID,
    ok: false,
    hasSender: false,
    name: undefined as string | undefined,
    sid: redactSid(env.TWILIO_MESSAGING_SERVICE_SID),
    error: undefined as string | undefined,
  };

  const fromNumber = {
    present: !!env.TWILIO_FROM,
    owned: false,
    e164: env.TWILIO_FROM || undefined,
    error: undefined as string | undefined,
  };

  if (twilioEnvs.ACCOUNT_SID && twilioEnvs.AUTH_TOKEN) {
    try {
      const client = Twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);

      try {
        const acct = await client.api.v2010.accounts(env.TWILIO_ACCOUNT_SID!).fetch();
        twilioAuthOk = !!acct?.sid;
        accountSidRedacted = redactSid(acct?.sid);
      } catch (e: any) {
        twilioAuthOk = false;
        twilioAuthErr = e?.message || "account fetch failed";
      }

      if (messagingService.present) {
        const mss = env.TWILIO_MESSAGING_SERVICE_SID!;
        try {
          const svc = await client.messaging.v1.services(mss).fetch();
          messagingService.ok = !!svc?.sid;
          messagingService.name = svc?.friendlyName ?? undefined;

          try {
            const nums = await client.messaging.v1.services(mss).phoneNumbers.list({ limit: 1 });
            messagingService.hasSender = (nums?.length ?? 0) > 0;
          } catch (e: any) {
            messagingService.error = messagingService.error ?? e?.message;
          }
        } catch (e: any) {
          messagingService.ok = false;
          messagingService.error = e?.message || "service fetch failed";
        }
      }

      if (fromNumber.present) {
        try {
          const list = await client.incomingPhoneNumbers.list({ phoneNumber: env.TWILIO_FROM, limit: 1 });
          fromNumber.owned = (list?.length ?? 0) > 0;
        } catch (e: any) {
          fromNumber.owned = false;
          fromNumber.error = e?.message || "from-number check failed";
        }
      }
    } catch (e: any) {
      twilioAuthOk = false;
      twilioAuthErr = e?.message || "twilio client init failed";
    }
  }

  return NextResponse.json({
    weatherEnvs,
    twilioEnvs,
    jwtOk,
    weatherOk,
    weatherErr,
    twilio: {
      authOk: twilioAuthOk,
      authError: twilioAuthErr,
      accountSid: accountSidRedacted,
      messagingService,
      fromNumber,
    },
  });
}
