// app/api/diag/route.ts
import { NextResponse } from "next/server";
import Twilio from "twilio";
import { weatherkitJWT, fetchWeather } from "../../../lib/weatherkit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const redactSid = (sid?: string) => (sid ? `${sid.slice(0, 2)}…${sid.slice(-6)}` : undefined);

export async function GET() {
  // WeatherKit envs + sanity checks
  const weatherEnvs = {
    TEAM_ID: !!process.env.WEATHERKIT_TEAM_ID,
    SERVICE_ID: !!process.env.WEATHERKIT_SERVICE_ID,
    KEY_ID: !!process.env.WEATHERKIT_KEY_ID,
    P8_BASE64: !!process.env.WEATHERKIT_P8_BASE64,
  };

  let jwtOk = false;
  try { weatherkitJWT(); jwtOk = true; } catch { jwtOk = false; }

  let weatherOk = false, weatherErr: string | undefined;
  try {
    const w = await fetchWeather(40.69, -89.59, "America/Chicago");
    weatherOk = !!w;
  } catch (e: any) {
    weatherOk = false; weatherErr = e?.message || "fetch failed";
  }

  // Twilio env flags
  const twilioEnvs = {
    ACCOUNT_SID: !!process.env.TWILIO_ACCOUNT_SID,
    AUTH_TOKEN: !!process.env.TWILIO_AUTH_TOKEN,
    FROM: !!process.env.TWILIO_FROM,
    MESSAGING_SERVICE_SID: !!process.env.TWILIO_MESSAGING_SERVICE_SID,
  };

  let twilioAuthOk = false;
  let twilioAuthErr: string | undefined;
  let accountSidRedacted: string | undefined;

  const messagingService = {
    present: !!process.env.TWILIO_MESSAGING_SERVICE_SID,
    ok: false,
    hasSender: false,
    name: undefined as string | undefined,
    sid: redactSid(process.env.TWILIO_MESSAGING_SERVICE_SID),
    error: undefined as string | undefined,
  };

  const fromNumber = {
    present: !!process.env.TWILIO_FROM,
    owned: false,
    e164: process.env.TWILIO_FROM || undefined,
    error: undefined as string | undefined,
  };

  if (twilioEnvs.ACCOUNT_SID && twilioEnvs.AUTH_TOKEN) {
    try {
      const client = Twilio(
        process.env.TWILIO_ACCOUNT_SID as string,
        process.env.TWILIO_AUTH_TOKEN as string
      );

      // Auth check
      try {
        const acct = await client.api.v2010.accounts(process.env.TWILIO_ACCOUNT_SID as string).fetch();
        twilioAuthOk = !!acct?.sid;
        accountSidRedacted = redactSid(acct?.sid);
      } catch (e: any) {
        twilioAuthOk = false;
        twilioAuthErr = e?.message || "account fetch failed";
      }

      // Messaging Service check
      if (messagingService.present) {
        const mss = process.env.TWILIO_MESSAGING_SERVICE_SID as string;
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

      // Direct number ownership (if using TWILIO_FROM)
      if (fromNumber.present) {
        try {
          const list = await client.incomingPhoneNumbers.list({
            phoneNumber: process.env.TWILIO_FROM,
            limit: 1,
          });
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
