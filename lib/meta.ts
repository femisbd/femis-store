import { createHash } from "node:crypto";

// Meta Conversions API (server-side tracking). The access token stays on the server.
// Leave the settings empty until you are ready to connect.
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const TOKEN = process.env.META_CAPI_TOKEN;
const TEST_CODE = process.env.META_TEST_EVENT_CODE; // optional: shows events in Events Manager > Test events
const GRAPH = process.env.META_GRAPH_URL || "https://graph.facebook.com/v25.0";

export const metaConfigured = Boolean(PIXEL_ID && TOKEN);
export const metaPixelSet = Boolean(PIXEL_ID);

const sha = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

export type Attribution = { fbp?: string; fbc?: string; ip?: string; ua?: string; url?: string };

export type PurchaseInput = {
  orderNo: string; // also the event_id, so a browser Purchase with the same id is counted once
  createdAt: string;
  phone: string; // 01XXXXXXXXX
  name: string;
  value: number;
  items: { slug: string; qty: number; price: number }[];
  attribution: Attribution;
};

export async function sendPurchase(p: PurchaseInput): Promise<void> {
  if (!metaConfigured) throw new Error("Meta tracking is not connected yet.");
  const placed = Math.floor(new Date(p.createdAt).getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  // Meta accepts website events up to 7 days old.
  const eventTime = now - placed < 6 * 24 * 3600 ? placed : now;
  const [first, ...rest] = p.name.trim().split(/\s+/);
  const phone = `88${p.phone.replace(/\D/g, "")}`; // country code, digits only

  const event = {
    event_name: "Purchase",
    event_time: eventTime,
    event_id: p.orderNo,
    action_source: "website",
    event_source_url: p.attribution.url || undefined,
    user_data: {
      ph: [sha(phone)],
      external_id: [sha(phone)],
      fn: first ? [sha(first)] : undefined,
      ln: rest.length ? [sha(rest.join(" "))] : undefined,
      country: [sha("bd")],
      client_ip_address: p.attribution.ip || undefined,
      client_user_agent: p.attribution.ua || undefined,
      fbp: p.attribution.fbp || undefined,
      fbc: p.attribution.fbc || undefined,
    },
    custom_data: {
      currency: "BDT",
      value: p.value,
      order_id: p.orderNo,
      content_type: "product",
      content_ids: p.items.map((i) => i.slug),
      contents: p.items.map((i) => ({ id: i.slug, quantity: i.qty, item_price: i.price })),
      num_items: p.items.reduce((s, i) => s + i.qty, 0),
    },
  };

  const body: Record<string, unknown> = { data: [event], access_token: TOKEN };
  if (TEST_CODE) body.test_event_code = TEST_CODE;
  const res = await fetch(`${GRAPH}/${PIXEL_ID}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = t;
    try {
      msg = (JSON.parse(t) as { error?: { message?: string } }).error?.message ?? t;
    } catch {}
    throw new Error(`Meta: ${msg.slice(0, 200)}`);
  }
}

// Visitor's address and browser, read from the request (Netlify passes the real visitor IP).
export function requestAttribution(request: Request, fromBrowser: { fbp?: unknown; fbc?: unknown; url?: unknown }): Attribution {
  const h = request.headers;
  const ip = h.get("x-nf-client-connection-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const clean = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : undefined);
  return {
    fbp: clean(fromBrowser.fbp, 200),
    fbc: clean(fromBrowser.fbc, 500),
    url: clean(fromBrowser.url, 500),
    ip,
    ua: h.get("user-agent")?.slice(0, 500) || undefined,
  };
}
