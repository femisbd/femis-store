import { NextResponse } from "next/server";
import { detail, totals, validateOrder, type OrderRequest } from "@/lib/order";

// Receives an order from the checkout page.
// Prices and totals are recalculated here on the server, so a browser can never change a price.
//
// TODO (next build stage): save the order to the database (Supabase), reduce stock,
// send the SMS confirmation, and send the Purchase event to Meta Conversions API.
// Until then the order is only written to the server log and is NOT stored.
export async function POST(request: Request) {
  let body: OrderRequest;
  try {
    body = (await request.json()) as OrderRequest;
  } catch {
    return NextResponse.json({ ok: false, errors: { form: "Invalid request." } }, { status: 400 });
  }

  const lines = detail(Array.isArray(body.lines) ? body.lines.slice(0, 30) : []);
  const area = body.area === "outside" ? "outside" : "inside";
  const t = totals(lines, area, !!body.addOn);
  const errors = validateOrder(body, lines, t);

  for (const l of lines) {
    const p = l.product;
    if (!p.preorder && l.qty > p.stock) errors.lines = `${p.name}: only ${p.stock} left in stock.`;
    if (p.sizes && (!l.size || !p.sizes.includes(l.size))) errors.lines = `${p.name}: please choose a size.`;
    if (!p.colours.includes(l.colour)) errors.lines = `${p.name}: please choose a colour.`;
  }
  if (Object.keys(errors).length) return NextResponse.json({ ok: false, errors }, { status: 422 });

  const id = `FM-${Date.now().toString(36).toUpperCase()}`;
  const order = {
    id,
    createdAt: new Date().toISOString(),
    customer: { name: body.name.trim(), phone: body.phone.replace(/[\s-]/g, ""), address: body.address.trim(), area },
    note: (body.note ?? "").slice(0, 500),
    trxId: t.advance > 0 ? (body.trxId ?? "").trim() : null,
    items: lines.map((l) => ({ slug: l.slug, name: l.product.name, colour: l.colour, size: l.size ?? null, qty: l.qty, price: l.product.price, preorder: !!l.product.preorder })),
    totals: t,
  };
  console.log("[order received, not stored yet]", JSON.stringify(order));
  return NextResponse.json({ ok: true, order });
}
