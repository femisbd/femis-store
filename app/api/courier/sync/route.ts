import { NextResponse } from "next/server";
import { COURIER_STATUS_LABEL, parcelStatus, steadfastConfigured } from "@/lib/steadfast";
import { rpc, select, staffFromRequest } from "@/lib/supabase";

// Asks Steadfast for the latest status of shipped orders and moves them to delivered or returned.
export async function POST(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff || (staff.role !== "owner" && staff.role !== "orders")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!steadfastConfigured) return NextResponse.json({ error: "Steadfast is not connected yet." }, { status: 400 });

  const { orders } = (await request.json().catch(() => ({}))) as { orders?: string[] };
  const filter = Array.isArray(orders) && orders.length
    ? `&order_no=in.(${orders.filter((o) => /^FM\d+$/.test(o)).slice(0, 100).join(",")})`
    : "&status=eq.shipped&order=courier_checked_at.asc.nullsfirst&limit=100";
  const rows = await select<{ order_no: string; courier_consignment_id: string }[]>(
    `orders?select=order_no,courier_consignment_id&courier_consignment_id=not.is.null${filter}`,
    staff.token,
  );

  let delivered = 0, returned = 0, failed = 0;
  const updates: { order: string; courier: string; status: string }[] = [];
  for (const r of rows) {
    try {
      const raw = await parcelStatus(r.courier_consignment_id);
      const res = await rpc<{ ok: boolean; status: string }>("apply_courier_status", { p_order_no: r.order_no, p_courier_status: raw }, staff.token);
      if (res.status === "delivered") delivered++;
      if (res.status === "returned") returned++;
      updates.push({ order: r.order_no, courier: COURIER_STATUS_LABEL[raw] ?? raw, status: res.status });
    } catch {
      failed++;
    }
  }
  return NextResponse.json({ checked: rows.length, delivered, returned, failed, updates });
}
