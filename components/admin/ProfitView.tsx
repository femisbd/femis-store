"use client";

import { useCallback, useEffect, useState } from "react";
import { taka } from "@/lib/config";
import { supabase } from "@/lib/supabase-browser";

type Day = {
  day: string; orders: number; delivered: number; returned: number; cancelled: number; open: number; revenue: number;
  goods_cost: number; courier_cost: number; return_loss: number; ad_spend: number; open_value: number; profit: number;
};
type Report = {
  days: Day[];
  totals: Omit<Day, "day">;
  products: { name: string; units: number; revenue: number; cost: number; profit: number; cost_missing: boolean }[];
  products_without_cost: number;
  courier_cost_set: boolean;
};

// Dates are handled in Bangladesh time, whatever the device is set to.
const dhakaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const niceDay = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", weekday: "short" }).format(new Date(`${iso}T00:00:00Z`));
const money = (n: number) => (n < 0 ? `−${taka(-n)}` : taka(n));

const PRESETS: { id: string; label: string; range: () => [string, string] }[] = [
  { id: "today", label: "Today", range: () => [dhakaToday(), dhakaToday()] },
  { id: "7", label: "Last 7 days", range: () => [addDays(dhakaToday(), -6), dhakaToday()] },
  { id: "30", label: "Last 30 days", range: () => [addDays(dhakaToday(), -29), dhakaToday()] },
  { id: "month", label: "This month", range: () => [`${dhakaToday().slice(0, 8)}01`, dhakaToday()] },
];

