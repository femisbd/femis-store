// FEMIS store settings. Change values here; the whole site updates.
export const config = {
  brand: "FEMIS",
  domain: "femisbd.com",
  // TODO: replace with the real WhatsApp number in international format, digits only (e.g. 8801XXXXXXXXX)
  whatsappNumber: "",
  // TODO: replace with the bKash number customers send the pre-order advance to
  bkashNumber: "[BKASH NUMBER]",
  facebookUrl: "",
  instagramUrl: "",
  delivery: {
    insideDhaka: 80,
    outsideDhaka: 150,
    freeOver: 3000, // free delivery when the product subtotal reaches this amount
  },
  // Checkout add-on (AOV). TODO: confirm the real add-on name.
  addOn: { name: "Gift box", note: "Arrives in the same parcel.", price: 200 },
  // TODO: replace with the real one-line exchange promise
  exchangeLine: "[YOUR EXCHANGE PROMISE IN ONE LINE]",
} as const;

export type Area = "inside" | "outside";

export function deliveryCharge(area: Area, subtotal: number): number {
  if (subtotal >= config.delivery.freeOver) return 0;
  return area === "inside" ? config.delivery.insideDhaka : config.delivery.outsideDhaka;
}

export function whatsappLink(message: string): string {
  const base = config.whatsappNumber ? `https://wa.me/${config.whatsappNumber}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(message)}`;
}

export const taka = (n: number) => `৳${n.toLocaleString("en-US")}`;
