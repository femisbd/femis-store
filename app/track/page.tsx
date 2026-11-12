"use client";

import { useState } from "react";
import { Shell } from "@/components/Shell";
import { config } from "@/lib/config";

type Step = { title: string; when: string; state: "done" | "now" | "next" };
type Result = { found: false } | { found: true; orderId: string; courierCode: string | null; steps: Step[] };
const TAG = { done: "Done", now: "Now", next: "Next" };

export default function TrackPage() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return setError("Enter your mobile number or order number.");
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/track?q=${encodeURIComponent(q.trim())}`);
      if (!res.ok) throw new Error();
      setResult(await res.json());
    } catch {
      setError("We could not check right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <section className="narrow">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h1 className="h1">Track your order</h1>
          <span style={{ fontSize: 17, color: "var(--body)" }}>Enter the mobile number you ordered with, or your order number.</span>
        </div>
        <form onSubmit={submit} className="field" noValidate>
          <label htmlFor="q">Mobile number or order number · <span className="bn">মোবাইল নাম্বার বা অর্ডার নাম্বার</span></label>
          <div className="track-form">
            <input id="q" className="input" placeholder="01XXXXXXXXX" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="submit" className="btn" disabled={loading}>{loading ? "Checking…" : "Track"}</button>
          </div>
          {error && <span className="err" role="alert">{error}</span>}
        </form>

        <div aria-live="polite">
          {result && !result.found && (
            <p style={{ color: "var(--body)" }}>We could not find an order with that number. Check the number and try again, or message us on WhatsApp {config.whatsappNumber || "[NUMBER]"}.</p>
          )}
          {result && result.found && (
            <div className="track-card">
              <div className="track-head">
                <span className="serif">Order {result.orderId}</span>
                {result.courierCode && <span className="muted small">Courier tracking code {result.courierCode}</span>}
              </div>
              <ol className="timeline">
                {result.steps.map((s) => (
                  <li key={s.title} className={s.state}>
                    <span className="pt" aria-hidden="true" />
                    <div className="grow"><span className="t">{s.title}</span><span className="muted small">{s.when}</span></div>
                    <span className="tag">{TAG[s.state]}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </section>
    </Shell>
  );
}
