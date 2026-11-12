"use client";

import Image from "next/image";
import Link from "next/link";
import { useSettings } from "./cart-context";

export function Footer() {
  const config = useSettings();
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <div className="footer-cols">
          <div className="footer-brand">
            <Image src="/brand/femis-logo-light.png" alt="FEMIS" width={116} height={40} />
            <span>Clutches, purses and shoes for women in Bangladesh.</span>
          </div>
          <nav aria-label="Shop" className="footer-col">
            <span className="footer-head">Shop</span>
            <Link href="/category/clutches">Clutches</Link>
            <Link href="/category/purses">Purses</Link>
            <Link href="/category/shoes">Shoes</Link>
            <Link href="/category/pre-order">Pre-order</Link>
          </nav>
          <nav aria-label="Help" className="footer-col">
            <span className="footer-head">Help</span>
            <Link href="/track">Track your order</Link>
            <Link href="/policy">Exchange and refund policy</Link>
            <span>Delivery: ৳{config.delivery.insideDhaka} inside Dhaka city, ৳{config.delivery.outsideDhaka} outside</span>
          </nav>
          {(config.whatsappNumber || config.facebookUrl || config.instagramUrl) && (
            <div className="footer-col">
              <span className="footer-head">Contact</span>
              {config.whatsappNumber && <a href={`https://wa.me/88${config.whatsappNumber}`} target="_blank" rel="noopener noreferrer">WhatsApp {config.whatsappNumber}</a>}
              {config.facebookUrl && <a href={config.facebookUrl} target="_blank" rel="noopener noreferrer">Facebook</a>}
              {config.instagramUrl && <a href={config.instagramUrl} target="_blank" rel="noopener noreferrer">Instagram</a>}
            </div>
          )}
        </div>
        <div className="footer-base">
          <span>© FEMIS · {config.domain}</span>
          <span>Cash on delivery · bKash</span>
        </div>
      </div>
    </footer>
  );
}
