"use client";

import { useEffect, useMemo, useState } from "react";
import { taka } from "@/lib/config";
import { staffApi, supabase, type Integrations } from "@/lib/supabase-browser";

type Product = {
  slug: string; name: string; price: number; colours: string[]; sizes: string[]; stock: number;
  is_preorder: boolean; preorder_advance: number; active: boolean;
};
type Line = { slug: string; colour: string; size: string; qty: number };
type Settings = { delivery_inside: number; delivery_outside: number; free_delivery_over: number; addon_enabled: boolean; addon_name: string; addon_price: number };
type Known = { name: string; address: string; area: string; blocked: boolean; orders: number; delivered: number; returned: number; cancelled: number };
type CourierRecord = { parcels: number; delivered: number; cancelled: number; reports: number };

const SOURCES = [
  { id: "messenger", label: "Messenger" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "phone", label: "Phone call" },
  { id: "instagram", label: "Instagram" },
  { id: "other", label: "Other" },
];
const isMobile = (v: string) => /^01[3-9]\d{8}$/.test(v);

// Staff enter an order that came from a chat or a call. The database applies the same price and stock rules as the website.
export function NewOrderForm({ integrations, onClose, onCreated }: { integrations: Integrations | null; onClose: () => void; onCreated: (orderNo: string) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [source, setSource] = useState("messenger");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState<"inside" | "outside">("inside");
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState("");
  const [deliveryOverride, setDeliveryOverride] = useState("");
  const [discount, setDiscount] = useState("");
  const [addOn, setAddOn] = useState(false);
  const [advanceOverride, setAdvanceOverride] = useState("");
  const [advanceReceived, setAdvanceReceived] = useState(false);
  const [trx, setTrx] = useState("");
  const [note, setNote] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [confirmed, setConfirmed] = useState(true);
  const [known, setKnown] = useState<Known | null | "new">(null);
  const [record, setRecord] = useState<CourierRecord | null>(null);
  const [errors, setErrors] = useState<{ [k: string]: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sb = supabase();
    sb.from("products").select("slug,name,price,colours,sizes,stock,is_preorder,preorder_advance,active").order("sort").order("created_at").then(({ data }) => setProducts((data as Product[]) ?? []));
    sb.from("settings").select("delivery_inside,delivery_outside,free_delivery_over,addon_enabled,addon_name,addon_price").eq("id", 1).single().then(({ data }) => setSettings(data as Settings));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Look the number up as soon as it is complete: fill in a returning customer's details and show their record.
  useEffect(() => {
    setKnown(null);
    setRecord(null);
    if (!isMobile(phone)) return;
    let cancelled = false;
    supabase().rpc("customers_report", { p_search: phone, p_sort: "recent", p_limit: 1, p_offset: 0 }).then(({ data }) => {
      if (cancelled) return;
      const row = ((data as { rows: (Known & { phone: string })[] })?.rows ?? []).find((r) => r.phone === phone);
      setKnown(row ?? "new");
      if (row) {
        setName((n) => n || row.name);
        setAddress((a) => a || row.address);
        if (row.area === "inside" || row.area === "outside") setArea(row.area);
      }
    });
    if (integrations?.steadfast.connected) {
      staffApi<CourierRecord>(`/api/courier/check?phone=${phone}`).then((r) => !cancelled && setRecord(r)).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [phone, integrations?.steadfast.connected]);

  const bySlug = useMemo(() => new Map(products.map((p) => [p.slug, p])), [products]);

  function addLine() {
    const p = bySlug.get(pick);
    if (!p) return;
    setLines([...lines, { slug: p.slug, colour: p.colours[0] ?? "", size: "", qty: 1 }]);
    setPick("");
  }
  const updateLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  // Live totals, matching the database rules.
  const subtotal = lines.reduce((s, l) => s + (bySlug.get(l.slug)?.price ?? 0) * l.qty, 0);
  const disc = Math.min(Number(discount || 0), subtotal);
  const addonAmt = addOn && settings?.addon_enabled ? settings.addon_price : 0;
  const autoDelivery = !settings ? 0 : settings.free_delivery_over > 0 && subtotal - disc >= settings.free_delivery_over ? 0 : area === "inside" ? settings.delivery_inside : settings.delivery_outside;
  const delivery = deliveryOverride === "" ? autoDelivery : Number(deliveryOverride);
  const total = subtotal + addonAmt + delivery - disc;
  const ruleAdvance = lines.reduce((s, l) => s + ((bySlug.get(l.slug)?.is_preorder ? bySlug.get(l.slug)!.preorder_advance : 0) * l.qty), 0);
  const advance = advanceOverride === "" ? ruleAdvance : Number(advanceOverride);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const { data, error } = await supabase().rpc("create_manual_order", {
      p: {
        source, name, phone, address, area, add_on: addOn, discount, delivery: deliveryOverride, advance: advanceOverride,
        advance_received: advanceReceived, trx_id: trx, note, staff_note: staffNote, confirmed,
        lines: lines.map((l) => ({ ...l, size: l.size || null })),
      },
    });
    setSaving(false);
    const r = data as { ok: boolean; order_no?: string; errors?: { [k: string]: string } } | null;
    if (error) return setErrors({ form: error.message });
    if (!r?.ok) return setErrors(r?.errors ?? { form: "Could not save the order." });
    onCreated(r.order_no!);
  }

  const knownRisky = known && known !== "new" && known.returned + known.cancelled > known.delivered && known.returned + known.cancelled > 0;

  return (
    <div className="drawer-root">
      <button className="drawer-overlay" aria-label="Close" onClick={onClose} />
      <aside className="drawer adm-panel adm-panel-wide" role="dialog" aria-modal="true" aria-label="New order">
        <div className="drawer-head">
          <h2 className="adm-h1" style={{ margin: 0 }}>New order</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </div>
        <form className="adm-panel-body" onSubmit={save} noValidate>
          <section className="adm-sec">
            <h3>Order came from</h3>
            <div className="adm-flags" role="radiogroup" aria-label="Order came from">
              {SOURCES.map((s) => (
                <label key={s.id} className="radio adm-radio adm-radio-sm"><input type="radio" name="source" checked={source === s.id} onChange={() => setSource(s.id)} /><span>{s.label}</span></label>
              ))}
            </div>
            {errors.source && <span className="err" role="alert">{errors.source}</span>}
          </section>

          <section className="adm-sec">
            <h3>Customer</h3>
            <F id="m-phone" label="Mobile number" error={errors.phone}>
              <input id="m-phone" className="input" inputMode="numeric" placeholder="01XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 11))} />
            </F>
            {known === "new" && <p className="muted small">New customer.</p>}
            {known && known !== "new" && (
              <div className={`adm-history ${knownRisky || known.blocked ? "adm-history-risk" : ""}`}>
                {known.blocked && <strong>This number is blocked. </strong>}
                Returning customer: {known.orders} {known.orders === 1 ? "order" : "orders"}, {known.delivered} delivered, {known.returned} returned, {known.cancelled} cancelled. Details filled in below.
              </div>
            )}
            {record && (
              <div className={`adm-history ${record.parcels > 0 && record.cancelled > record.delivered ? "adm-history-risk" : ""}`}>
                {record.parcels === 0 ? "Steadfast record: no parcels yet." : `Steadfast record: ${record.parcels} parcels, ${record.delivered} delivered, ${record.cancelled} cancelled.`}
                {record.reports > 0 && ` ${record.reports} fraud ${record.reports === 1 ? "report" : "reports"}.`}
              </div>
            )}
            <F id="m-name" label="Name" error={errors.name}><input id="m-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></F>
            <F id="m-address" label="Full address" error={errors.address}><textarea id="m-address" className="input" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} /></F>
            <div className="adm-flags" role="radiogroup" aria-label="Delivery area">
              <label className="radio adm-radio"><input type="radio" name="m-area" checked={area === "inside"} onChange={() => setArea("inside")} /><span>Inside Dhaka city</span></label>
              <label className="radio adm-radio"><input type="radio" name="m-area" checked={area === "outside"} onChange={() => setArea("outside")} /><span>Outside Dhaka city</span></label>
            </div>
          </section>

          <section className="adm-sec">
            <h3>Products</h3>
            {lines.map((l, i) => {
              const p = bySlug.get(l.slug);
              if (!p) return null;
              return (
                <div key={i} className="adm-mline">
                  <div className="row-between">
                    <strong style={{ fontWeight: 500 }}>{p.name}</strong>
                    <span>{taka(p.price * l.qty)}</span>
                  </div>
                  <div className="muted small">{p.is_preorder ? `Pre-order${p.preorder_advance ? ` · advance ${taka(p.preorder_advance)} each` : ""}` : `${p.stock} in stock`}{!p.active ? " · hidden from website" : ""}</div>
                  <div className="adm-flags">
                    {p.colours.length > 0 && (
                      <select aria-label="Colour" className="input adm-select" value={l.colour} onChange={(e) => updateLine(i, { colour: e.target.value })}>
                        {p.colours.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    )}
                    {p.sizes.length > 0 && (
                      <select aria-label="Size" className="input adm-select" value={l.size} onChange={(e) => updateLine(i, { size: e.target.value })}>
                        <option value="">Size</option>
                        {p.sizes.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    )}
                    <label className="sr-only" htmlFor={`m-qty-${i}`}>Quantity</label>
                    <input id={`m-qty-${i}`} className="input adm-qty" inputMode="numeric" value={l.qty} onChange={(e) => updateLine(i, { qty: Math.max(1, Math.min(20, Number(e.target.value.replace(/[^\d]/g, "")) || 1)) })} />
                    <button type="button" className="link-btn" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                </div>
              );
            })}
            <div className="adm-flags">
              <label className="sr-only" htmlFor="m-pick">Add a product</label>
              <select id="m-pick" className="input adm-select" style={{ flex: "1 1 200px", width: "100%" }} value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Choose a product…</option>
                {products.map((p) => (
                  <option key={p.slug} value={p.slug} disabled={!p.is_preorder && p.stock <= 0}>
                    {p.name} · {taka(p.price)} · {p.is_preorder ? "pre-order" : p.stock > 0 ? `${p.stock} in stock` : "sold out"}
                  </option>
                ))}
              </select>
              <button type="button" className="adm-btn-ghost" disabled={!pick} onClick={addLine}>Add</button>
            </div>
            {errors.lines && <span className="err" role="alert">{errors.lines}</span>}
          </section>

          <section className="adm-sec">
            <h3>Price and payment</h3>
            <div className="adm-grid2">
              <F id="m-del" label="Delivery charge (৳)" hint={`Empty = normal charge (${taka(autoDelivery)})`} error={errors.delivery}>
                <input id="m-del" className="input" inputMode="numeric" value={deliveryOverride} onChange={(e) => setDeliveryOverride(e.target.value.replace(/[^\d]/g, ""))} />
              </F>
              <F id="m-disc" label="Discount (৳)" error={errors.discount}>
                <input id="m-disc" className="input" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d]/g, ""))} />
              </F>
            </div>
            {settings?.addon_enabled && (
              <label className="adm-check"><input type="checkbox" checked={addOn} onChange={(e) => setAddOn(e.target.checked)} />Add {settings.addon_name.toLowerCase()} (+{taka(settings.addon_price)})</label>
            )}
            <div className="adm-grid2">
              <F id="m-adv" label="Advance by bKash (৳)" hint={`Empty = pre-order rule (${taka(ruleAdvance)})`} error={errors.advance}>
                <input id="m-adv" className="input" inputMode="numeric" value={advanceOverride} onChange={(e) => setAdvanceOverride(e.target.value.replace(/[^\d]/g, ""))} />
              </F>
              {advance > 0 && (
                <F id="m-trx" label="bKash transaction ID" error={errors.trx_id}><input id="m-trx" className="input" value={trx} onChange={(e) => setTrx(e.target.value)} /></F>
              )}
            </div>
            {advance > 0 && <label className="adm-check"><input type="checkbox" checked={advanceReceived} onChange={(e) => setAdvanceReceived(e.target.checked)} />Advance received (checked in the bKash app)</label>}
            <div className="sum-rows">
              <div className="row-between"><span className="k">Products</span><span>{taka(subtotal)}</span></div>
              {disc > 0 && <div className="row-between"><span className="k">Discount</span><span>−{taka(disc)}</span></div>}
              {addonAmt > 0 && <div className="row-between"><span className="k">Add-on</span><span>{taka(addonAmt)}</span></div>}
              <div className="row-between"><span className="k">Delivery</span><span>{delivery === 0 ? "Free" : taka(delivery)}</span></div>
              <div className="row-between sum-total"><span>Total</span><span>{taka(total)}</span></div>
              {advance > 0 && <div className="row-between"><span className="k">Advance</span><span>{taka(advance)}</span></div>}
              <div className="row-between" style={{ fontWeight: 500 }}><span>Courier collects</span><span>{taka(Math.max(0, total - advance))}</span></div>
            </div>
          </section>

          <section className="adm-sec">
            <h3>Notes</h3>
            <F id="m-note" label="Note for delivery" hint="Goes to the courier, e.g. call before delivery"><input id="m-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></F>
            <F id="m-snote" label="Staff note" hint="Only staff see this"><input id="m-snote" className="input" value={staffNote} onChange={(e) => setStaffNote(e.target.value)} /></F>
            <label className="adm-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />Already confirmed with the customer</label>
            <span className="muted small">{confirmed ? "The order goes straight to Confirmed." : "The order goes to New, to confirm by phone later."}</span>
          </section>

          {errors.form && <p className="notice" role="alert">{errors.form}</p>}
          {Object.keys(errors).some((k) => k !== "form") && <p className="err" role="alert">Please fix the fields marked above.</p>}
          <div className="adm-flags" style={{ paddingTop: 12 }}>
            <button className="adm-btn" type="submit" disabled={saving || !lines.length}>{saving ? "Saving…" : `Create order · ${taka(total)}`}</button>
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
