// Store settings. The real values are edited in the admin panel (Settings tab) and stored in the database.
// The defaults below are used only in demo mode or if the database cannot be reached.
export type Settings = {
  brand: string;
  domain: string;
  whatsappNumber: string; // 01XXXXXXXXX, or "" when not set
  bkashNumber: string;
  facebookUrl: string;
  instagramUrl: string;
  delivery: { insideDhaka: number; outsideDhaka: number; freeOver: number };
  addOn: { enabled: boolean; name: string; note: string; price: number };
  exchangeLine: string; // one-line promise shown near the order button
  policyText: string; // full exchange and refund policy page
  capiPurchaseOn: "placed" | "confirmed"; // when the Purchase event goes to Meta
};

export const defaultSettings: Settings = {
  brand: "FEMIS",
  domain: "femisbd.com",
  whatsappNumber: "",
  bkashNumber: "",
  facebookUrl: "",
  instagramUrl: "",
  delivery: { insideDhaka: 80, outsideDhaka: 150, freeOver: 3000 },
  addOn: { enabled: true, name: "Gift box", note: "Arrives in the same parcel.", price: 200 },
  exchangeLine: "",
  policyText: "",
  capiPurchaseOn: "confirmed",
};

export type Area = "inside" | "outside";

export function deliveryCharge(s: Settings, area: Area, subtotal: number): number {
  if (s.delivery.freeOver > 0 && subtotal >= s.delivery.freeOver) return 0;
  return area === "inside" ? s.delivery.insideDhaka : s.delivery.outsideDhaka;
}

export function whatsappLink(s: Settings, message: string): string {
  const base = s.whatsappNumber ? `https://wa.me/88${s.whatsappNumber}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(message)}`;
}

export const taka = (n: number) => `৳${n.toLocaleString("en-US")}`;
export const bnDigits = (n: number) => String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);
