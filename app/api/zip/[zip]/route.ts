// app/api/zip/[zip]/route.ts
import { NextResponse } from "next/server";
import zipcodes from "zipcodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { zip: string } }
) {
  const z = params.zip;
  if (!/^\d{5}$/.test(z)) {
    return NextResponse.json({ message: "Invalid ZIP" }, { status: 400 });
  }

  const info = zipcodes.lookup(z);
  if (!info) {
    return NextResponse.json({ message: "ZIP not found" }, { status: 404 });
  }

  return NextResponse.json({
    city: info.city,
    state: info.state,
    latitude: info.latitude,
    longitude: info.longitude,
  });
}
