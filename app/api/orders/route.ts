import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getCatalog, getSettings } from "@/lib/catalog";
import { detail, totals, validateOrder, type OrderRequest } from "@/lib/order";
import { rpc, supabaseConfigured } from "@/lib/supabase";

type PlaceResult = { ok: boolean; errors?: Record<string, string>; order?: unknown };

// Receives an order from the checkout page and saves it with the database function place_order.
// The database recalculates every price, checks stock and saves everything in one step,
// so a browser can never change a price or oversell stock.
export async function POST(request: Request) {
  let body: OrderRequest;
  try {
    body = (await request.json()) as OrderRequest;
  } catch {
    return NextResponse.json({ ok: false, errors: { form: "Invalid request." } }, { status: 400 });
  }
  const lines = Array.isArray(body.lines) ? body.lines.slice(0, 30) : [];

  if (supabaseConfigured) {
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
          lines: lines.map(({ slug, colour, size, qty }) => ({ slug, colour, size: size ?? null, qty })),
          // TODO (tracking stage): ad attribution (fbp, fbc, event id) for Meta Conversions API
          tracking: {},
        },
      });
      // Stock changed: refresh the cached catalogue in the background.
      if (result.ok) revalidateTag("catalog", "max");
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
