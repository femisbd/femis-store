"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { taka, whatsappLink } from "@/lib/config";
import type { Product } from "@/lib/products";
import { useCart, useSettings } from "./cart-context";
import { Photo } from "./Photo";

export function ProductBuy({ product, pair }: { product: Product; pair?: Product }) {
  const config = useSettings();
  const cart = useCart();
  const router = useRouter();
  const [colour, setColour] = useState(product.colours[0]);
  const [size, setSize] = useState<string | undefined>(undefined);
  const [qty, setQty] = useState(1);
  const [sizeError, setSizeError] = useState(false);
  const sizeRef = useRef<HTMLDivElement>(null);

  const pre = product.preorder;
  const soldOut = !pre && product.stock <= 0;
  const maxQty = pre ? 20 : Math.max(1, product.stock);

  function line() {
    if (product.sizes && !size) {
      setSizeError(true);
      sizeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return null;
    }
    return { slug: product.slug, colour, size, qty };
  }
  function addToCart() {
    const l = line();
    if (l) cart.add(l);
  }
  function orderNow() {
    const l = line();
    if (!l) return;
    cart.add(l, false);
    router.push("/checkout");
  }

  const waText = `Hello FEMIS, I want to order: ${product.name} (${colour}${size ? `, size ${size}` : ""}), quantity ${qty}.`;

  return (
    <div className="buy">
      <div className="buy-head">
        {pre ? <span className="badge badge-pre badge-static">Pre-order</span> : <span className="badge badge-line badge-static">{soldOut ? "Sold out" : "Ready to ship"}</span>}
        <h1 className="buy-title">{product.name}</h1>
        <span className="price">{taka(product.price)}</span>
      </div>

      <div className="opt">
        <span className="caps">Colour: {colour}</span>
        <div className="opt-row" role="group" aria-label="Colour">
          {product.colours.map((c) => (
            <button key={c} className="opt-btn" aria-pressed={colour === c} onClick={() => setColour(c)}>{c}</button>
          ))}
        </div>
      </div>

      {product.sizes && (
        <div className="opt" ref={sizeRef}>
          <span className="caps">Size{size ? `: ${size}` : ""}</span>
          <div className="opt-row" role="group" aria-label="Size">
            {product.sizes.map((s) => (
              <button key={s} className="opt-btn" aria-pressed={size === s} onClick={() => { setSize(s); setSizeError(false); }}>{s}</button>
            ))}
          </div>
          {sizeError && <span className="err" role="alert">Please choose a size.</span>}
        </div>
      )}

      {pre && (
        <div className="prebox">
          <div className="prebox-head caps"><span className="dot" aria-hidden="true" />How this pre-order works</div>
          <div className="row-between"><span className="k">Expected to ship</span><span>{pre.shipDays} days after order</span></div>
          {pre.advance > 0 ? (
            <>
              <div className="row-between"><span className="k">Advance by bKash</span><span>{taka(pre.advance * qty)}</span></div>
              <div className="row-between"><span className="k">Pay on delivery</span><span>{taka((product.price - pre.advance) * qty)} + delivery</span></div>
            </>
          ) : (
            <div className="row-between"><span className="k">Advance</span><span>None. Pay on delivery.</span></div>
          )}
        </div>
      )}

      {soldOut ? (
        <button className="btn cta-full" disabled>Sold out</button>
      ) : pre ? (
        <div className="cta-row">
          <Qty qty={qty} setQty={setQty} max={maxQty} />
          <button className="btn grow" onClick={orderNow}>Pre-order now</button>
        </div>
      ) : (
        <>
          <div className="cta-row">
            <Qty qty={qty} setQty={setQty} max={maxQty} />
            <button className="btn-outline grow" onClick={addToCart}>Add to cart</button>
          </div>
          <button className="btn cta-full" onClick={orderNow}>Order now · Cash on delivery</button>
          <span className="bn" style={{ fontSize: 15, color: "var(--body)" }}>অর্ডার করতে কোনো অগ্রিম টাকা লাগবে না — পণ্য হাতে পেয়ে মূল্য পরিশোধ করুন।</span>
        </>
      )}

      <a href={whatsappLink(config, waText)} target="_blank" rel="noopener noreferrer" className="text-link" style={{ alignSelf: "flex-start" }}>
        {soldOut ? "Ask about restock on WhatsApp" : "Or order on WhatsApp"}
      </a>

      {!pre && !soldOut && (
        <ul className="assure">
          <li><span>{product.stock <= 3 ? `Only ${product.stock} left in stock.` : "In stock and ready to ship."}</span></li>
          <li><span>Pay cash when the parcel reaches you.</span></li>
          {config.exchangeLine && <li><span>{config.exchangeLine}</span></li>}
        </ul>
      )}

      {pair && (
        <div className="look">
          <span className="caps">Complete the look</span>
          <div className="look-row">
            <div className="look-img"><Photo src={pair.images[0]} alt={pair.name} label="Photo" sizes="64px" /></div>
            <div className="look-text">
              <span className="serif look-name">{pair.name}</span>
              <span>{taka(pair.price)}</span>
            </div>
            {pair.sizes ? (
              <Link href={`/product/${pair.slug}`} className="btn-sm">View</Link>
            ) : (
              <button className="btn-sm" onClick={() => cart.add({ slug: pair.slug, colour: pair.colours[0], qty: 1 })}>Add</button>
            )}
          </div>
        </div>
      )}

      <div className="acc">
        <details open><summary>Details</summary><p>{product.details}</p></details>
        <details><summary>Delivery</summary><p>{taka(config.delivery.insideDhaka)} inside Dhaka city and {taka(config.delivery.outsideDhaka)} outside Dhaka city, sent by courier with a tracking link. Free delivery on orders over {taka(config.delivery.freeOver)}.</p></details>
        <details><summary>Exchange and refund</summary><p>{config.exchangeLine} <Link href="/policy">Read the full policy</Link></p></details>
      </div>

      {!soldOut && (
        <div className="glass mobile-bar mobile-bar-fixed">
          <span style={{ fontSize: 17, whiteSpace: "nowrap" }}>{taka(product.price * qty)}</span>
          <button className="btn" onClick={orderNow}>{pre ? "Pre-order now" : "Order now"}</button>
        </div>
      )}
    </div>
  );
}

function Qty({ qty, setQty, max }: { qty: number; setQty: (n: number) => void; max: number }) {
  return (
    <div className="qty" role="group" aria-label="Quantity">
      <button aria-label="Decrease quantity" onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1}>−</button>
      <span aria-live="polite">{qty}</span>
      <button aria-label="Increase quantity" onClick={() => setQty(Math.min(max, qty + 1))} disabled={qty >= max}>+</button>
    </div>
  );
}
