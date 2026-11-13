import { cacheLife, cacheTag } from "next/cache";
import { defaultSettings, type Settings } from "./config";
import { sampleCatalog, type Catalog, type Category, type Product } from "./products";

// Loads categories and visible products from the database.
// Cached for speed and refreshed every minute, and immediately after the owner saves a product.
type ProductRow = {
  slug: string; name: string; category_slug: string; price: number; colours: string[]; sizes: string[];
  images: string[]; details: string; stock: number; is_preorder: boolean; preorder_ship_days: string | null;
  preorder_advance: number; pairs_with: string | null; bestseller: boolean;
};
type CategoryRow = { slug: string; name: string; grp: Category["group"] };

export async function getCatalog(): Promise<Catalog> {
  "use cache";
  cacheTag("catalog");
  cacheLife("minutes");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return sampleCatalog; // demo mode

  const get = async <T,>(path: string): Promise<T> => {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Could not load ${path}: ${res.status}`);
    return res.json() as Promise<T>;
  };
  const [cats, rows] = await Promise.all([
    get<CategoryRow[]>("categories?select=slug,name,grp&order=sort"),
    get<ProductRow[]>("products?select=slug,name,category_slug,price,colours,sizes,images,details,stock,is_preorder,preorder_ship_days,preorder_advance,pairs_with,bestseller&active=eq.true&order=sort,created_at"),
  ]);

  const categories: Category[] = cats.map((c) => ({ slug: c.slug, name: c.name, group: c.grp }));
  const name = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? "";
  const products: Product[] = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    category: r.category_slug,
    categoryName: name(r.category_slug),
    price: r.price,
    colours: r.colours.length ? r.colours : ["One colour"],
    sizes: r.sizes.length ? r.sizes : undefined,
    images: r.images,
    details: r.details,
    stock: r.stock,
    preorder: r.is_preorder ? { shipDays: r.preorder_ship_days ?? "", advance: r.preorder_advance } : undefined,
    pairsWith: r.pairs_with ?? undefined,
    bestseller: r.bestseller,
  }));
  return { categories, products };
}

type SettingsRow = {
  delivery_inside: number; delivery_outside: number; free_delivery_over: number; addon_enabled: boolean; addon_name: string;
  addon_note: string; addon_price: number; bkash_number: string; whatsapp_number: string; exchange_line: string;
  policy_text: string; facebook_url: string; instagram_url: string; capi_purchase_on?: "placed" | "confirmed";
};

// Store settings from the database (edited in the admin Settings tab). Cached like the catalogue.
export async function getSettings(): Promise<Settings> {
  "use cache";
  cacheTag("catalog");
  cacheLife("minutes");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return defaultSettings; // demo mode
  const res = await fetch(`${url}/rest/v1/settings?select=*&id=eq.1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Could not load settings: ${res.status}`);
  const r = ((await res.json()) as SettingsRow[])[0];
  if (!r) return defaultSettings;
  return {
    ...defaultSettings,
    whatsappNumber: r.whatsapp_number ?? "",
    bkashNumber: r.bkash_number ?? "",
    facebookUrl: r.facebook_url ?? "",
    instagramUrl: r.instagram_url ?? "",
    delivery: { insideDhaka: r.delivery_inside, outsideDhaka: r.delivery_outside, freeOver: r.free_delivery_over },
    addOn: { enabled: r.addon_enabled ?? true, name: r.addon_name, note: r.addon_note ?? "", price: r.addon_price },
    exchangeLine: r.exchange_line ?? "",
    policyText: r.policy_text ?? "",
    capiPurchaseOn: r.capi_purchase_on === "placed" ? "placed" : "confirmed",
  };
}
