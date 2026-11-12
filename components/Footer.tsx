import Image from "next/image";
import Link from "next/link";
import { config } from "@/lib/config";

export function Footer() {
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
            {/* TODO: add policy pages when the policy text is ready */}
            <span>Delivery: ৳{config.delivery.insideDhaka} inside Dhaka city, ৳{config.delivery.outsideDhaka} outside</span>
            <span>{config.exchangeLine}</span>
          </nav>
          <div className="footer-col">
            <span className="footer-head">Contact</span>
            <span>WhatsApp {config.whatsappNumber || "[NUMBER]"}</span>
            <span>{config.facebookUrl || "[FACEBOOK PAGE]"}</span>
            <span>{config.instagramUrl || "[INSTAGRAM PAGE]"}</span>
          </div>
        </div>
        <div className="footer-base">
          <span>© FEMIS · {config.domain}</span>
          <span>Cash on delivery · bKash</span>
        </div>
      </div>
    </footer>
  );
}
