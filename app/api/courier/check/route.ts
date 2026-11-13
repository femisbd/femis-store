import { NextResponse } from "next/server";
import { fraudCheck, steadfastConfigured } from "@/lib/steadfast";
import { staffFromRequest } from "@/lib/supabase";

// Customer's delivery record across all Steadfast merchants, by phone number. Staff only.
export async function GET(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!steadfastConfigured) return NextResponse.json({ error: "not_connected" }, { status: 400 });
  const phone = new URL(request.url).searchParams.get("phone") ?? "";
  if (!/^01[3-9]\d{8}$/.test(phone)) return NextResponse.json({ error: "Bad phone number" }, { status: 400 });
  try {
    const r = await fraudCheck(phone);
    return NextResponse.json({
      parcels: Number(r.total_parcels ?? 0),
      delivered: Number(r.total_delivered ?? 0),
      cancelled: Number(r.total_cancelled ?? 0),
      reports: Array.isArray(r.total_fraud_reports) ? r.total_fraud_reports.length : 0,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
