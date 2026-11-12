import { NextResponse } from "next/server";
import { rpc, supabaseConfigured } from "@/lib/supabase";

type Status = "pending" | "confirmed" | "packed" | "shipped" | "delivered" | "returned" | "cancelled";
type TrackResult =
  | { found: false }
  | { found: true; orderId: string; status: Status; placedAt: string; hasPreorder: boolean; courierCode: string | null; events: { status: Status; at: string }[] };

const FLOW: { status: Status; title: string }[] = [
  { status: "pending", title: "Order placed" },
  { status: "confirmed", title: "Confirmed by phone" },
  { status: "packed", title: "Packed" },
  { status: "shipped", title: "With the courier" },
  { status: "delivered", title: "Delivered" },
];

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

// Turns the database answer into the timeline the tracking page shows.
function toSteps(r: Extract<TrackResult, { found: true }>) {
  const at = new Map(r.events.map((e) => [e.status, e.at]));
  if (r.status === "cancelled" || r.status === "returned") {
    return [
      { title: "Order placed", when: when(r.placedAt), state: "done" },
      { title: r.status === "cancelled" ? "Cancelled" : "Returned", when: at.get(r.status) ? when(at.get(r.status)!) : "", state: "now" },
    ];
  }
  const current = FLOW.findIndex((f) => f.status === r.status);
  return FLOW.map((f, i) => ({
    title: f.title,
    when: i === 0 ? when(r.placedAt) : at.get(f.status) ? when(at.get(f.status)!) : "",
    state: i < current ? "done" : i === current ? (r.status === "delivered" ? "done" : "now") : "next",
  }));
}

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 40);

  if (!supabaseConfigured) {
    // DEMO MODE: no database settings. Only the code DEMO answers.
    if (q.toUpperCase() !== "DEMO") return NextResponse.json({ found: false });
    const now = new Date().toISOString();
    return NextResponse.json({
      found: true,
      orderId: "DEMO",
      courierCode: null,
      steps: toSteps({ found: true, orderId: "DEMO", status: "shipped", placedAt: now, hasPreorder: false, courierCode: null, events: [{ status: "confirmed", at: now }, { status: "packed", at: now }, { status: "shipped", at: now }] }),
    });
  }

  try {
    const r = await rpc<TrackResult>("track_order", { q });
    if (!r.found) return NextResponse.json({ found: false });
    return NextResponse.json({ found: true, orderId: r.orderId, courierCode: r.courierCode, steps: toSteps(r) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
