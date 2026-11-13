"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { taka } from "@/lib/config";
import { STATUS_LABEL, dhakaTime, supabase, type Role, type Status } from "@/lib/supabase-browser";

type Customer = {
  phone: string; name: string; address: string; area: string; blocked: boolean; orders: number; delivered: number;
  returned: number; cancelled: number; spent: number; last_order_at: string | null; first_order_at: string | null;
};
type Sort = "recent" | "spent" | "orders";
const PAGE = 50;

export function CustomersView({ role, onOpen, refreshKey }: { role: Role; onOpen: (no: string) => void; refreshKey: number }) {
  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<Sort>("recent");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [orders, setOrders] = useState<{ order_no: string; status: Status; created_at: string; total: number }[]>([]);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase().rpc("customers_report", { p_search: query, p_sort: sort, p_limit: PAGE, p_offset: page * PAGE });
    if (error) return setMsg(error.message);
    const r = data as { total: number; rows: Customer[] };
    setRows(r.rows);
    setTotal(r.total);
  }, [query, sort, page]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function expand(phone: string) {
    if (open === phone) return setOpen(null);
    setOpen(phone);
    const { data } = await supabase().from("orders").select("order_no,status,created_at,total").eq("phone", phone).order("created_at", { ascending: false });
    setOrders((data as typeof orders) ?? []);
  }

  async function toggleBlock(c: Customer) {
    if (!c.blocked && !window.confirm(`Block ${c.phone}? They won't be able to order on the website and will be asked to message you on WhatsApp.`)) return;
    const { error } = await supabase().from("customers").update({ blocked: !c.blocked }).eq("phone", c.phone);
    setMsg(error ? error.message : c.blocked ? `${c.phone} can order again.` : `${c.phone} is blocked from ordering on the website.`);
    load();
  }

  // Customer list for Meta custom audiences and lookalikes (owner only).
  async function exportCsv() {
    const { data } = await supabase().rpc("customers_report", { p_search: "", p_sort: "spent", p_limit: 5000, p_offset: 0 });
    const list = ((data as { rows: Customer[] })?.rows ?? []).filter((c) => !c.blocked);
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = ["phone,fn,ln,country,value", ...list.map((c) => {
      const [fn, ...ln] = c.name.trim().split(/\s+/);
      return [`88${c.phone}`, esc(fn ?? ""), esc(ln.join(" ")), "BD", String(c.spent)].join(",");
    })];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `femis-customers-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <div className="adm-toolbar">
        <div>
          <h1 className="adm-h1" style={{ margin: 0 }}>Customers</h1>
          <p className="muted small">{total} {total === 1 ? "customer" : "customers"}. Spent counts delivered orders only.</p>
        </div>
        <div className="adm-flags">
          <form className="adm-search" onSubmit={(e) => { e.preventDefault(); setPage(0); setQuery(search); }}>
            <label htmlFor="c-q" className="sr-only">Search by name or phone</label>
            <input id="c-q" className="input" placeholder="Name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="adm-btn" type="submit">Search</button>
          </form>
          <label className="sr-only" htmlFor="c-sort">Sort</label>
          <select id="c-sort" className="input adm-select" value={sort} onChange={(e) => { setPage(0); setSort(e.target.value as Sort); }}>
            <option value="recent">Latest order first</option>
            <option value="spent">Most spent first</option>
            <option value="orders">Most orders first</option>
          </select>
          {role === "owner" && <button className="adm-btn-ghost" onClick={exportCsv}>Export for Meta</button>}
        </div>
      </div>
      {msg && <p className="adm-ok" role="status" style={{ marginBottom: 12 }}>{msg}</p>}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Customer</th><th>Orders</th><th className="hide-sm">Delivered</th><th className="hide-sm">Returned</th><th>Spent</th><th className="hide-sm">Last order</th><th></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <Fragment key={c.phone}>
                <tr onClick={() => expand(c.phone)}>
                  <td>
                    <strong style={{ fontWeight: 500 }}>{c.name}</strong>
                    <div className="muted small">{c.phone}</div>
                    <div className="adm-flags" style={{ marginTop: 4 }}>
                      {c.blocked && <span className="adm-tag adm-st-cancelled">Blocked</span>}
                      {c.delivered >= 2 && <span className="adm-tag adm-st-delivered">Repeat buyer</span>}
                      {c.returned + c.cancelled > c.delivered && c.returned + c.cancelled > 0 && <span className="adm-tag adm-tag-warn">Risky</span>}
                    </div>
                  </td>
                  <td>{c.orders}</td><td className="hide-sm">{c.delivered}</td><td className="hide-sm">{c.returned}</td>
                  <td className="nowrap">{taka(c.spent)}</td>
                  <td className="hide-sm nowrap">{c.last_order_at ? dhakaTime(c.last_order_at) : "–"}</td>
                  <td onClick={(e) => e.stopPropagation()}><button className={c.blocked ? "adm-btn-ghost" : "adm-btn-danger"} onClick={() => toggleBlock(c)}>{c.blocked ? "Unblock" : "Block"}</button></td>
                </tr>
                {open === c.phone && (
                  <tr className="adm-row-plain">
                    <td colSpan={7}>
                      <p className="small muted" style={{ marginBottom: 8 }}>{c.address}</p>
                      <div className="adm-flags">
                        {orders.map((o) => <button key={o.order_no} className="adm-btn-ghost" onClick={() => onOpen(o.order_no)}>{o.order_no} · {STATUS_LABEL[o.status]} · {taka(o.total)}</button>)}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="adm-empty muted">{query ? "No customer matches this search." : "No customers yet."}</p>}
      </div>
      {total > PAGE && (
        <div className="adm-flags" style={{ paddingTop: 12 }}>
          <button className="adm-btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted small">Page {page + 1} of {Math.ceil(total / PAGE)}</span>
          <button className="adm-btn-ghost" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </section>
  );
}
