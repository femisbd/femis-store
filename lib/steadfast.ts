// Steadfast Courier API. Keys come from the hosting settings (Netlify environment variables)
// and never reach the browser. Leave them empty until you are ready to connect.
const BASE = process.env.STEADFAST_BASE_URL || "https://portal.packzy.com/api/v1";
const API_KEY = process.env.STEADFAST_API_KEY;
const SECRET_KEY = process.env.STEADFAST_SECRET_KEY;

export const steadfastConfigured = Boolean(API_KEY && SECRET_KEY);

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!steadfastConfigured) throw new Error("Steadfast is not connected yet. Add the API keys in the hosting settings.");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Api-Key": API_KEY!, "Secret-Key": SECRET_KEY!, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Steadfast answered ${res.status} with an unexpected reply.`);
  }
  if (!res.ok) {
    const d = data as { message?: string; errors?: Record<string, string[]> };
    const detail = d.errors ? Object.values(d.errors).flat().join(" ") : d.message;
    throw new Error(`Steadfast: ${detail || `error ${res.status}`}`);
  }
  return data as T;
}

export type Consignment = { consignment_id: number | string; tracking_code: string; status: string };

export async function createParcel(p: {
  invoice: string; name: string; phone: string; address: string; cod: number; note?: string; items?: string;
}): Promise<Consignment> {
  const r = await call<{ status: number; message?: string; consignment?: Consignment }>("POST", "/create_order", {
    invoice: p.invoice,
    recipient_name: p.name.slice(0, 100),
    recipient_phone: p.phone,
    recipient_address: p.address.replace(/\s+/g, " ").slice(0, 250),
    cod_amount: p.cod,
    note: p.note?.slice(0, 250) || undefined,
    item_description: p.items?.slice(0, 250) || undefined,
  });
  if (r.status !== 200 || !r.consignment) throw new Error(`Steadfast: ${r.message || "the parcel was not created"}`);
  return r.consignment;
}

export async function parcelStatus(consignmentId: string): Promise<string> {
  const r = await call<{ status: number; delivery_status?: string }>("GET", `/status_by_cid/${encodeURIComponent(consignmentId)}`);
  if (!r.delivery_status) throw new Error("Steadfast did not return a status.");
  return r.delivery_status;
}

export async function balance(): Promise<number> {
  const r = await call<{ current_balance?: number }>("GET", "/get_balance");
  return Number(r.current_balance ?? 0);
}

export type FraudCheck = { total_parcels: number; total_delivered: number; total_cancelled: number; total_fraud_reports: unknown[] };
export async function fraudCheck(phone: string): Promise<FraudCheck> {
  return call<FraudCheck>("GET", `/fraud_check/${encodeURIComponent(phone)}`);
}

// Steadfast's own status words, in plain English for staff.
export const COURIER_STATUS_LABEL: Record<string, string> = {
  in_review: "Waiting for pickup",
  pending: "On the way",
  hold: "On hold",
  delivered_approval_pending: "Delivered (awaiting approval)",
  partial_delivered_approval_pending: "Partly delivered (awaiting approval)",
  cancelled_approval_pending: "Cancelled (awaiting approval)",
  unknown_approval_pending: "Unknown (awaiting approval)",
  delivered: "Delivered",
  partial_delivered: "Partly delivered",
  cancelled: "Cancelled, returning",
  unknown: "Unknown, contact Steadfast",
};
