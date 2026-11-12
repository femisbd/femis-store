"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";

type Item = { name: string; slug: string; colour: string; size: string | null; qty: number; orders: { order_no: string; status: string } };
type Group = { key: string; name: string; colour: string; size: string | null; qty: number; orderNos: string[] };

// Pre-order pieces from orders that are not yet shipped or cancelled:
// the list of what to order from the supplier.
export function PreordersView({ onOpen, refreshKey }: { onOpen: (no: string) => void; refreshKey: number }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyConfirmed, setOnlyConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const statuses = onlyConfirmed ? ["confirmed"] : ["pending", "confirmed"];
      const { data } = await supabase()
        .from("order_items")
        .select("name,slug,colour,size,qty,orders!inner(order_no,status)")
        .eq("is_preorder", true)
        .in("orders.status", statuses);
      if (cancelled) return;
      const map = new Map<string, Group>();
      for (const it of (data as unknown as Item[]) ?? []) {
        const key = `${it.slug}|${it.colour}|${it.size ?? ""}`;
        const g = map.get(key) ?? { key, name: it.name, colour: it.colour, size: it.size, qty: 0, orderNos: [] };
        g.qty += it.qty;
        if (!g.orderNos.includes(it.orders.order_no)) g.orderNos.push(it.orders.order_no);
        map.set(key, g);
      }
      setGroups([...map.values()].sort((a, b) => a.name.localeCompare(b.name) || a.colour.localeCompare(b.colour)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [onlyConfirmed, refreshKey]);

  const total = groups.reduce((s, g) => s + g.qty, 0);

  return (
    <section>
      <div className="adm-toolbar">
        <div>
          <h1 className="adm-h1" style={{ margin: 0 }}>Pre-order pieces to source</h1>
          <p className="muted small">From orders not yet shipped. {total} pieces in total.</p>
        </div>
        <label className="adm-check">
          <input type="checkbox" checked={onlyConfirmed} onChange={(e) => setOnlyConfirmed(e.target.checked)} />
          Confirmed orders only
        </label>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Product</th><th>Colour</th><th>Size</th><th>Pieces</th><th>Orders</th></tr></thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key}>
                <td>{g.name}</td>
                <td>{g.colour}</td>
                <td>{g.size ?? "–"}</td>
                <td><strong>{g.qty}</strong></td>
                <td>
                  <div className="adm-flags">
                    {g.orderNos.map((n) => <button key={n} className="adm-link" onClick={() => onOpen(n)}>{n}</button>)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && groups.length === 0 && <p className="adm-empty muted">No open pre-orders.</p>}
        {loading && <p className="adm-empty muted">Loading…</p>}
      </div>
    </section>
  );
}
