import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";
import { requestAttribution, sendPurchase, metaConfigured } from "@/lib/meta";
import { getCatalog, getSettings } from "@/lib/catalog";
import { detail, totals, validateOrder, type OrderRequest } from "@/lib/order";
import { rpc, supabaseConfigured } from "@/lib/supabase";

type PlaceResult = { ok: boolean; errors?: Record<string, string>; order?: { id: string; created_at: string; totals: { total: number } } };

// Receives an order from the checkout page and saves it with the database function place_order.
// The database recalculates every price, checks stock and saves everything in one step,
// so a browser can never change a price or oversell stock.
export async function POST(request: Request) {
  let body: OrderRequest & { tracking?: { fbp?: unknown; fbc?: unknown; url?: unknown } };
  try {
    body = (await request.json()) as OrderRequest;
  } catch {
    return NextResponse.json({ ok: false, errors: { form: "Invalid request." } }, { status: 400 });
  }
  const lines = Array.isArray(body.lines) ? body.lines.slice(0, 30) : [];

  if (supabaseConfigured) {
    const attribution = requestAttribution(request, body.tracking ?? {});
    try {
      const result = await rpc<PlaceResult>("place_order", {
        p: {
          name: body.name,
          phone: body.phone,
          address: body.address,
          area: body.area,
          add_on: !!body.addOn,
          trx_id: body.trxId ?? "",
          note: body.note ?? "",
          coupon: typeof body.coupon === "string" ? body.coupon.slice(0, 30) : "",
          lines: lines.map(({ slug, colour, size, qty }) => ({ slug, colour, size: size ?? null, qty })),
          // Saved with the order so the Purchase event can be sent to Meta later, when staff confirm it.
          tracking: attribution,
        },
      });
      // Stock changed: refresh the cached catalogue in the background.
      if (result.ok) revalidateTag("catalog", "max");
      // "Send Purchase when the order is placed" mode: send to Meta after replying to the customer.
      if (result.ok && result.order && metaConfigured) {
        const order = result.order;
        const settings = await getSettings();
        if (settings.capiPurchaseOn === "placed") {
          const products = (await getCatalog()).products;
          after(() =>
            sendPurchase({
              orderNo: order.id,
              createdAt: order.created_at,
              phone: body.phone.replace(/[\s-]/g, ""),
              name: body.name,
              value: order.totals.total,
              items: lines.map((l) => ({ slug: l.slug, qty: l.qty, price: products.find((p) => p.slug === l.slug)?.price ?? 0 })),
              attribution,
            }).catch((e) => console.error("Meta Purchase failed", e)),
          );
        }
      }
      return NextResponse.json(result, { status: result.ok ? 200 : 422 });
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        { ok: false, errors: { form: "We could not save your order. Please try again, or order on WhatsApp." } },
        { status: 502 },
      );
    }
  }

  // DEMO MODE: used only when the Supabase settings are missing (local preview). Nothing is saved.
  const d = detail(lines, (await getCatalog()).products);
  const area = body.area === "outside" ? "outside" : "inside";
  const t = totals(d, area, !!body.addOn, await getSettings());
  const errors = validateOrder(body, d, t);
  if (Object.keys(errors).length) return NextResponse.json({ ok: false, errors }, { status: 422 });
  const order = { id: `DEMO-${Date.now().toString(36).toUpperCase()}`, totals: t };
  console.warn("[demo mode] order not saved", JSON.stringify(order));
  return NextResponse.json({ ok: true, order });
}
