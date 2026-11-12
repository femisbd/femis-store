"use client";

import Link from "next/link";
import { useEffect } from "react";
import { taka } from "@/lib/config";
import { useCart, useSettings } from "./cart-context";
import { FreeDeliveryBar } from "./FreeDeliveryBar";
import { Photo } from "./Photo";

export function CartDrawer() {
  const config = useSettings();
  const cart = useCart();

  useEffect(() => {
    if (!cart.isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cart.close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [cart.isOpen, cart.close]);

  if (!cart.isOpen) return null;

  // "Complete the look": first paired product that is not already in the cart.
  const inCart = new Set(cart.lines.map((l) => l.slug));
  const suggestion = cart.lines
    .map((l) => (l.product.pairsWith ? cart.getProduct(l.product.pairsWith) : undefined))
    .find((p) => p && !inCart.has(p.slug) && (p.preorder || p.stock > 0));

  return (
    <div className="drawer-root">
      <button className="drawer-overlay" aria-label="Close cart" onClick={cart.close} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Your cart">
        <div className="drawer-head">
          <h2 className="serif">Your cart <span className="muted small sans">{cart.count} {cart.count === 1 ? "item" : "items"}</span></h2>
          <button className="icon-btn" aria-label="Close cart" onClick={cart.close}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
          </button>
        </div>

        {cart.lines.length === 0 ? (
          <div className="drawer-empty">
            <p>Your cart is empty.</p>
            <Link href="/category/all" className="btn" onClick={cart.close}>Shop the collection</Link>
          </div>
        ) : (
          <>
            <div className="drawer-pad"><FreeDeliveryBar subtotal={cart.subtotal} /></div>
            <ul className="drawer-items">
              {cart.lines.map((l) => (
                <li key={l.key} className="line">
                  <div className="line-img"><Photo src={l.product.images[0]} alt={l.product.name} label="Photo" sizes="88px" /></div>
                  <div className="line-body">
                    <div className="line-top">
                      <span className="serif line-name">{l.product.name}</span>
                      <span>{taka(l.lineTotal)}</span>
                    </div>
                    <span className="muted small">{l.colour}{l.size ? ` · Size ${l.size}` : ""}</span>
                    <span className="muted small">{l.product.preorder ? `Pre-order · ships in ${l.product.preorder.shipDays} days` : "Ready to ship"}</span>
                    <div className="line-actions">
                      <div className="qty" role="group" aria-label={`Quantity of ${l.product.name}`}>
                        <button aria-label="Decrease quantity" onClick={() => cart.setQty(l.key, l.qty - 1)} disabled={l.qty <= 1}>−</button>
                        <span aria-live="polite">{l.qty}</span>
                        <button aria-label="Increase quantity" onClick={() => cart.setQty(l.key, l.qty + 1)}>+</button>
                      </div>
                      <button className="link-btn" onClick={() => cart.remove(l.key)}>Remove</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {suggestion && (
              <div className="look">
                <span className="caps">Complete the look</span>
                <div className="look-row">
                  <div className="look-img"><Photo src={suggestion.images[0]} alt={suggestion.name} label="Photo" sizes="64px" /></div>
                  <div className="look-text">
                    <span className="serif look-name">{suggestion.name}</span>
                    <span>{taka(suggestion.price)}</span>
                  </div>
                  {suggestion.sizes ? (
                    <Link href={`/product/${suggestion.slug}`} className="btn-sm" onClick={cart.close}>Choose size</Link>
                  ) : (
                    <button className="btn-sm" onClick={() => cart.add({ slug: suggestion.slug, colour: suggestion.colours[0], qty: 1 }, false)}>Add</button>
                  )}
                </div>
              </div>
            )}

            <div className="drawer-foot">
              <div className="row-between big"><span>Subtotal</span><span>{taka(cart.subtotal)}</span></div>
              <span className="muted small">Delivery is added at checkout: ৳{config.delivery.insideDhaka} inside Dhaka city, ৳{config.delivery.outsideDhaka} outside.</span>
              <Link href="/checkout" className="btn" onClick={cart.close}>Checkout · Cash on delivery</Link>
              <button className="link-btn caps center" onClick={cart.close}>Continue shopping</button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
