import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { getSettings } from "@/lib/catalog";
import { taka } from "@/lib/config";

export const metadata: Metadata = { title: "Exchange and refund policy" };

export default async function PolicyPage() {
  const s = await getSettings();
  return (
    <Shell>
      <section className="narrow">
        <h1 className="h1">Exchange and refund policy</h1>
        {s.policyText ? (
          <div style={{ whiteSpace: "pre-line", lineHeight: 1.7, color: "var(--body)", fontSize: 17 }}>{s.policyText}</div>
        ) : (
          <p className="lead">{s.exchangeLine || "Our full policy will be published here soon. Message us on WhatsApp with any question about your order."}</p>
        )}
        <div>
          <h2 className="h2" style={{ fontSize: 32, paddingBottom: 12 }}>Delivery</h2>
          <p style={{ lineHeight: 1.7, color: "var(--body)", fontSize: 17 }}>
            {taka(s.delivery.insideDhaka)} inside Dhaka city and {taka(s.delivery.outsideDhaka)} outside Dhaka city.
            {s.delivery.freeOver > 0 ? ` Free delivery on orders over ${taka(s.delivery.freeOver)}.` : ""}
          </p>
        </div>
      </section>
    </Shell>
  );
}
