import { NextResponse } from "next/server";
import { metaConfigured, metaPixelSet } from "@/lib/meta";
import { balance, steadfastConfigured } from "@/lib/steadfast";
import { staffFromRequest } from "@/lib/supabase";

// Which connections are set up. Never returns the keys themselves.
export async function GET(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  let steadfast: { connected: boolean; balance?: number; error?: string } = { connected: steadfastConfigured };
  if (steadfastConfigured && staff.role === "owner") {
    try {
      steadfast = { connected: true, balance: await balance() };
    } catch (e) {
      steadfast = { connected: true, error: (e as Error).message };
    }
  }
  return NextResponse.json({
    steadfast,
    meta: { pixel: metaPixelSet, server: metaConfigured, testMode: Boolean(process.env.META_TEST_EVENT_CODE) },
  });
}
