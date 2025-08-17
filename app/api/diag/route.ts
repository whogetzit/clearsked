// app/api/diag/route.ts
import { NextResponse } from "next/server";
import { weatherkitJWT, fetchWeather } from "../../../lib/weatherkit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const envs = {
      TEAM_ID: !!process.env.WEATHERKIT_TEAM_ID,
      SERVICE_ID: !!process.env.WEATHERKIT_SERVICE_ID,
      KEY_ID: !!process.env.WEATHERKIT_KEY_ID,
      P8_BASE64: !!process.env.WEATHERKIT_P8_BASE64,
    };

    let jwtOk = false;
    try {
      weatherkitJWT();
      jwtOk = true;
    } catch {
      jwtOk = false;
    }

    let weatherOk = false;
    let weatherErr: string | undefined;
    try {
      const w = await fetchWeather(40.69, -89.59, "America/Chicago");
      weatherOk = !!w;
    } catch (e: any) {
      weatherOk = false;
      weatherErr = e?.message || "fetch failed";
    }

    return NextResponse.json({ envs, jwtOk, weatherOk, weatherErr });
  } catch (err: any) {
    return NextResponse.json({ message: err?.message || "diag failed" }, { status: 500 });
  }
}
