import { NextResponse } from "next/server";
import { createParcel, steadfastConfigured } from "@/lib/steadfast";
import { rpc, select, staffFromRequest } from "@/lib/supabase";

type Order = {
  order_no: string; name: string; phone: string; address: string; status: string; on_delivery: number;
  advance: number; advance_verified: boolean; note: string; courier_consignment_id: string | null;
  order_items: { name: string; colour: string; size: string | null; qty: number }[];
};

// Books one or more orders with Steadfast. Owner and order staff only.
export async function POST(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff || (staff.role !== "owner" && staff.role !== "orders")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!steadfastConfigured) return NextResponse.json({ error: "Steadfast is not connected yet." }, { status: 400 });

  const { orders } = (await request.json().catch(() => ({}))) as { orders?: string[] };
  const list = Array.isArray(orders) ? orders.filter((o) => /^FM\d+$/.test(o)).slice(0, 50) : [];
  if (!list.length) return NextResponse.json({ error: "No orders chosen." }, { status: 400 });

  const rows = await select<Order[]>(
    `orders?select=order_no,name,phone,address,status,on_delivery,advance,advance_verified,note,courier_consignment_id,order_items(name,colour,size,qty)&order_no=in.(${list.join(",")})`,
    staff.token,
  );

  const results: { order: string; ok: boolean; message: string }[] = [];
  for (const no of list) {
    const o = rows.find((r) => r.order_no === no);
    if (!o) { results.push({ order: no, ok: false, message: "Order not found." }); continue; }
    if (o.courier_consignment_id) { results.push({ order: no, ok: false, message: "Already booked." }); continue; }
    if (o.status !== "confirmed" && o.status !== "packed") { results.push({ order: no, ok: false, message: "Only confirmed or packed orders can be booked." }); continue; }
    if (o.advance > 0 && !o.advance_verified) { results.push({ order: no, ok: false, message: "Verify the bKash advance first." }); continue; }
    try {
      const items = o.order_items.map((i) => `${i.qty}x ${i.name} (${i.colour}${i.size ? `, ${i.size}` : ""})`).join("; ");
      const c = await createParcel({ invoice: o.order_no, name: o.name, phone: o.phone, address: o.address, cod: o.on_delivery, note: o.note, items });
      const saved = await rpc<{ ok: boolean; error?: string }>(
        "courier_booked",
        { p_order_no: o.order_no, p_consignment_id: String(c.consignment_id), p_tracking_code: c.tracking_code, p_courier_status: c.status },
        staff.token,
      );
      results.push({ order: no, ok: saved.ok, message: saved.ok ? `Booked · tracking ${c.tracking_code}` : `Booked with Steadfast (consignment ${c.consignment_id}) but not saved: ${saved.error}` });
    } catch (e) {
      results.push({ order: no, ok: false, message: (e as Error).message });
    }
  }
  return NextResponse.json({ results });
}
