// app/api/zip/[zip]/route.ts
import { NextResponse } from "next/server";
// CJS package works fine in a route file
// eslint-disable-next-line @typescript-eslint/no-var-requires
const zipcodes = require("zipcodes");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { zip: string } }) {
  const zip = params.zip ?? "";
  if (!/^\d{5}$/.test(zip)) return NextResponse.json({ message: "bad zip" }, { status: 400 });
  const z = zipcodes.lookup(zip);
  if (!z) return NextResponse.json({ message: "not found" }, { status: 404 });
  return NextResponse.json({ city: z.city, state: z.state, latitude: z.latitude, longitude: z.longitude });
}
