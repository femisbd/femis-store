"use client";

import { useCallback, useEffect, useState } from "react";
import { taka } from "@/lib/config";
import { COURIER_LABEL, STATUS_LABEL, dhakaTime, staffApi, supabase, type Integrations, type Role, type Status } from "@/lib/supabase-browser";

type Order = {
  order_no: string; created_at: string; name: string; phone: string; address: string; area: "inside" | "outside";
  status: Status; has_preorder: boolean; source: string; subtotal: number; addon: number; delivery: number; discount: number; coupon_code: string | null; total: number;
  advance: number; on_delivery: number; bkash_trx: string | null; advance_verified: boolean; advance_verified_at: string | null;
  note: string; staff_note: string; courier_tracking_code: string | null;
  courier_consignment_id: string | null; courier_status: string | null; courier_checked_at: string | null; capi_purchase_sent_at: string | null;
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

type CourierRecord = { parcels: number; delivered: number; cancelled: number; reports: number };

export function OrderPanel({ orderNo, role, onClose, onChanged, integrations }: { orderNo: string; role: Role; onClose: () => void; onChanged: () => void; integrations: Integrations | null }) {
  const [o, setO] = useState<Order | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const canEdit = role !== "packing";
  const steadfast = !!integrations?.steadfast.connected;
  const [courierRec, setCourierRec] = useState<CourierRecord | null>(null);
  const [blocked, setBlocked] = useState(false);

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
    sb.from("customers").select("blocked").eq("phone", order.phone).maybeSingle().then(({ data: c }) => setBlocked(!!c?.blocked));
    if (steadfast && role !== "packing" && ["pending", "confirmed"].includes(order.status)) {
      staffApi<CourierRecord>(`/api/courier/check?phone=${order.phone}`).then(setCourierRec).catch(() => setCourierRec(null));
    }
    setNames(Object.fromEntries(((n as { user_id: string; name: string }[]) ?? []).map((x) => [x.user_id, x.name])));
  }, [orderNo, steadfast, role]);

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
    run(() => supabase().rpc("set_order_status", { p_order_no: orderNo, p_status: a.to, p_note: note }), `${orderNo} is now ${STATUS_LABEL[a.to].toLowerCase()}.`).then(async (ok) => {
      if (!ok) return;
      setNote("");
      // Confirmed orders are reported to Meta as purchases (when that is the chosen setting).
      if (a.to === "confirmed" && integrations?.meta.server) {
        const r = await staffApi<{ sent: boolean; reason?: string }>("/api/capi/purchase", { method: "POST", body: JSON.stringify({ order: orderNo }) }).catch((e) => ({ sent: false, reason: (e as Error).message }));
        if (r.sent) setMsg({ kind: "ok", text: `${orderNo} is now confirmed. Purchase sent to Meta.` });
        else if (r.reason && !["already_sent", "sent_when_placed", "not_connected", "not_website"].includes(r.reason)) setMsg({ kind: "err", text: `${orderNo} is confirmed, but the Purchase was not sent to Meta: ${r.reason}` });
        load();
      }
    });
  };
  const book = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await staffApi<{ results: { ok: boolean; message: string }[] }>("/api/courier/book", { method: "POST", body: JSON.stringify({ orders: [orderNo] }) });
      const x = r.results[0];
      setMsg({ kind: x?.ok ? "ok" : "err", text: x?.message ?? "No answer from Steadfast." });
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
    setBusy(false); await load(); onChanged();
  };
  const checkCourier = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await staffApi<{ updates: { courier: string; status: string }[]; failed: number }>("/api/courier/sync", { method: "POST", body: JSON.stringify({ orders: [orderNo] }) });
      setMsg(r.failed ? { kind: "err", text: "Could not reach Steadfast. Try again." } : { kind: "ok", text: `Steadfast: ${r.updates[0]?.courier ?? "no change"}.` });
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
    setBusy(false); await load(); onChanged();
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
              <h3>Customer{o.source !== "website" ? ` · ordered by ${o.source === "phone" ? "phone call" : o.source}` : ""}</h3>
              <p><strong>{o.name}</strong></p>
              <div className="adm-flags">
                <a className="adm-btn" href={`tel:${o.phone}`}>Call {o.phone}</a>
                <a className="adm-btn-ghost" href={waLink(o.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                {canEdit && (
                  <button className={blocked ? "adm-btn-ghost" : "adm-btn-danger"} disabled={busy} onClick={async () => {
                    if (!blocked && !window.confirm(`Block ${o.phone}? They won't be able to order on the website.`)) return;
                    const { error } = await supabase().from("customers").update({ blocked: !blocked }).eq("phone", o.phone);
                    if (error) return setMsg({ kind: "err", text: error.message });
                    setBlocked(!blocked);
                    setMsg({ kind: "ok", text: blocked ? `${o.phone} can order again.` : `${o.phone} is blocked from ordering on the website.` });
                  }}>{blocked ? "Unblock number" : "Block number"}</button>
                )}
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
                {o.discount > 0 && <div className="row-between"><span className="k">Discount ({o.coupon_code})</span><span>−{taka(o.discount)}</span></div>}
                {o.coupon_code && o.discount === 0 && <div className="row-between"><span className="k">Coupon</span><span>{o.coupon_code}</span></div>}
                <div className="row-between"><span className="k">Delivery</span><span>{o.delivery === 0 ? "Free" : taka(o.delivery)}</span></div>
                <div className="row-between sum-total"><span>Total</span><span>{taka(o.total)}</span></div>
                {o.advance > 0 && <div className="row-between"><span className="k">Advance (bKash)</span><span>{taka(o.advance)}</span></div>}
                <div className="row-between" style={{ fontWeight: 500 }}><span>Courier collects</span><span>{taka(o.on_delivery)}</span></div>
              </div>
            </section>

            {courierRec && (
              <div className={`adm-history ${courierRec.parcels > 0 && courierRec.cancelled > courierRec.delivered ? "adm-history-risk" : ""}`}>
                {courierRec.parcels === 0
                  ? "Steadfast record: no parcels to this number with any merchant yet."
                  : `Steadfast record with all merchants: ${courierRec.parcels} parcels, ${courierRec.delivered} delivered, ${courierRec.cancelled} cancelled (${Math.round((courierRec.delivered / courierRec.parcels) * 100)}% success).`}
                {courierRec.reports > 0 && ` ${courierRec.reports} fraud ${courierRec.reports === 1 ? "report" : "reports"} from other merchants.`}
              </div>
            )}

            {(o.courier_consignment_id || (steadfast && canEdit && ["confirmed", "packed"].includes(o.status))) && (
              <section className="adm-sec">
                <h3>Courier</h3>
                {o.courier_consignment_id ? (
                  <>
                    <p>Steadfast · consignment <strong className="adm-mono">{o.courier_consignment_id}</strong> · tracking <strong className="adm-mono">{o.courier_tracking_code}</strong></p>
                    <p className="small">Status: <strong>{o.courier_status ? COURIER_LABEL[o.courier_status] ?? o.courier_status : "—"}</strong>{o.courier_checked_at ? <span className="muted"> · checked {dhakaTime(o.courier_checked_at)}</span> : null}</p>
                    {steadfast && canEdit && o.status === "shipped" && <button className="adm-btn-ghost" disabled={busy} onClick={checkCourier} style={{ alignSelf: "flex-start" }}>Check status now</button>}
                  </>
                ) : (
                  <>
                    <p className="small">Cash to collect: <strong>{taka(o.on_delivery)}</strong>. Booking sends the name, phone, address and items to Steadfast and marks the order as shipped.</p>
                    <button className="adm-btn" disabled={busy || (o.advance > 0 && !o.advance_verified)} onClick={book} style={{ alignSelf: "flex-start" }}>Book with Steadfast</button>
                    {o.advance > 0 && !o.advance_verified && <span className="muted small">Verify the bKash advance first.</span>}
                  </>
                )}
              </section>
            )}

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
