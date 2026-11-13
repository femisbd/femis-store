import { NextResponse } from "next/server";
import { metaConfigured, sendPurchase, type Attribution } from "@/lib/meta";
import { getSettings } from "@/lib/catalog";
import { rpc, select, staffFromRequest } from "@/lib/supabase";

type Order = {
  order_no: string; created_at: string; name: string; phone: string; total: number; status: string;
  tracking: Attribution; order_items: { slug: string; qty: number; unit_price: number }[];
};

// Sends the Purchase event for a confirmed order to Meta, once. Called by the admin panel after confirming.
export async function POST(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff || (staff.role !== "owner" && staff.role !== "orders")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!metaConfigured) return NextResponse.json({ sent: false, reason: "not_connected" });
  if ((await getSettings()).capiPurchaseOn !== "confirmed") return NextResponse.json({ sent: false, reason: "sent_when_placed" });

  const { order } = (await request.json().catch(() => ({}))) as { order?: string };
  if (!order || !/^FM\d+$/.test(order)) return NextResponse.json({ error: "Bad order number" }, { status: 400 });

  const [o] = await select<Order[]>(
    `orders?select=order_no,created_at,name,phone,total,status,tracking,order_items(slug,qty,unit_price)&order_no=eq.${order}`,
    staff.token,
  );
  if (!o) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (["pending", "cancelled", "returned"].includes(o.status)) return NextResponse.json({ sent: false, reason: "not_confirmed" });

  const claimed = await rpc<boolean>("claim_purchase_event", { p_order_no: order }, staff.token);
  if (!claimed) return NextResponse.json({ sent: false, reason: "already_sent" });
  try {
    await sendPurchase({
      orderNo: o.order_no,
      createdAt: o.created_at,
      phone: o.phone,
      name: o.name,
      value: o.total,
      items: o.order_items.map((i) => ({ slug: i.slug, qty: i.qty, price: i.unit_price })),
      attribution: o.tracking ?? {},
    });
    return NextResponse.json({ sent: true });
  } catch (e) {
    await rpc("release_purchase_event", { p_order_no: order }, staff.token).catch(() => {});
    return NextResponse.json({ sent: false, reason: (e as Error).message }, { status: 502 });
  }
}
