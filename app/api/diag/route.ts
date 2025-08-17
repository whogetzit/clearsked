// app/api/diag/route.ts
import { NextResponse } from "next/server";
import { weatherkitJWT, fetchWeather } from "../../../lib/weatherkit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const weatherEnvs = {
      TEAM_ID: !!process.env.WEATHERKIT_TEAM_ID,
      SERVICE_ID: !!process.env.WEATHERKIT_SERVICE_ID,
      KEY_ID: !!process.env.WEATHERKIT_KEY_ID,
      P8_BASE64: !!process.env.WEATHERKIT_P8_BASE64,
    };

    const twilioEnvs = {
      ACCOUNT_SID: !!process.env.TWILIO_ACCOUNT_SID,
      AUTH_TOKEN: !!process.env.TWILIO_AUTH_TOKEN,
      FROM: !!process.env.TWILIO_FROM,
      MESSAGING_SERVICE_SID: !!process.env.TWILIO_MESSAGING_SERVICE_SID,
    };

    let jwtOk = false;
    try { weatherkitJWT(); jwtOk = true; } catch { /* ignore */ }

    let weatherOk = false, weatherErr: string | undefined;
    try {
      const w = await fetchWeather(40.69, -89.59, "America/Chicago");
      weatherOk = !!w;
    } catch (e: any) {
      weatherOk = false; weatherErr = e?.message || "fetch failed";
    }

    return NextResponse.json({ weatherEnvs, twilioEnvs, jwtOk, weatherOk, weatherErr });
  } catch (err: any) {
    return NextResponse.json({ message: err?.message || "diag failed" }, { status: 500 });
  }
}
