"use client";

import { useCallback, useEffect, useState } from "react";
import { taka } from "@/lib/config";
import { supabase } from "@/lib/supabase-browser";

type Coupon = {
  code: string; kind: "percent" | "fixed" | "free_delivery"; value: number; max_discount: number; min_subtotal: number;
  starts_at: string | null; ends_at: string | null; usage_limit: number | null; per_phone_limit: number; active: boolean; note: string;
};
type Stats = { code: string; uses: number; delivered: number; discount_given: number; delivered_sales: number };

const describe = (c: Coupon) =>
  c.kind === "percent" ? `${c.value}% off${c.max_discount ? ` (up to ${taka(c.max_discount)})` : ""}` : c.kind === "fixed" ? `${taka(c.value)} off` : "Free delivery";

// Dates are entered and shown in Bangladesh time.
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 6 * 3600e3).toISOString().slice(0, 10) : "");
const startOfDay = (d: string) => (d ? new Date(`${d}T00:00:00+06:00`).toISOString() : null);
const endOfDay = (d: string) => (d ? new Date(`${d}T23:59:59+06:00`).toISOString() : null);

export function CouponsView() {
  const [rows, setRows] = useState<Coupon[]>([]);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data }, { data: st }] = await Promise.all([sb.from("coupons").select("*").order("created_at", { ascending: false }), sb.rpc("coupons_report")]);
    setRows((data as Coupon[]) ?? []);
    setStats(Object.fromEntries(((st as Stats[]) ?? []).map((s) => [s.code, s])));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(c: Coupon) {
    await supabase().from("coupons").update({ active: !c.active }).eq("code", c.code);
    setMsg(c.active ? `${c.code} is switched off.` : `${c.code} is switched on.`);
    load();
  }

  const status = (c: Coupon) => {
    const now = Date.now();
    if (!c.active) return { t: "Off", cls: "" };
    if (c.ends_at && new Date(c.ends_at).getTime() < now) return { t: "Expired", cls: "adm-tag-warn" };
    if (c.starts_at && new Date(c.starts_at).getTime() > now) return { t: "Scheduled", cls: "" };
    if (c.usage_limit && (stats[c.code]?.uses ?? 0) >= c.usage_limit) return { t: "Used up", cls: "adm-tag-warn" };
    return { t: "Live", cls: "adm-st-delivered" };
  };

  return (
    <section>
      <div className="adm-toolbar">
        <div>
          <h1 className="adm-h1" style={{ margin: 0 }}>Coupons</h1>
          <p className="muted small">Customers enter the code at checkout. Results count delivered orders only.</p>
        </div>
        <button className="adm-btn" onClick={() => setEditing("new")}>New coupon</button>
      </div>
      {msg && <p className="adm-ok" role="status" style={{ marginBottom: 12 }}>{msg}</p>}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Code</th><th>Offer</th><th className="hide-sm">Rules</th><th>Uses</th><th className="hide-sm">Delivered sales</th><th className="hide-sm">Discount given</th><th></th></tr></thead>
          <tbody>
            {rows.map((c) => {
              const s = stats[c.code];
              const st = status(c);
              return (
                <tr key={c.code} onClick={() => setEditing(c)}>
                  <td><strong className="adm-mono">{c.code}</strong><div style={{ marginTop: 4 }}><span className={`adm-tag ${st.cls}`}>{st.t}</span></div>{c.note && <div className="muted small">{c.note}</div>}</td>
                  <td>{describe(c)}</td>
                  <td className="hide-sm small">
                    {c.min_subtotal > 0 && <div>Min. order {taka(c.min_subtotal)}</div>}
                    <div>{c.usage_limit ? `${c.usage_limit} uses in total` : "No total limit"} · {c.per_phone_limit} per customer</div>
                    {(c.starts_at || c.ends_at) && <div>{c.starts_at ? toLocal(c.starts_at) : "Now"} to {c.ends_at ? toLocal(c.ends_at) : "no end"}</div>}
                  </td>
                  <td>{s?.uses ?? 0}{c.usage_limit ? ` / ${c.usage_limit}` : ""}</td>
                  <td className="hide-sm nowrap">{taka(s?.delivered_sales ?? 0)}</td>
                  <td className="hide-sm nowrap">{taka(s?.discount_given ?? 0)}</td>
                  <td onClick={(e) => e.stopPropagation()}><button className="adm-btn-ghost" onClick={() => toggle(c)}>{c.active ? "Switch off" : "Switch on"}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="adm-empty muted">No coupons yet. Click "New coupon".</p>}
      </div>
      {editing && <CouponForm coupon={editing === "new" ? null : editing} used={editing !== "new" ? (stats[editing.code]?.uses ?? 0) : 0} onClose={() => setEditing(null)} onSaved={(t) => { setEditing(null); setMsg(t); load(); }} />}
    </section>
  );
}

function CouponForm({ coupon, used, onClose, onSaved }: { coupon: Coupon | null; used: number; onClose: () => void; onSaved: (msg: string) => void }) {
  const isNew = !coupon;
  const [code, setCode] = useState(coupon?.code ?? "");
  const [kind, setKind] = useState<Coupon["kind"]>(coupon?.kind ?? "percent");
  const [value, setValue] = useState(coupon ? String(coupon.value) : "");
  const [maxDiscount, setMaxDiscount] = useState(coupon?.max_discount ? String(coupon.max_discount) : "");
  const [minSubtotal, setMinSubtotal] = useState(coupon?.min_subtotal ? String(coupon.min_subtotal) : "");
  const [starts, setStarts] = useState(toLocal(coupon?.starts_at ?? null));
  const [ends, setEnds] = useState(toLocal(coupon?.ends_at ?? null));
  const [limit, setLimit] = useState(coupon?.usage_limit ? String(coupon.usage_limit) : "");
  const [perPhone, setPerPhone] = useState(String(coupon?.per_phone_limit ?? 1));
  const [note, setNote] = useState(coupon?.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const digits = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value.replace(/[^\d]/g, ""));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(c)) e.code = "Use 3 to 30 letters or numbers, no spaces.";
    const v = Number(value);
    if (kind === "percent" && !(v >= 1 && v <= 90)) e.value = "Enter a percentage from 1 to 90.";
    if (kind === "fixed" && !(v >= 1)) e.value = "Enter the amount in taka.";
    if (starts && ends && ends < starts) e.ends = "The end date is before the start date.";
    if (!(Number(perPhone) >= 1)) e.perPhone = "At least 1.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const row = {
      code: c, kind, value: kind === "free_delivery" ? 0 : v, max_discount: kind === "percent" ? Number(maxDiscount || 0) : 0,
      min_subtotal: Number(minSubtotal || 0), starts_at: startOfDay(starts), ends_at: endOfDay(ends),
      usage_limit: limit ? Number(limit) : null, per_phone_limit: Number(perPhone), note: note.trim(),
    };
    const { error } = isNew ? await supabase().from("coupons").insert(row) : await supabase().from("coupons").update(row).eq("code", coupon!.code);
    setSaving(false);
    if (error) return setErrors({ form: error.code === "23505" ? "A coupon with this code already exists." : error.message });
    onSaved(isNew ? `${c} created.` : `${c} saved.`);
  }

  return (
    <div className="drawer-root">
      <button className="drawer-overlay" aria-label="Close" onClick={onClose} />
      <aside className="drawer adm-panel" role="dialog" aria-modal="true" aria-label={isNew ? "New coupon" : `Edit ${coupon!.code}`}>
        <div className="drawer-head">
          <h2 className="adm-h1" style={{ margin: 0 }}>{isNew ? "New coupon" : "Edit coupon"}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </div>
        <form className="adm-panel-body" onSubmit={save} noValidate>
          <section className="adm-sec">
            <F id="cp-code" label="Code" hint="What customers type, for example EID10 or NUSRAT15" error={errors.code}>
              <input id="cp-code" className="input adm-mono" value={code} disabled={!isNew && used > 0} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </F>
            {!isNew && used > 0 && <span className="muted small">The code can't be renamed after it has been used.</span>}
            <F id="cp-note" label="Note (only you see this)" hint="For example: influencer Nusrat, Eid campaign"><input id="cp-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></F>
          </section>
          <section className="adm-sec">
            <h3>Offer</h3>
            <div className="adm-flags" role="radiogroup" aria-label="Offer type">
              <label className="radio adm-radio"><input type="radio" name="kind" checked={kind === "percent"} onChange={() => setKind("percent")} /><span>Percent off</span></label>
              <label className="radio adm-radio"><input type="radio" name="kind" checked={kind === "fixed"} onChange={() => setKind("fixed")} /><span>Taka off</span></label>
              <label className="radio adm-radio"><input type="radio" name="kind" checked={kind === "free_delivery"} onChange={() => setKind("free_delivery")} /><span>Free delivery</span></label>
            </div>
            {kind !== "free_delivery" && (
              <div className="adm-grid2">
                <F id="cp-val" label={kind === "percent" ? "Percent off" : "Taka off (৳)"} error={errors.value}><input id="cp-val" className="input" inputMode="numeric" value={value} onChange={digits(setValue)} /></F>
                {kind === "percent" && <F id="cp-max" label="Most it can take off (৳)" hint="Empty = no cap"><input id="cp-max" className="input" inputMode="numeric" value={maxDiscount} onChange={digits(setMaxDiscount)} /></F>}
              </div>
            )}
            <span className="muted small">Discounts apply to products only, never to delivery or the add-on.</span>
          </section>
          <section className="adm-sec">
            <h3>Rules</h3>
            <F id="cp-min" label="Minimum order (৳)" hint="Products total before discount. Empty = any order"><input id="cp-min" className="input" inputMode="numeric" value={minSubtotal} onChange={digits(setMinSubtotal)} /></F>
            <div className="adm-grid2">
              <F id="cp-start" label="Starts" hint="Empty = now"><input id="cp-start" type="date" className="input" value={starts} onChange={(e) => setStarts(e.target.value)} /></F>
              <F id="cp-end" label="Ends (end of that day)" hint="Empty = no end" error={errors.ends}><input id="cp-end" type="date" className="input" value={ends} onChange={(e) => setEnds(e.target.value)} /></F>
            </div>
            <div className="adm-grid2">
              <F id="cp-limit" label="Total uses allowed" hint="Empty = unlimited"><input id="cp-limit" className="input" inputMode="numeric" value={limit} onChange={digits(setLimit)} /></F>
              <F id="cp-pp" label="Uses per customer (phone)" error={errors.perPhone}><input id="cp-pp" className="input" inputMode="numeric" value={perPhone} onChange={digits(setPerPhone)} /></F>
            </div>
            <span className="muted small">Cancelled orders don't count as a use.</span>
          </section>
          {errors.form && <p className="notice" role="alert">{errors.form}</p>}
          <div className="adm-flags" style={{ paddingTop: 12 }}>
            <button className="adm-btn" type="submit" disabled={saving}>{saving ? "Saving…" : isNew ? "Create coupon" : "Save changes"}</button>
            <button className="adm-btn-ghost" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function F({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="muted small">{hint}</span>}
      {error && <span className="err" role="alert">{error}</span>}
    </div>
  );
}
