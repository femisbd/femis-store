"use client";

import { useCallback, useEffect, useState } from "react";
import { taka } from "@/lib/config";
import { dhakaTime, supabase } from "@/lib/supabase-browser";

type Draft = {
  id: string; phone: string; name: string; address: string; area: "inside" | "outside" | null;
  lines: { name: string; colour: string; size: string | null; qty: number; price: number }[];
  subtotal: number; status: "new" | "called" | "no_answer" | "not_interested"; staff_note: string; updated_at: string;
};
const STATUS: Record<Draft["status"], string> = { new: "Not called", called: "Called", no_answer: "No answer", not_interested: "Not interested" };

// Checkouts where the visitor typed a valid phone number but did not place the order.
export function IncompleteView({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Draft[]>([]);
  const [show, setShow] = useState<"open" | "all">("open");
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    let q = supabase().from("checkout_drafts").select("*").is("converted_order", null)
      .gt("updated_at", new Date(Date.now() - 14 * 864e5).toISOString())
      .lt("updated_at", new Date(Date.now() - 10 * 60e3).toISOString()) // give visitors 10 minutes to finish first
      .order("updated_at", { ascending: false }).limit(200);
    if (show === "open") q = q.in("status", ["new", "no_answer"]);
    const { data } = await q;
    setRows((data as Draft[]) ?? []);
    setLoading(false);
  }, [show]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function update(d: Draft, patch: Partial<Pick<Draft, "status" | "staff_note">>) {
    await supabase().from("checkout_drafts").update(patch).eq("id", d.id);
    load();
  }

  const wa = (d: Draft) => {
    const items = d.lines.map((l) => l.name).join(", ");
    const msg = `Hello${d.name ? ` ${d.name.split(" ")[0]}` : ""}, this is FEMIS. We saw you were ordering ${items}. Can we help you complete your order?`;
    return `https://wa.me/88${d.phone}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <section>
      <div className="adm-toolbar">
        <div>
          <h1 className="adm-h1" style={{ margin: 0 }}>Incomplete orders</h1>
          <p className="muted small">Visitors who entered a phone number at checkout but didn't order, in the last 14 days. They leave this list when they order.</p>
        </div>
        <div className="adm-status-tabs" role="group" aria-label="Show">
          <button aria-pressed={show === "open"} onClick={() => setShow("open")}>To call</button>
          <button aria-pressed={show === "all"} onClick={() => setShow("all")}>All</button>
        </div>
      </div>
      <div className="adm-drafts">
        {rows.map((d) => (
          <article key={d.id} className="adm-card adm-draft">
            <div className="row-between" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontWeight: 500 }}>{d.name || "No name entered"}</strong>
                <div className="muted small">{d.phone} · {dhakaTime(d.updated_at)}{d.area ? ` · ${d.area === "inside" ? "Dhaka" : "Outside Dhaka"}` : ""}</div>
              </div>
              <strong>{taka(d.subtotal)}</strong>
            </div>
            <ul className="adm-items">
              {d.lines.map((l, i) => <li key={i}><span>{l.qty} × {l.name} <span className="muted small">{l.colour}{l.size ? ` · ${l.size}` : ""}</span></span><span>{taka(l.price * l.qty)}</span></li>)}
            </ul>
            {d.address && <p className="small muted">{d.address}</p>}
            <div className="adm-flags">
              <a className="adm-btn" href={`tel:${d.phone}`}>Call</a>
              <a className="adm-btn-ghost" href={wa(d)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              <label className="sr-only" htmlFor={`st-${d.id}`}>Result</label>
              <select id={`st-${d.id}`} className="input adm-select" value={d.status} onChange={(e) => update(d, { status: e.target.value as Draft["status"] })}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <form className="adm-flags" onSubmit={(e) => { e.preventDefault(); update(d, { staff_note: notes[d.id] ?? d.staff_note }); }}>
              <label className="sr-only" htmlFor={`n-${d.id}`}>Note</label>
              <input id={`n-${d.id}`} className="input" style={{ flex: "1 1 220px", minHeight: 44 }} placeholder="Note, e.g. will order after salary" value={notes[d.id] ?? d.staff_note} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} />
              {(notes[d.id] ?? d.staff_note) !== d.staff_note && <button className="adm-btn-ghost" type="submit">Save note</button>}
            </form>
          </article>
        ))}
      </div>
      {!loading && rows.length === 0 && <p className="adm-empty muted">Nothing to follow up right now.</p>}
      {loading && <p className="adm-empty muted">Loading…</p>}
    </section>
  );
}
