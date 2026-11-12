"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "./cart-context";

const NAV = [
  { href: "/category/clutches", label: "Clutches" },
  { href: "/category/purses", label: "Purses" },
  { href: "/category/shoes", label: "Shoes" },
  { href: "/category/pre-order", label: "Pre-order" },
];

export function AnnouncementBar() {
  return (
    <div className="announce">
      <span className="bn">ঢাকা সিটির ভিতরে ডেলিভারি ৳৮০ · ঢাকা সিটির বাইরে ৳১৫০</span>
      <span>Free delivery over ৳3,000</span>
    </div>
  );
}

export function Header() {
  const cart = useCart();
  const [menu, setMenu] = useState(false);
  return (
    <header className="glass header">
      <div className="header-row">
        <div className="header-left">
          <button className="icon-btn menu-btn" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3 7h18M3 12h18M3 17h18" /></svg>
          </button>
          <nav className="nav-links" aria-label="Main">
            {NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
          </nav>
        </div>
        <Link href="/" aria-label="FEMIS home" className="logo">
          <Image src="/brand/femis-logo.png" alt="FEMIS" width={99} height={34} priority />
        </Link>
        <div className="header-right">
          <Link href="/track" className="icon-btn" aria-label="Track your order">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.8" /><circle cx="17.5" cy="18" r="1.8" /></svg>
          </Link>
          <button className="icon-btn" aria-label={`Open cart, ${cart.count} items`} onClick={cart.open}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
            {cart.count > 0 && <span className="cart-count" aria-hidden="true">{cart.count}</span>}
          </button>
        </div>
      </div>
      {menu && (
        <nav className="mobile-menu" aria-label="Main mobile">
          {NAV.map((n) => <Link key={n.href} href={n.href} onClick={() => setMenu(false)}>{n.label}</Link>)}
          <Link href="/track" onClick={() => setMenu(false)}>Track your order</Link>
        </nav>
      )}
    </header>
  );
}
