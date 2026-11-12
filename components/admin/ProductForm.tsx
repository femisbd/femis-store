"use client";

import { useEffect, useRef, useState } from "react";
import { taka } from "@/lib/config";
import { supabase } from "@/lib/supabase-browser";

export type ProductRow = {
  id: string; slug: string; name: string; category_slug: string; price: number; colours: string[]; sizes: string[];
  images: string[]; details: string; stock: number; is_preorder: boolean; preorder_ship_days: string | null;
  preorder_advance: number; pairs_with: string | null; bestseller: boolean; active: boolean; sort: number;
};
type Category = { slug: string; name: string; grp: string };

const BUCKET = "products";
const SHOE_SIZES = "36, 37, 38, 39, 40";

const toSlug = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g, "").trim().replace(/[\s-]+/g, "-").slice(0, 60);
const toList = (s: string) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))];

// Resize to at most 1600 px on the longest side and save as WebP, so photos load fast on mobile data.
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process image"))), "image/webp", 0.82));
}

// Storage path from a public photo URL (used to delete removed photos).
const storagePath = (url: string) => url.split(`/object/public/${BUCKET}/`)[1];

export function ProductForm({ product, categories, allProducts, onClose, onSaved }: {
  product: ProductRow | null; categories: Category[]; allProducts: ProductRow[]; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const isNew = !product;
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [category, setCategory] = useState(product?.category_slug ?? categories[0]?.slug ?? "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [type, setType] = useState<"ready" | "pre">(product?.is_preorder ? "pre" : "ready");
  const [stock, setStock] = useState(product ? String(product.stock) : "0");
  const [shipDays, setShipDays] = useState(product?.preorder_ship_days ?? "");
  const [advanceMode, setAdvanceMode] = useState<"none" | "partial">(product && product.preorder_advance > 0 ? "partial" : "none");
  const [advance, setAdvance] = useState(product && product.preorder_advance > 0 ? String(product.preorder_advance) : "");
  const [colours, setColours] = useState((product?.colours ?? []).join(", "));
  const [sizes, setSizes] = useState((product?.sizes ?? []).join(", "));
  const [details, setDetails] = useState(product?.details ?? "");
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [pairsWith, setPairsWith] = useState(product?.pairs_with ?? "");
  const [bestseller, setBestseller] = useState(product?.bestseller ?? false);
  const [active, setActive] = useState(product?.active ?? true);
  const [unitCost, setUnitCost] = useState("");
  const [packCost, setPackCost] = useState("");
  const [uploading, setUploading] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const isShoe = categories.find((c) => c.slug === category)?.grp === "shoes";

  useEffect(() => {
    if (product) {
      supabase().from("product_costs").select("unit_cost,packaging_cost").eq("product_id", product.id).maybeSingle().then(({ data }) => {
        if (data) {
          setUnitCost(String(data.unit_cost));
          setPackCost(String(data.packaging_cost));
        }
      });
    }
  }, [product]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // New products: sizes default to shoe sizes when a shoe category is picked.
  useEffect(() => {
    if (isNew && isShoe && !sizes) setSizes(SHOE_SIZES);
    if (isNew && !isShoe && sizes === SHOE_SIZES) setSizes("");
  }, [isShoe, isNew, sizes]);

  // After a failed save, re-check the fields as they are corrected so old messages disappear.
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (tried) validate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tried, name, slug, category, price, type, stock, shipDays, advanceMode, advance, sizes, unitCost, packCost]);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const folder = toSlug(slug || name) || "product";
    setUploading(files.length);
    const added: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const blob = await compress(file);
        const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.webp`;
        const { error } = await supabase().storage.from(BUCKET).upload(path, blob, { contentType: "image/webp", cacheControl: "31536000" });
        if (error) throw error;
        added.push(supabase().storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      } catch (e) {
        setErrors((x) => ({ ...x, images: `Could not upload ${file.name}: ${(e as Error).message}` }));
      }
      setUploading((n) => n - 1);
    }
    setImages((x) => [...x, ...added]);
    if (fileRef.current) fileRef.current.value = "";
  }

  const move = (i: number, d: -1 | 1) => setImages((x) => {
    const y = [...x];
    [y[i], y[i + d]] = [y[i + d], y[i]];
    return y;
  });

  function validate() {
    const e: Record<string, string> = {};
    const s = toSlug(slug || name);
    if (name.trim().length < 2) e.name = "Enter the product name.";
    if (!s) e.slug = "Enter a web address using letters and numbers.";
    else if (isNew && allProducts.some((p) => p.slug === s)) e.slug = "Another product already uses this web address.";
    if (!category) e.category = "Choose a category.";
    const pr = Number(price);
    if (!Number.isInteger(pr) || pr <= 0) e.price = "Enter the price in taka, as a whole number.";
    if (type === "ready" && (!Number.isInteger(Number(stock)) || Number(stock) < 0)) e.stock = "Enter how many you have, 0 or more.";
    if (type === "pre" && !shipDays.trim()) e.shipDays = "Enter when it ships, for example 15–20.";
    if (type === "pre" && advanceMode === "partial") {
      const a = Number(advance);
      if (!Number.isInteger(a) || a <= 0) e.advance = "Enter the advance amount in taka.";
      else if (a > pr) e.advance = "The advance cannot be more than the price.";
    }
    if (isShoe && toList(sizes).length === 0) e.sizes = "Shoes need at least one size.";
    for (const [k, v] of [["unitCost", unitCost], ["packCost", packCost]] as const) {
      if (v && (!Number.isInteger(Number(v)) || Number(v) < 0)) e[k] = "Enter a whole number in taka.";
    }
    setErrors((prev) => (prev.images ? { ...e, images: prev.images } : e));
    return Object.keys(e).length === 0;
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setTried(true);
    if (!validate()) return;
    setSaving(true);
    const sb = supabase();
    const row = {
      slug: toSlug(slug || name),
      name: name.trim(),
      category_slug: category,
      price: Number(price),
      colours: toList(colours),
      sizes: toList(sizes),
      images,
      details: details.trim(),
      stock: type === "ready" ? Number(stock) : 0,
      is_preorder: type === "pre",
      preorder_ship_days: type === "pre" ? shipDays.trim() : null,
      preorder_advance: type === "pre" && advanceMode === "partial" ? Number(advance) : 0,
      pairs_with: pairsWith || null,
      bestseller,
      active,
    };
    const { data, error } = isNew
      ? await sb.from("products").insert(row).select("id").single()
      : await sb.from("products").update(row).eq("id", product!.id).select("id").single();
    if (error || !data) {
      setSaving(false);
      setErrors({ form: error?.code === "23505" ? "Another product already uses this web address." : error?.message ?? "Could not save." });
      return;
    }
    if (unitCost || packCost) {
      await sb.from("product_costs").upsert({ product_id: data.id, unit_cost: Number(unitCost || 0), packaging_cost: Number(packCost || 0) });
    }
    // Delete photos that were removed from this product.
    const removed = (product?.images ?? []).filter((u) => !images.includes(u)).map(storagePath).filter(Boolean);
    if (removed.length) await sb.storage.from(BUCKET).remove(removed);
    setSaving(false);
    onSaved(isNew ? `${row.name} added.` : `${row.name} saved.`);
  }

  async function remove() {
    if (!product || !window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    const { error } = await supabase().from("products").delete().eq("id", product.id);
    if (error) {
      setErrors({ form: error.code === "23503" ? "This product has orders, so it can't be deleted. Untick \"Show on website\" to hide it instead." : error.message });
      return;
    }
    const paths = product.images.map(storagePath).filter(Boolean);
    if (paths.length) await supabase().storage.from(BUCKET).remove(paths);
    onSaved(`${product.name} deleted.`);
  }

  const profit = Number(price) - Number(unitCost || 0) - Number(packCost || 0);
  const others = allProducts.filter((p) => p.id !== product?.id);

  return (
    <div className="drawer-root">
      <button className="drawer-overlay" aria-label="Close" onClick={onClose} />
      <aside className="drawer adm-panel adm-panel-wide" role="dialog" aria-modal="true" aria-label={isNew ? "Add product" : `Edit ${product!.name}`}>
        <div className="drawer-head">
          <h2 className="adm-h1" style={{ margin: 0 }}>{isNew ? "Add product" : "Edit product"}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
          </button>
        </div>

        <form className="adm-panel-body" onSubmit={save} noValidate>
          <section className="adm-sec">
            <h3>Basics</h3>
            <F id="p-name" label="Product name" error={errors.name}>
              <input id="p-name" className="input" value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(toSlug(e.target.value)); }} />
            </F>
            <F id="p-slug" label="Web address" hint={`femisbd.com/product/${toSlug(slug || name) || "…"}`} error={errors.slug}>
              <input id="p-slug" className="input" value={slug} disabled={!isNew} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} />
            </F>
            {!isNew && <p className="muted small">The web address can't change after a product is created, so links in your ads keep working.</p>}
            <div className="adm-grid2">
              <F id="p-cat" label="Category" error={errors.category}>
                <select id="p-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </F>
              <F id="p-price" label="Price (৳)" error={errors.price}>
                <input id="p-price" className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} />
              </F>
            </div>
          </section>

          <section className="adm-sec">
            <h3>Availability</h3>
            <div className="adm-flags" role="radiogroup" aria-label="Availability">
              <label className="radio adm-radio"><input type="radio" name="type" checked={type === "ready"} onChange={() => setType("ready")} /><span>Ready to ship</span></label>
              <label className="radio adm-radio"><input type="radio" name="type" checked={type === "pre"} onChange={() => setType("pre")} /><span>Pre-order</span></label>
            </div>
            {type === "ready" ? (
              <F id="p-stock" label="Pieces in stock" error={errors.stock}>
                <input id="p-stock" className="input" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value.replace(/[^\d]/g, ""))} />
              </F>
            ) : (
              <>
                <F id="p-days" label="Ships in (days)" hint="Shown to customers, for example 15–20" error={errors.shipDays}>
                  <input id="p-days" className="input" value={shipDays} onChange={(e) => setShipDays(e.target.value)} />
                </F>
                <div className="adm-flags" role="radiogroup" aria-label="Advance">
                  <label className="radio adm-radio"><input type="radio" name="adv" checked={advanceMode === "none"} onChange={() => setAdvanceMode("none")} /><span>No advance</span></label>
                  <label className="radio adm-radio"><input type="radio" name="adv" checked={advanceMode === "partial"} onChange={() => setAdvanceMode("partial")} /><span>Partial advance by bKash</span></label>
                </div>
                {advanceMode === "partial" && (
                  <F id="p-adv" label="Advance amount (৳)" error={errors.advance}>
                    <input id="p-adv" className="input" inputMode="numeric" value={advance} onChange={(e) => setAdvance(e.target.value.replace(/[^\d]/g, ""))} />
                  </F>
                )}
              </>
            )}
          </section>

          <section className="adm-sec">
            <h3>Options</h3>
            <F id="p-colours" label="Colours" hint="Separate with commas, for example Gold, Silver, Rose gold">
              <input id="p-colours" className="input" value={colours} onChange={(e) => setColours(e.target.value)} />
            </F>
            <F id="p-sizes" label="Sizes" hint={isShoe ? "Separate with commas" : "Leave empty for bags"} error={errors.sizes}>
              <input id="p-sizes" className="input" value={sizes} onChange={(e) => setSizes(e.target.value)} />
            </F>
          </section>

          <section className="adm-sec">
            <h3>Photos</h3>
            <p className="muted small">The first photo is the main one. Photos are resized automatically for fast loading.</p>
            <ul className="adm-photos">
              {images.map((src, i) => (
                <li key={src}>
                  <img src={src} alt={`Photo ${i + 1}`} />
                  <div className="adm-photo-actions">
                    <button type="button" aria-label="Move photo left" disabled={i === 0} onClick={() => move(i, -1)}>←</button>
                    <button type="button" aria-label="Remove photo" onClick={() => setImages((x) => x.filter((u) => u !== src))}>×</button>
                    <button type="button" aria-label="Move photo right" disabled={i === images.length - 1} onClick={() => move(i, 1)}>→</button>
                  </div>
                  {i === 0 && <span className="adm-tag adm-photo-main">Main</span>}
                </li>
              ))}
              {Array.from({ length: uploading }).map((_, i) => <li key={`u${i}`} className="adm-photo-loading">Uploading…</li>)}
            </ul>
            <label className="adm-btn-ghost" style={{ alignSelf: "flex-start", cursor: "pointer" }}>
              Add photos
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} />
            </label>
            {errors.images && <p className="err" role="alert">{errors.images}</p>}
          </section>

          <section className="adm-sec">
            <h3>Description</h3>
            <F id="p-details" label="Details" hint="Material, size, strap, closure and what fits inside">
              <textarea id="p-details" className="input" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} />
            </F>
          </section>

          <section className="adm-sec">
            <h3>Selling</h3>
            <F id="p-pair" label="Complete the look" hint="Suggested with this product to raise order value">
              <select id="p-pair" className="input" value={pairsWith} onChange={(e) => setPairsWith(e.target.value)}>
                <option value="">None</option>
                {others.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
              </select>
            </F>
            <label className="adm-check"><input type="checkbox" checked={bestseller} onChange={(e) => setBestseller(e.target.checked)} />Show in Bestsellers on the home page</label>
            <label className="adm-check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Show on website</label>
          </section>

          <section className="adm-sec">
            <h3>Costs (only you can see this)</h3>
            <div className="adm-grid2">
              <F id="p-cost" label="Product cost (৳)" error={errors.unitCost}>
                <input id="p-cost" className="input" inputMode="numeric" value={unitCost} onChange={(e) => setUnitCost(e.target.value.replace(/[^\d]/g, ""))} />
              </F>
              <F id="p-pack" label="Packaging cost (৳)" error={errors.packCost}>
                <input id="p-pack" className="input" inputMode="numeric" value={packCost} onChange={(e) => setPackCost(e.target.value.replace(/[^\d]/g, ""))} />
              </F>
            </div>
            {price && (unitCost || packCost) && <p className="small">Gross profit per piece, before delivery and ads: <strong>{taka(profit)}</strong></p>}
          </section>

          {errors.form && <p className="notice" role="alert">{errors.form}</p>}
          {Object.keys(errors).some((k) => k !== "form" && k !== "images") && <p className="err" role="alert">Please fix the fields marked above.</p>}
          <div className="adm-flags" style={{ paddingTop: 12 }}>
            <button className="adm-btn" type="submit" disabled={saving || uploading > 0}>{saving ? "Saving…" : isNew ? "Add product" : "Save changes"}</button>
            <button className="adm-btn-ghost" type="button" onClick={onClose}>Cancel</button>
            {!isNew && <button className="adm-btn-danger" type="button" onClick={remove} style={{ marginLeft: "auto" }}>Delete</button>}
          </div>
        </form>
      </aside>
    </div>
  );
}

function F({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="muted small">{hint}</span>}
      {error && <span className="err" role="alert">{error}</span>}
    </div>
  );
}
