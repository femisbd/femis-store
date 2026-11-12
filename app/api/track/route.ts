import { NextResponse } from "next/server";

// Order tracking lookup.
// TODO (next build stage): look the order up in the database and read the live Steadfast status.
// Until then only the demo code "DEMO" returns a result, so the page layout can be seen.
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toUpperCase();
  if (q !== "DEMO") return NextResponse.json({ found: false });
  return NextResponse.json({
    found: true,
    demo: true,
    orderId: "FM-DEMO",
    courierCode: "[COURIER CODE]",
    steps: [
      { title: "Order placed", when: "[DATE AND TIME]", state: "done" },
      { title: "Confirmed by phone", when: "[DATE AND TIME]", state: "done" },
      { title: "Packed", when: "[DATE AND TIME]", state: "done" },
      { title: "With the courier", when: "[DATE AND TIME]", state: "now" },
      { title: "Delivered", when: "Expected [DATE]", state: "next" },
    ],
  });
}
