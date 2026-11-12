"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { taka } from "@/lib/config";

type Saved = { id: string; totals: { total: number; advance: number; onDelivery: number } };

export default function ThankYouPage() {
  const [order, setOrder] = useState<Saved | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("femis-last-order");
      if (raw) setOrder(JSON.parse(raw));
    } catch {}
  }, []);

  return (
    <Shell>
      <section className="narrow">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span className="dot" style={{ width: 18, height: 18 }} aria-hidden="true" />
          <h1 className="h1">Thank you. Your order is placed.</h1>
          {order && (
            <span style={{ fontSize: 18, color: "var(--body)" }}>
              Order number <strong style={{ fontWeight: 500, color: "var(--navy)" }}>{order.id}</strong> · {taka(order.totals.onDelivery)} to pay on delivery
            </span>
          )}
        </div>
        <div>
          <h2 className="caps" style={{ fontWeight: 400, paddingBottom: 18 }}>What happens next</h2>
          <ol className="steps light">
            <li><span className="num">01</span><div><span className="t">We call you to confirm</span><span className="d">Please keep your phone nearby. We confirm your address and order by phone.</span></div></li>
            <li><span className="num">02</span><div><span className="t">We pack and hand it to the courier</span><span className="d">You get an SMS with a tracking link when your parcel leaves us.</span></div></li>
            <li><span className="num">03</span><div><span className="t">You receive it and pay</span><span className="d">Pay the delivery person in cash when the parcel reaches you.</span></div></li>
          </ol>
        </div>
        <div className="cta-row">
          <Link href="/track" className="btn grow">Track your order</Link>
          <Link href="/category/all" className="btn-outline grow">Continue shopping</Link>
        </div>
      </section>
    </Shell>
  );
}
