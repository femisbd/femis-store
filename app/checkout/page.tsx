"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { attribution, track } from "@/lib/pixel";
import { useCart, useSettings } from "@/components/cart-context";
import { FreeDeliveryBar } from "@/components/FreeDeliveryBar";
import { Photo } from "@/components/Photo";
import { taka, whatsappLink, type Area } from "@/lib/config";
import { isBdMobile, totals, validateOrder, type Coupon, type OrderRequest } from "@/lib/order";
import { publicRpc } from "@/lib/public-db";

export default function CheckoutPage() {
  const config = useSettings();
  const cart = useCart();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", phone: "", address: "", note: "", trxId: "" });
  const [area, setArea] = useState<Area>("inside");
  const [addOn, setAddOn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponMsg, setCouponMsg] = useState("");
  const [checking, setChecking] = useState(false);

  const t = totals(cart.lines, area, addOn, config, coupon);
  const couponBelowMin = coupon && t.subtotal < coupon.min_subtotal;

  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setChecking(true);
    setCouponMsg("");
    const r = await publicRpc<{ ok: boolean; message?: string } & Coupon>("check_coupon", { p_code: code, p_subtotal: t.subtotal, p_phone: form.phone.replace(/[\s-]/g, "") });
    setChecking(false);
    if (!r) return setCouponMsg("Could not check the code. Try again.");
    if (!r.ok) return setCouponMsg(r.message ?? "This code is not valid.");
    setCoupon({ code: r.code, kind: r.kind, value: r.value, max_discount: r.max_discount, min_subtotal: r.min_subtotal });
    setErrors((e) => { const { coupon: _drop, ...rest } = e; return rest; });
  }

  // Save what the visitor has typed once the phone number is valid, so staff can follow up
  // if they leave without ordering. One saved checkout per browser; updated as they type.
  useEffect(() => {
    if (!cart.ready || !cart.lines.length || !isBdMobile(form.phone)) return;
    const id = setTimeout(() => {
      let draftId = "";
      try {
        draftId = localStorage.getItem("femis-draft-id") || crypto.randomUUID();
        localStorage.setItem("femis-draft-id", draftId);
      } catch {
        return;
      }
      publicRpc("save_checkout_draft", {
        p: {
          id: draftId, phone: form.phone.replace(/[\s-]/g, ""), name: form.name, address: form.address, area,
          lines: cart.lines.map(({ slug, colour, size, qty }) => ({ slug, colour, size, qty })),
        },
      });
    }, 1500);
    return () => clearTimeout(id);
  }, [cart.ready, cart.lines, form.phone, form.name, form.address, area]);

  // InitiateCheckout once, when the saved cart has loaded.
  const started = useRef(false);
  useEffect(() => {
    if (!cart.ready || started.current || !cart.lines.length) return;
    started.current = true;
    track("InitiateCheckout", { content_ids: cart.lines.map((l) => l.slug), content_type: "product", num_items: cart.count, value: cart.subtotal, currency: "BDT" });
  }, [cart.ready, cart.lines, cart.count, cart.subtotal]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: OrderRequest = {
      ...form,
      area,
      addOn,
      coupon: coupon && !couponBelowMin ? coupon.code : "",
      lines: cart.lines.map(({ slug, colour, size, qty }) => ({ slug, colour, size, qty })),
    };
    const body = { ...payload, tracking: attribution() };
    const found = validateOrder(payload, cart.lines, t);
    setErrors(found);
    if (Object.keys(found).length) {
      const first = Object.keys(found)[0];
      document.getElementById(first)?.focus();
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!data.ok) {
        const errs = data.errors ?? { form: "Something went wrong. Please try again." };
        if (errs.coupon) {
          setCoupon(null);
          setCouponOpen(true);
          setCouponMsg(errs.coupon);
          errs.form = errs.form ?? `${errs.coupon} The code was removed; check the new total and confirm again.`;
        }
        setErrors(errs);
        return;
      }
      sessionStorage.setItem("femis-last-order", JSON.stringify(data.order));
      try {
        localStorage.removeItem("femis-draft-id");
      } catch {}
      cart.clear();
      router.push("/thank-you");
    } catch {
      setErrors({ form: "We could not send your order. Check your internet connection and try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="glass header checkout-header">
        <div className="header-row">
          <Link href="/category/all">← Shop</Link>
          <Link href="/" aria-label="FEMIS home" className="logo"><Image src="/brand/femis-logo.png" alt="FEMIS" width={99} height={34} priority /></Link>
          <a href={whatsappLink(config, "Hello FEMIS, I need help with my order.")} target="_blank" rel="noopener noreferrer" style={{ justifySelf: "end" }}>Help</a>
        </div>
      </header>

      <main>
        {cart.ready && cart.lines.length === 0 ? (
          <section className="narrow">
            <h1 className="h1">Your cart is empty.</h1>
            <Link href="/category/all" className="btn" style={{ alignSelf: "flex-start" }}>Shop the collection</Link>
          </section>
        ) : (
          <section className="checkout">
            <form onSubmit={submit} noValidate>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <h1 className="h1" style={{ fontSize: "clamp(40px, 4.4vw, 60px)" }}>Checkout</h1>
                <span style={{ color: "var(--body)" }}>No account needed. It takes under a minute.</span>
              </div>

              <fieldset>
                <legend>1. Your details</legend>
                <Field id="name" label="Full name" bn="আপনার নাম" error={errors.name}>
                  <input id="name" className="input" autoComplete="name" value={form.name} onChange={set("name")} aria-invalid={!!errors.name} />
                </Field>
                <Field id="phone" label="Mobile number" bn="মোবাইল নাম্বার" error={errors.phone}>
                  <input id="phone" className="input" type="tel" inputMode="numeric" autoComplete="tel" placeholder="01XXXXXXXXX" value={form.phone} onChange={set("phone")} aria-invalid={!!errors.phone} />
                </Field>
                <Field id="address" label="Full address" bn="সম্পূর্ণ ঠিকানা" error={errors.address}>
                  <textarea id="address" className="input" autoComplete="street-address" placeholder="House, road, area, thana, district" value={form.address} onChange={set("address")} aria-invalid={!!errors.address} />
                </Field>
              </fieldset>

              <fieldset>
                <legend>2. Delivery area</legend>
                <label className="radio">
                  <input type="radio" name="area" checked={area === "inside"} onChange={() => setArea("inside")} />
                  <span className="grow">Inside Dhaka city</span>
                  <span>{config.delivery.freeOver > 0 && t.subtotal >= config.delivery.freeOver ? "Free" : taka(config.delivery.insideDhaka)}</span>
                </label>
                <label className="radio">
                  <input type="radio" name="area" checked={area === "outside"} onChange={() => setArea("outside")} />
                  <span className="grow">Outside Dhaka city</span>
                  <span>{config.delivery.freeOver > 0 && t.subtotal >= config.delivery.freeOver ? "Free" : taka(config.delivery.outsideDhaka)}</span>
                </label>
              </fieldset>

              <fieldset>
                <legend>3. Payment</legend>
                <div className="paybox">
                  <strong>Cash on delivery</strong>
                  <span style={{ fontSize: 15, color: "var(--body)" }}>Pay {taka(t.onDelivery)} when the parcel reaches you.</span>
                </div>
                {t.advance > 0 && (
                  <div className="paybox adv">
                    <strong style={{ display: "flex", alignItems: "center", gap: 10 }}><span className="dot" aria-hidden="true" />Advance for your pre-order piece: {taka(t.advance)}</strong>
                    <span style={{ fontSize: 15, lineHeight: 1.55, color: "var(--body)" }}>Send {taka(t.advance)} to bKash {config.bkashNumber || "(number coming soon)"} using Send Money, then enter the transaction ID below. The rest is paid on delivery.</span>
                    <Field id="trxId" label="bKash transaction ID" bn="ট্রানজেকশন আইডি" error={errors.trxId}>
                      <input id="trxId" className="input" autoComplete="off" value={form.trxId} onChange={set("trxId")} aria-invalid={!!errors.trxId} />
                    </Field>
                  </div>
                )}
              </fieldset>

              {config.addOn.enabled && <label className="addon">
                <input type="checkbox" checked={addOn} onChange={(e) => setAddOn(e.target.checked)} />
                <span className="grow">
                  <strong style={{ fontWeight: 500 }}>Add a {config.addOn.name.toLowerCase()}</strong>
                  <span style={{ fontSize: 15, color: "var(--body)" }}>{config.addOn.note}</span>
                </span>
                <span style={{ whiteSpace: "nowrap" }}>+ {taka(config.addOn.price)}</span>
              </label>}

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="coupon">
                  {coupon ? (
                    <div className="row-between" style={{ alignItems: "center" }}>
                      <span>
                        Code <strong style={{ fontWeight: 500 }}>{coupon.code}</strong>{" "}
                        {couponBelowMin ? <span className="err">needs an order of at least {taka(coupon.min_subtotal)}</span> : t.discount > 0 ? `· you save ${taka(t.discount)}` : coupon.kind === "free_delivery" ? "· free delivery" : ""}
                      </span>
                      <button type="button" className="link-btn" onClick={() => { setCoupon(null); setCouponInput(""); setCouponMsg(""); }}>Remove</button>
                    </div>
                  ) : couponOpen ? (
                    <div className="field">
                      <label htmlFor="coupon">Coupon code</label>
                      <div className="coupon-row">
                        <input id="coupon" className="input" autoComplete="off" autoCapitalize="characters" value={couponInput} onChange={(e) => setCouponInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }} />
                        <button type="button" className="btn-outline" onClick={applyCoupon} disabled={checking || !couponInput.trim()}>{checking ? "Checking…" : "Apply"}</button>
                      </div>
                      {couponMsg && <span className="err" role="alert">{couponMsg}</span>}
                    </div>
                  ) : (
                    <button type="button" className="link-btn" onClick={() => setCouponOpen(true)}>Have a coupon code?</button>
                  )}
                </div>
                {(errors.form || errors.lines) && <div className="notice" role="alert">{errors.form || errors.lines}</div>}
                <div className="row-between big" style={{ fontWeight: 500 }}><span>Total</span><span>{taka(t.total)}</span></div>
                <button type="submit" className="btn" style={{ minHeight: 60 }} disabled={sending || !cart.ready}>{sending ? "Sending your order…" : "Confirm order"}</button>
                <span className="bn" style={{ fontSize: 15, color: "var(--body)", textAlign: "center" }}>অর্ডার কনফার্ম করতে আমরা আপনাকে ফোন করব।</span>
              </div>
            </form>

            <aside className="summary" aria-label="Order summary">
              <h2>Your order</h2>
              <ul className="sum-items">
                {cart.lines.map((l) => (
                  <li key={l.key} className="sum-item">
                    <div className="sum-img"><Photo src={l.product.images[0]} alt={l.product.name} label="Photo" sizes="60px" /></div>
                    <div className="grow">
                      <span className="serif" style={{ fontSize: 20, lineHeight: 1.15 }}>{l.product.name}</span>
                      <span className="muted small">{l.colour}{l.size ? ` · Size ${l.size}` : ""} · Qty {l.qty} · {l.product.preorder ? "Pre-order" : "Ready to ship"}</span>
                    </div>
                    <span style={{ whiteSpace: "nowrap" }}>{taka(l.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <FreeDeliveryBar subtotal={t.subtotal - t.discount} />
              <div className="sum-rows">
                <div className="row-between"><span className="k">Subtotal</span><span>{taka(t.subtotal)}</span></div>
                {addOn && <div className="row-between"><span className="k">{config.addOn.name}</span><span>{taka(t.addOn)}</span></div>}
                {t.discount > 0 && <div className="row-between"><span className="k">Discount ({coupon?.code})</span><span>−{taka(t.discount)}</span></div>}
                <div className="row-between"><span className="k">Delivery</span><span>{t.delivery === 0 ? "Free" : taka(t.delivery)}</span></div>
                <div className="row-between sum-total"><span>Total</span><span>{taka(t.total)}</span></div>
                {t.advance > 0 && (
                  <>
                    <div className="row-between small"><span className="k">Advance by bKash now</span><span>{taka(t.advance)}</span></div>
                    <div className="row-between small"><span className="k">Cash on delivery</span><span>{taka(t.onDelivery)}</span></div>
                  </>
                )}
              </div>
              {config.exchangeLine && <span className="muted small">{config.exchangeLine}</span>}
            </aside>
          </section>
        )}
      </main>

      <div className="mini-foot">
        <span>© FEMIS · {config.domain}</span>
        {config.whatsappNumber && <span>WhatsApp {config.whatsappNumber}</span>}
      </div>
    </>
  );
}

function Field({ id, label, bn, error, children }: { id: string; label: string; bn: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label} · <span className="bn">{bn}</span></label>
      {children}
      {error && <span className="err" role="alert">{error}</span>}
    </div>
  );
}
