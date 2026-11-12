"use client";

import { useEffect, useState } from "react";
import { taka } from "@/lib/config";
import { STATUS_LABEL, dhakaTime, supabase, type Role, type Status } from "@/lib/supabase-browser";

type Row = {
  order_no: string;
  created_at: string;
  name: string;
  phone: string;
  area: "inside" | "outside";
  status: Status;
  has_preorder: boolean;
  total: number;
  advance: number;
  on_delivery: number;
  advance_verified: boolean;
  order_items: { qty: number }[];
};

// Which tabs each role sees. Packing staff only see what they need to pack.
const TABS: Record<Role, Status[]> = {
  owner: ["pending", "confirmed", "packed", "shipped", "delivered", "returned", "cancelled"],
  orders: ["pending", "confirmed", "packed", "shipped", "delivered", "returned", "cancelled"],
  packing: ["confirmed", "packed"],
};
const PACKING_LABEL: Partial<Record<Status, string>> = { confirmed: "To pack", packed: "Packed" };

export function OrdersView({ role, onOpen, refreshKey }: { role: Role; onOpen: (no: string) => void; refreshKey: number }) {
  const tabs = TABS[role];
  const [tab, setTab] = useState<Status>(tabs[0]);
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Partial<Record<Status, number>>>({});
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  // Refresh every minute so new website orders appear without reloading.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sb = supabase();
    (async () => {
      setLoading(true);
      let q = sb
        .from("orders")
        .select("order_no,created_at,name,phone,area,status,has_preorder,total,advance,on_delivery,advance_verified,order_items(qty)")
        .order("created_at", { ascending: false })
        .limit(200);
      const s = query.trim().toUpperCase().replace(/[\s-]/g, "");
      if (s) q = q.or(`order_no.eq.${s},phone.eq.${s}`);
      else q = q.eq("status", tab);
      const [{ data, error }, ...countResults] = await Promise.all([
        q,
        ...tabs.map((t) => sb.from("orders").select("order_no", { count: "exact", head: true }).eq("status", t)),
      ]);
      if (cancelled) return;
      setError(error ? "Could not load orders. Check your internet connection." : "");
      setRows((data as Row[]) ?? []);
      setCounts(Object.fromEntries(tabs.map((t, i) => [t, countResults[i].count ?? 0])));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, query, refreshKey, tick, tabs]);

  return (
    <section>
      <div className="adm-toolbar">
        <div className="adm-status-tabs" role="group" aria-label="Order status">
          {tabs.map((t) => (
            <button key={t} aria-pressed={!query && tab === t} onClick={() => { setQuery(""); setSearch(""); setTab(t); }}>
              {(role === "packing" && PACKING_LABEL[t]) || STATUS_LABEL[t]}
              <span className="adm-count">{counts[t] ?? "–"}</span>
            </button>
          ))}
        </div>
        <form className="adm-search" onSubmit={(e) => { e.preventDefault(); setQuery(search); }}>
          <label htmlFor="adm-q" className="sr-only">Search by order number or phone</label>
          <input id="adm-q" className="input" placeholder="Order no. or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="adm-btn" type="submit">Search</button>
          {query && <button className="adm-btn-ghost" type="button" onClick={() => { setQuery(""); setSearch(""); }}>Clear</button>}
        </form>
      </div>

      {error && <p className="notice" role="alert">{error}</p>}

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Order</th><th className="hide-sm">Placed</th><th>Customer</th><th className="hide-sm">Area</th><th className="hide-sm">Items</th><th className="hide-sm">Total</th><th>Collect</th><th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.order_no} onClick={() => onOpen(r.order_no)}>
                <td><button className="adm-link" onClick={(e) => { e.stopPropagation(); onOpen(r.order_no); }}>{r.order_no}</button></td>
                <td className="nowrap hide-sm">{dhakaTime(r.created_at)}</td>
                <td>{r.name}<div className="muted small">{r.phone}</div></td>
                <td className="hide-sm">{r.area === "inside" ? "Dhaka" : "Outside"}</td>
                <td className="hide-sm">{r.order_items.reduce((s, i) => s + i.qty, 0)}</td>
                <td className="nowrap hide-sm">{taka(r.total)}</td>
                <td className="nowrap">{taka(r.on_delivery)}</td>
                <td>
                  <div className="adm-flags">
                    {query && <span className="adm-tag">{STATUS_LABEL[r.status]}</span>}
                    {r.has_preorder && <span className="adm-tag adm-tag-pre">Pre-order</span>}
                    {r.advance > 0 && !r.advance_verified && <span className="adm-tag adm-tag-warn">Verify advance</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <p className="adm-empty muted">{query ? "No order matches this search." : "No orders here."}</p>}
        {loading && rows.length === 0 && <p className="adm-empty muted">Loading…</p>}
      </div>
    </section>
  );
}
