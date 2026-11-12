"use client";

import { useCallback, useEffect, useState } from "react";
import { taka } from "@/lib/config";
import { STATUS_LABEL, dhakaTime, supabase, type Role, type Status } from "@/lib/supabase-browser";

type Order = {
  order_no: string; created_at: string; name: string; phone: string; address: string; area: "inside" | "outside";
  status: Status; has_preorder: boolean; subtotal: number; addon: number; delivery: number; total: number;
  advance: number; on_delivery: number; bkash_trx: string | null; advance_verified: boolean; advance_verified_at: string | null;
  note: string; staff_note: string; courier_tracking_code: string | null;
  order_items: { id: number; name: string; colour: string; size: string | null; qty: number; unit_price: number; line_total: number; is_preorder: boolean }[];
  order_events: { id: number; status: Status; note: string; created_by: string | null; created_at: string }[];
};
type History = { order_no: string; status: Status; created_at: string; total: number };

type Action = { to: Status; label: string; primary?: boolean; danger?: boolean };

// What each role may do next, by current status.
function actionsFor(role: Role, o: Order): Action[] {
  if (role === "packing") return o.status === "confirmed" ? [{ to: "packed", label: "Mark as packed", primary: true }] : [];
  switch (o.status) {
    case "pending": return [{ to: "confirmed", label: "Confirm order", primary: true }, { to: "cancelled", label: "Cancel order", danger: true }];
    case "confirmed": return [{ to: "packed", label: "Mark as packed", primary: true }, { to: "cancelled", label: "Cancel order", danger: true }];
    case "packed": return [{ to: "shipped", label: "Mark as shipped", primary: true }, { to: "cancelled", label: "Cancel order", danger: true }];
    case "shipped": return [{ to: "delivered", label: "Mark as delivered", primary: true }, { to: "returned", label: "Mark as returned", danger: true }];
    case "delivered": return [{ to: "returned", label: "Mark as returned", danger: true }];
    default: return [];
  }
}

const waLink = (phone: string) => `https://wa.me/88${phone}`;

