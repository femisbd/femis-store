"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart, useSettings } from "@/components/cart-context";
import { FreeDeliveryBar } from "@/components/FreeDeliveryBar";
import { Photo } from "@/components/Photo";
import { taka, whatsappLink, type Area } from "@/lib/config";
import { totals, validateOrder, type OrderRequest } from "@/lib/order";

export default function CheckoutPage() {
  const config = useSettings();
  const cart = useCart();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", phone: "", address: "", note: "", trxId: "" });
  const [area, setArea] = useState<Area>("inside");
  const [addOn, setAddOn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  const t = totals(cart.lines, area, addOn, config);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: OrderRequest = {
      ...form,
      area,
      addOn,
      lines: cart.lines.map(({ slug, colour, size, qty }) => ({ slug, colour, size, qty })),
    };
    const found = validateOrder(payload, cart.lines, t);
    setErrors(found);
    if (Object.keys(found).length) {
      const first = Object.keys(found)[0];
      document.getElementById(first)?.focus();
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.ok) {
        setErrors(data.errors ?? { form: "Something went wrong. Please try again." });
        return;
      }
      sessionStorage.setItem("femis-last-order", JSON.stringify(data.order));
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
              <FreeDeliveryBar subtotal={t.subtotal} />
              <div className="sum-rows">
                <div className="row-between"><span className="k">Subtotal</span><span>{taka(t.subtotal)}</span></div>
                {addOn && <div className="row-between"><span className="k">{config.addOn.name}</span><span>{taka(t.addOn)}</span></div>}
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