export function ProfitView() {
  const [preset, setPreset] = useState("7");
  const [[from, to], setRange] = useState<[string, string]>(PRESETS[1].range());
  const [r, setR] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [adDay, setAdDay] = useState(dhakaToday());
  const [adAmount, setAdAmount] = useState("");
  const [adMsg, setAdMsg] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase().rpc("profit_report", { p_from: from, p_to: to });
    if (error) return setError(error.message);
    setError("");
    setR(data as Report);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveAd(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(adAmount);
    if (adAmount === "" || !Number.isInteger(n) || n < 0) return setAdMsg("Enter the amount in taka, as a whole number.");
    const { error } = await supabase().from("ad_spend").upsert({ day: adDay, amount: n, updated_at: new Date().toISOString() });
    if (error) return setAdMsg(error.message);
    setAdMsg(`Saved ${taka(n)} for ${niceDay(adDay)}.`);
    setAdAmount("");
    load();
  }

  const t = r?.totals;
  const finished = t ? t.delivered + t.returned : 0;
  const deliveryRate = t && finished > 0 ? Math.round((t.delivered / finished) * 100) : null;
  const roas = t && t.ad_spend > 0 ? (t.revenue / t.ad_spend).toFixed(1) : null;
  const aov = t && t.delivered > 0 ? Math.round(t.revenue / t.delivered) : null;

  return (
    <section className="adm-profit">
      <div className="adm-toolbar">
        <div>
          <h1 className="adm-h1" style={{ margin: 0 }}>Profit and loss</h1>
          <p className="muted small">By the date the order was placed, Bangladesh time. Profit counts delivered orders only.</p>
        </div>
        <div className="adm-status-tabs" role="group" aria-label="Date range">
          {PRESETS.map((p) => (
            <button key={p.id} aria-pressed={preset === p.id} onClick={() => { setPreset(p.id); setRange(p.range()); }}>{p.label}</button>
          ))}
        </div>
      </div>

      {error && <p className="notice" role="alert">{error}</p>}
      {r && !r.courier_cost_set && <p className="adm-warn">Your courier cost is not set, so profit is shown too high. Add it in Settings, under Costs.</p>}
      {r && r.products_without_cost > 0 && <p className="adm-warn">{r.products_without_cost} {r.products_without_cost === 1 ? "product has" : "products have"} no cost entered, so their profit is shown too high. Add costs in the Products tab.</p>}

      {t && (
        <>
          <div className="adm-tiles">
            <Tile label="Net profit" value={money(t.profit)} hero tone={t.profit < 0 ? "bad" : undefined} note="After products, courier, returns and ads" />
            <Tile label="Delivered sales" value={taka(t.revenue)} note={`${t.delivered} delivered ${t.delivered === 1 ? "order" : "orders"}`} />
            <Tile label="Ad spend" value={taka(t.ad_spend)} note={roas ? `ROAS ${roas} on delivered sales` : "No ad spend entered"} />
            <Tile label="Delivery rate" value={deliveryRate === null ? "–" : `${deliveryRate}%`} note={`${t.returned} returned of ${finished} finished`} />
            <Tile label="Average order" value={aov === null ? "–" : taka(aov)} note="Delivered orders" />
            <Tile label="Still open" value={taka(t.open_value)} note={`${t.open} ${t.open === 1 ? "order" : "orders"} not yet delivered`} />
          </div>

          <div className="adm-card adm-breakdown">
            <h2 className="adm-h2">How the profit is worked out</h2>
            <Row k="Delivered sales" v={taka(t.revenue)} />
            <Row k="Products, packaging and add-ons" v={money(-t.goods_cost)} />
            <Row k="Courier cost on delivered orders" v={money(-t.courier_cost)} />
            <Row k="Courier cost on returned parcels" v={money(-t.return_loss)} />
            <Row k="Ad spend" v={money(-t.ad_spend)} />
            <div className="row-between sum-total"><span>Net profit</span><span>{money(t.profit)}</span></div>
          </div>
        </>
      )}

      <form className="adm-card adm-adform" onSubmit={saveAd}>
        <h2 className="adm-h2">Enter ad spend</h2>
        <div className="adm-flags" style={{ alignItems: "flex-end" }}>
          <div className="field"><label htmlFor="ad-day">Day</label><input id="ad-day" type="date" className="input" value={adDay} max={dhakaToday()} onChange={(e) => setAdDay(e.target.value)} /></div>
          <div className="field"><label htmlFor="ad-amt">Total spent on ads (৳)</label><input id="ad-amt" className="input" inputMode="numeric" value={adAmount} onChange={(e) => setAdAmount(e.target.value.replace(/[^\d]/g, ""))} /></div>
          <button className="adm-btn" type="submit">Save</button>
        </div>
        <span className="muted small">Saving again for the same day replaces the amount.</span>
        {adMsg && <span className="small" role="status">{adMsg}</span>}
      </form>

      {r && (
        <>
          <h2 className="adm-h2" style={{ paddingTop: 8 }}>By day</h2>
          <div className="adm-table-wrap">
            <table className="adm-table adm-num">
              <thead><tr><th>Day</th><th>Orders</th><th>Delivered</th><th className="hide-sm">Returned</th><th>Sales</th><th className="hide-sm">Costs</th><th className="hide-sm">Ads</th><th>Profit</th></tr></thead>
              <tbody>
                {r.days.map((d) => (
                  <tr key={d.day} className="adm-row-plain">
                    <td className="nowrap">{niceDay(d.day)}</td><td>{d.orders}</td><td>{d.delivered}</td><td className="hide-sm">{d.returned}</td>
                    <td>{taka(d.revenue)}</td><td className="hide-sm">{taka(d.goods_cost + d.courier_cost + d.return_loss)}</td><td className="hide-sm">{taka(d.ad_spend)}</td>
                    <td><strong className={d.profit < 0 ? "adm-neg" : ""}>{money(d.profit)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="adm-h2" style={{ paddingTop: 8 }}>By product (delivered, before courier and ads)</h2>
          <div className="adm-table-wrap">
            <table className="adm-table adm-num">
              <thead><tr><th>Product</th><th>Units</th><th>Sales</th><th>Cost</th><th>Gross profit</th></tr></thead>
              <tbody>
                {r.products.map((p) => (
                  <tr key={p.name} className="adm-row-plain">
                    <td>{p.name}{p.cost_missing && <span className="adm-tag adm-tag-warn" style={{ marginLeft: 8 }}>No cost entered</span>}</td>
                    <td>{p.units}</td><td>{taka(p.revenue)}</td><td>{taka(p.cost)}</td><td><strong>{money(p.profit)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r.products.length === 0 && <p className="adm-empty muted">No delivered orders in this period yet.</p>}
          </div>
        </>
      )}
      {!r && !error && <p className="adm-empty muted">Loading…</p>}
    </section>
  );
}

function Tile({ label, value, note, hero, tone }: { label: string; value: string; note: string; hero?: boolean; tone?: "bad" }) {
  return (
    <div className={`adm-tile ${hero ? "adm-tile-hero" : ""}`}>
      <span className="adm-tile-label">{label}</span>
      <span className={`adm-tile-value ${tone === "bad" ? "adm-neg" : ""}`}>{value}</span>
      <span className="muted small">{note}</span>
    </div>
  );
}
const Row = ({ k, v }: { k: string; v: string }) => <div className="row-between"><span className="k" style={{ color: "var(--body)" }}>{k}</span><span>{v}</span></div>;
