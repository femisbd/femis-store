import type { Metadata } from "next";
import { CartDrawer } from "@/components/CartDrawer";
import { CartProvider } from "@/components/cart-context";
import { MetaPixel } from "@/components/MetaPixel";
import { getCatalog, getSettings } from "@/lib/catalog";
// Fonts are self-hosted (served from our own domain), which is faster than loading them from Google.
import "@fontsource/cormorant-garamond/latin-500.css";
import "@fontsource/jost/latin-300.css";
import "@fontsource/jost/latin-400.css";
import "@fontsource/jost/latin-500.css";
import "@fontsource/hind-siliguri/bengali-400.css";
import "@fontsource/hind-siliguri/bengali-500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FEMIS — Clutches, purses and shoes", template: "%s — FEMIS" },
  description: "Clutches, purses and shoes for weddings, parties and every evening in between. Delivery across Bangladesh with cash on delivery.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [{ products }, settings] = await Promise.all([getCatalog(), getSettings()]);
  return (
    <html lang="en">
      <body>
        <CartProvider products={products} settings={settings}>
          {children}
          <CartDrawer />
          <MetaPixel />
        </CartProvider>
      </body>
    </html>
  );
}
