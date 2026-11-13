import { deliveryCharge, type Area, type Settings } from "./config";
import { findProduct, type Product } from "./products";

export type CartLine = { slug: string; colour: string; size?: string; qty: number };
export type DetailedLine = CartLine & { key: string; product: Product; lineTotal: number };

export const lineKey = (l: Pick<CartLine, "slug" | "colour" | "size">) => `${l.slug}|${l.colour}|${l.size ?? ""}`;

export function detail(lines: CartLine[], products: Product[]): DetailedLine[] {
  const out: DetailedLine[] = [];
  for (const l of lines) {
    const product = findProduct(products, l.slug);
    if (!product) continue;
    const qty = Math.max(1, Math.min(20, Math.floor(l.qty) || 1));
    out.push({ ...l, qty, key: lineKey(l), product, lineTotal: product.price * qty });
  }
  return out;
}

export type Coupon = { code: string; kind: "percent" | "fixed" | "free_delivery"; value: number; max_discount: number; min_subtotal: number };

export type Totals = {
  subtotal: number;
  addOn: number;
  delivery: number;
  discount: number;
  total: number;
  advance: number; // paid now by bKash (pre-order pieces that need an advance)
  onDelivery: number; // paid in cash to the courier
  toFreeDelivery: number; // 0 when free delivery is reached
};

// One place for all money maths. The server re-runs this, so prices sent by a browser are never trusted.
// Matches place_order in the database exactly.
export function totals(lines: DetailedLine[], area: Area, withAddOn: boolean, s: Settings, coupon?: Coupon | null): Totals {
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const addOn = withAddOn && s.addOn.enabled ? s.addOn.price : 0;
  const advance = lines.reduce((s, l) => s + (l.product.preorder?.advance ?? 0) * l.qty, 0);
  const c = coupon && subtotal >= coupon.min_subtotal ? coupon : null;
  let discount = 0;
  if (c?.kind === "percent") discount = Math.floor((subtotal * c.value) / 100);
  if (c?.kind === "percent" && c.max_discount > 0) discount = Math.min(discount, c.max_discount);
  if (c?.kind === "fixed") discount = c.value;
  discount = Math.min(discount, subtotal);
  const delivery = !lines.length || c?.kind === "free_delivery" ? 0 : deliveryCharge(s, area, subtotal - discount);
  discount = Math.max(0, Math.min(discount, subtotal + addOn + delivery - advance));
  const total = subtotal + addOn + delivery - discount;
  return {
    subtotal,
    addOn,
    delivery,
    discount,
    total,
    advance,
    onDelivery: total - advance,
    toFreeDelivery: Math.max(0, s.delivery.freeOver - (subtotal - discount)),
  };
}

export type OrderRequest = {
  name: string;
  phone: string;
  address: string;
  area: Area;
  addOn: boolean;
  trxId?: string;
  note?: string;
  coupon?: string;
  lines: CartLine[];
};

export const isBdMobile = (v: string) => /^01[3-9]\d{8}$/.test(v.replace(/[\s-]/g, ""));

export function validateOrder(o: OrderRequest, lines: DetailedLine[], t: Totals): Record<string, string> {
  const e: Record<string, string> = {};
  if (!o.name || o.name.trim().length < 2) e.name = "Please enter your full name.";
  if (!o.phone || !isBdMobile(o.phone)) e.phone = "Enter an 11-digit mobile number starting with 01.";
  if (!o.address || o.address.trim().length < 10) e.address = "Please enter your full address with area and district.";
  if (o.area !== "inside" && o.area !== "outside") e.area = "Choose a delivery area.";
  if (!lines.length) e.lines = "Your cart is empty.";
  if (t.advance > 0 && (!o.trxId || o.trxId.trim().length < 6)) e.trxId = "Enter the bKash transaction ID for the advance.";
  return e;
}
