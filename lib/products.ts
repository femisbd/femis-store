// Product types and helpers. The real catalogue comes from the database (lib/catalog.ts).
// The SAMPLE data below is used only in demo mode, when the Supabase settings are missing.

export type Category = { slug: string; name: string; group: "clutches" | "purses" | "shoes" };

export const categories: Category[] = [
  { slug: "party-clutch", name: "Party Clutch", group: "clutches" },
  { slug: "bridal-clutch", name: "Bridal Clutch", group: "clutches" },
  { slug: "embroidery-clutch", name: "Embroidery Clutch", group: "clutches" },
  { slug: "purse", name: "Purse", group: "purses" },
  { slug: "heels", name: "Heels", group: "shoes" },
  { slug: "slippers", name: "Slippers", group: "shoes" },
  { slug: "sneakers", name: "Sneakers", group: "shoes" },
];

export type Product = {
  slug: string;
  name: string;
  category: string; // category slug
  categoryName: string;
  price: number;
  colours: string[];
  sizes?: string[]; // shoes only
  images: string[]; // full photo URLs. Empty = placeholder box.
  details: string;
  stock: number; // ignored for pre-order products
  preorder?: { shipDays: string; advance: number }; // advance 0 = no advance needed
  pairsWith?: string; // slug of the "Complete the look" product
  bestseller?: boolean;
};

const SHOE_SIZES = ["36", "37", "38", "39", "40"];
const DETAILS = "[MATERIAL, SIZE, STRAP, CLOSURE AND WHAT FITS INSIDE]";

function p(x: Omit<Product, "images" | "details" | "colours" | "categoryName"> & Partial<Product>): Product {
  return { images: [], details: DETAILS, colours: ["Colour 1", "Colour 2", "Colour 3"], categoryName: categories.find((c) => c.slug === x.category)?.name ?? "", ...x };
}

const sampleProducts: Product[] = [
  p({ slug: "sample-bridal-clutch-01", name: "Sample Bridal Clutch 01", category: "bridal-clutch", price: 2800, stock: 0, preorder: { shipDays: "15–20", advance: 500 }, pairsWith: "sample-heels-01", bestseller: true }),
  p({ slug: "sample-bridal-clutch-02", name: "Sample Bridal Clutch 02", category: "bridal-clutch", price: 2600, stock: 6, pairsWith: "sample-heels-01" }),
  p({ slug: "sample-bridal-clutch-03", name: "Sample Bridal Clutch 03", category: "bridal-clutch", price: 3200, stock: 0, preorder: { shipDays: "15–20", advance: 0 }, pairsWith: "sample-heels-02" }),
  p({ slug: "sample-party-clutch-01", name: "Sample Party Clutch 01", category: "party-clutch", price: 1900, stock: 8, pairsWith: "sample-heels-02", bestseller: true }),
  p({ slug: "sample-party-clutch-02", name: "Sample Party Clutch 02", category: "party-clutch", price: 2100, stock: 3, pairsWith: "sample-heels-01" }),
  p({ slug: "sample-embroidery-clutch-01", name: "Sample Embroidery Clutch 01", category: "embroidery-clutch", price: 2400, stock: 0, preorder: { shipDays: "20–25", advance: 500 }, pairsWith: "sample-slippers-01", bestseller: true }),
  p({ slug: "sample-embroidery-clutch-02", name: "Sample Embroidery Clutch 02", category: "embroidery-clutch", price: 2300, stock: 5, pairsWith: "sample-slippers-01" }),
  p({ slug: "sample-purse-01", name: "Sample Purse 01", category: "purse", price: 1500, stock: 10, pairsWith: "sample-slippers-02" }),
  p({ slug: "sample-purse-02", name: "Sample Purse 02", category: "purse", price: 1700, stock: 4, pairsWith: "sample-sneakers-01" }),
  p({ slug: "sample-heels-01", name: "Sample Heels 01", category: "heels", price: 2200, stock: 7, sizes: SHOE_SIZES, pairsWith: "sample-bridal-clutch-02", bestseller: true }),
  p({ slug: "sample-heels-02", name: "Sample Heels 02", category: "heels", price: 2500, stock: 0, sizes: SHOE_SIZES, preorder: { shipDays: "15–20", advance: 500 }, pairsWith: "sample-party-clutch-01" }),
  p({ slug: "sample-slippers-01", name: "Sample Slippers 01", category: "slippers", price: 1200, stock: 9, sizes: SHOE_SIZES, pairsWith: "sample-embroidery-clutch-02" }),
  p({ slug: "sample-slippers-02", name: "Sample Slippers 02", category: "slippers", price: 1100, stock: 2, sizes: SHOE_SIZES, pairsWith: "sample-purse-01" }),
  p({ slug: "sample-sneakers-01", name: "Sample Sneakers 01", category: "sneakers", price: 2000, stock: 6, sizes: SHOE_SIZES, pairsWith: "sample-purse-02" }),
  p({ slug: "sample-sneakers-02", name: "Sample Sneakers 02", category: "sneakers", price: 2300, stock: 0, sizes: SHOE_SIZES, preorder: { shipDays: "20–25", advance: 0 }, pairsWith: "sample-purse-02" }),
];

export type Catalog = { categories: Category[]; products: Product[] };
export const sampleCatalog: Catalog = { categories, products: sampleProducts };

export const findProduct = (products: Product[], slug: string) => products.find((x) => x.slug === slug);
export const isAvailable = (x: Product) => !!x.preorder || x.stock > 0;

export type Listing = { slug: string; title: string; intro: string; products: Product[] };

const groups: Record<string, { title: string; filter: (x: Product, c: Catalog) => boolean }> = {
  all: { title: "All pieces", filter: () => true },
  clutches: { title: "Clutches", filter: (x, c) => c.categories.find((k) => k.slug === x.category)?.group === "clutches" },
  purses: { title: "Purses", filter: (x, c) => c.categories.find((k) => k.slug === x.category)?.group === "purses" },
  shoes: { title: "Shoes", filter: (x, c) => c.categories.find((k) => k.slug === x.category)?.group === "shoes" },
  "pre-order": { title: "Pre-order", filter: (x) => !!x.preorder },
};

export const listingSlugs = (c: Catalog) => [...Object.keys(groups), ...c.categories.map((k) => k.slug)];

export function getListing(c: Catalog, slug: string): Listing | undefined {
  const intro = "[ONE LINE ABOUT THIS COLLECTION]";
  const g = groups[slug];
  if (g) return { slug, title: g.title, intro, products: c.products.filter((x) => g.filter(x, c)) };
  const k = c.categories.find((x) => x.slug === slug);
  if (k) return { slug, title: k.name, intro, products: c.products.filter((x) => x.category === slug) };
  return undefined;
}