export function OrderPanel({ orderNo, role, onClose, onChanged }: { orderNo: string; role: Role; onClose: () => void; onChanged: () => void }) {
  const [o, setO] = useState<Order | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const canEdit = role !== "packing";

  const load = useCallback(async () => {
    const sb = supabase();
    const { data, error } = await sb.from("orders").select("*, order_items(*), order_events(*)").eq("order_no", orderNo).single();
    if (error || !data) {
      setMsg({ kind: "err", text: "Could not load this order." });
      return;
    }
    const order = data as Order;
    order.order_events.sort((a, b) => a.id - b.id);
    setO(order);
    setStaffNote(order.staff_note);
    setAddress(order.address);
    const [{ data: h }, { data: n }] = await Promise.all([
      sb.from("orders").select("order_no,status,created_at,total").eq("phone", order.phone).neq("order_no", orderNo).order("created_at", { ascending: false }).limit(20),
      sb.rpc("staff_names"),
    ]);
    setHistory((h as History[]) ?? []);
    setNames(Object.fromEntries(((n as { user_id: string; name: string }[]) ?? []).map((x) => [x.user_id, x.name])));
  }, [orderNo]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, okText: string) {
    setBusy(true);
    setMsg(null);
    const { data, error } = await fn();
    setBusy(false);
    const result = data as { ok?: boolean; error?: string } | null;
    if (error || (result && result.ok === false)) {
      setMsg({ kind: "err", text: result?.error ?? error?.message ?? "Something went wrong." });
      return false;
    }
    setMsg({ kind: "ok", text: okText });
    await load();
    onChanged();
    return true;
  }

  const setStatus = (a: Action) => {
    if (a.danger && !window.confirm(`${a.label} ${orderNo}?`)) return;
    run(() => supabase().rpc("set_order_status", { p_order_no: orderNo, p_status: a.to, p_note: note }), `${orderNo} is now ${STATUS_LABEL[a.to].toLowerCase()}.`).then((ok) => ok && setNote(""));
  };
  const verify = (v: boolean) => run(() => supabase().rpc("verify_advance", { p_order_no: orderNo, p_verified: v }), v ? "Advance marked as verified." : "Advance marked as not verified.");
  const saveDetails = () => run(() => supabase().from("orders").update({ staff_note: staffNote, address }).eq("order_no", orderNo).select("order_no").single(), "Saved.");

  const past = { total: history.length, delivered: history.filter((h) => h.status === "delivered").length, returned: history.filter((h) => h.status === "returned").length, cancelled: history.filter((h) => h.status === "cancelled").length };
  const risky = past.returned + past.cancelled > past.delivered && past.returned + past.cancelled > 0;

  return (
    <div className="drawer-root">
      <button className="drawer-overlay" aria-label="Close order" onClick={onClose} />
      <aside className="drawer adm-panel" role="dialog" aria-modal="true" aria-label={`Order ${orderNo}`}>
        <div className="drawer-head">
          <div>
            <h2 className="adm-h1" style={{ margin: 0 }}>{orderNo}</h2>
            {o && <span className="muted small">{dhakaTime(o.created_at)} · <span className={`adm-tag adm-st-${o.status}`}>{STATUS_LABEL[o.status]}</span></span>}
          </div>
          <button className="icon-btn" aria-label="Close order" onClick={onClose}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
          </button>
        </div>

        {!o ? (
          <p className="adm-pad muted">{msg?.text ?? "Loading…"}</p>
        ) : (
          <div className="adm-panel-body">
            {msg && <p className={msg.kind === "ok" ? "adm-ok" : "notice"} role="status">{msg.text}</p>}

            <section className="adm-sec">
              <h3>Customer</h3>
              <p><strong>{o.name}</strong></p>
              <div className="adm-flags">
                <a className="adm-btn" href={`tel:${o.phone}`}>Call {o.phone}</a>
                <a className="adm-btn-ghost" href={waLink(o.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              </div>
              <p className="muted small">{o.area === "inside" ? "Inside Dhaka city" : "Outside Dhaka city"}</p>
              {canEdit ? (
                <div className="field">
                  <label htmlFor="adm-address">Address</label>
                  <textarea id="adm-address" className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
              ) : (
                <p>{o.address}</p>
              )}
              {o.note && <p className="small"><span className="muted">Customer note:</span> {o.note}</p>}
              <div className={`adm-history ${risky ? "adm-history-risk" : ""}`}>
                {past.total === 0 ? (
                  <span>First order from this number.</span>
                ) : (
                  <span>
                    {past.total} earlier {past.total === 1 ? "order" : "orders"}: {past.delivered} delivered, {past.returned} returned, {past.cancelled} cancelled.
                    {risky && " Check carefully before confirming."}
                  </span>
                )}
              </div>
            </section>

            <section className="adm-sec">
              <h3>Items</h3>
              <ul className="adm-items">
                {o.order_items.map((i) => (
                  <li key={i.id}>
                    <div>
                      <strong>{i.name}</strong>
                      <div className="muted small">{i.colour}{i.size ? ` · Size ${i.size}` : ""} · {i.qty} × {taka(i.unit_price)}{i.is_preorder ? " · Pre-order" : ""}</div>
                    </div>
                    <span>{taka(i.line_total)}</span>
                  </li>
                ))}
              </ul>
              <div className="sum-rows">
                <div className="row-between"><span className="k">Subtotal</span><span>{taka(o.subtotal)}</span></div>
                {o.addon > 0 && <div className="row-between"><span className="k">Add-on</span><span>{taka(o.addon)}</span></div>}
                <div className="row-between"><span className="k">Delivery</span><span>{o.delivery === 0 ? "Free" : taka(o.delivery)}</span></div>
                <div className="row-between sum-total"><span>Total</span><span>{taka(o.total)}</span></div>
                {o.advance > 0 && <div className="row-between"><span className="k">Advance (bKash)</span><span>{taka(o.advance)}</span></div>}
                <div className="row-between" style={{ fontWeight: 500 }}><span>Courier collects</span><span>{taka(o.on_delivery)}</span></div>
              </div>
            </section>

            {o.advance > 0 && (
              <section className={`adm-sec adm-advance ${o.advance_verified ? "is-ok" : ""}`}>
                <h3>bKash advance</h3>
                <p>{taka(o.advance)} · Transaction ID <strong className="adm-mono">{o.bkash_trx ?? "—"}</strong></p>
                <p className="small">
                  {o.advance_verified
                    ? `Verified${o.advance_verified_at ? ` on ${dhakaTime(o.advance_verified_at)}` : ""}.`
                    : "Not verified. Check your bKash app for this transaction ID and amount before confirming."}
                </p>
                {canEdit && (
                  o.advance_verified
                    ? <button className="adm-btn-ghost" disabled={busy} onClick={() => verify(false)}>Undo verification</button>
                    : <button className="adm-btn" disabled={busy} onClick={() => verify(true)}>Mark advance as received</button>
                )}
              </section>
            )}

            {actionsFor(role, o).length > 0 && (
              <section className="adm-sec">
                <h3>Next step</h3>
                <div className="field">
                  <label htmlFor="adm-note">Note for this step (optional)</label>
                  <input id="adm-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. customer asked for evening delivery" />
                </div>
                <div className="adm-flags">
                  {actionsFor(role, o).map((a) => (
                    <button key={a.to} className={a.primary ? "adm-btn" : a.danger ? "adm-btn-danger" : "adm-btn-ghost"} disabled={busy} onClick={() => setStatus(a)}>{a.label}</button>
                  ))}
                </div>
              </section>
            )}

            {canEdit && (
              <section className="adm-sec">
                <h3>Staff note</h3>
                <div className="field">
                  <label htmlFor="adm-staff-note" className="sr-only">Staff note</label>
                  <textarea id="adm-staff-note" className="input" value={staffNote} onChange={(e) => setStaffNote(e.target.value)} placeholder="Only staff can see this" />
                </div>
                <button className="adm-btn-ghost" disabled={busy || (staffNote === o.staff_note && address === o.address)} onClick={saveDetails}>Save address and note</button>
              </section>
            )}

            <section className="adm-sec">
              <h3>History</h3>
              <ol className="adm-timeline">
                {o.order_events.map((e) => (
                  <li key={e.id}>
                    <strong>{STATUS_LABEL[e.status]}</strong> <span className="muted small">{dhakaTime(e.created_at)}{e.created_by ? ` · ${names[e.created_by] ?? "Staff"}` : " · Website"}</span>
                    {e.note && <div className="small">{e.note}</div>}
                  </li>
                ))}
              </ol>
              {history.length > 0 && (
                <>
                  <h3 style={{ marginTop: 20 }}>Earlier orders from this number</h3>
                  <ul className="adm-items">
                    {history.map((h) => (
                      <li key={h.order_no}><span>{h.order_no} · {dhakaTime(h.created_at)}</span><span>{STATUS_LABEL[h.status]} · {taka(h.total)}</span></li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
