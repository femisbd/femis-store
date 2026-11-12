"use client";

import { useCallback, useEffect, useState } from "react";
import { taka } from "@/lib/config";
import { supabase } from "@/lib/supabase-browser";
import { ProductForm, type ProductRow } from "./ProductForm";

type Category = { slug: string; name: string; grp: string };

export async function refreshStore() {
  // Ask the website to show the change straight away (owner only).
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  await fetch("/api/revalidate", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}

export function ProductsView() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [stockDraft, setStockDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: p }, { data: c }] = await Promise.all([
      sb.from("products").select("*").order("sort").order("created_at"),
      sb.from("categories").select("slug,name,grp").order("sort"),
    ]);
    setRows((p as ProductRow[]) ?? []);
    setCategories((c as Category[]) ?? []);
    setStockDraft({});
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveStock(r: ProductRow) {
    const n = Number(stockDraft[r.slug]);
    if (!Number.isInteger(n) || n < 0) return setMsg("Stock must be a whole number, 0 or more.");
    const { error } = await supabase().from("products").update({ stock: n }).eq("id", r.id);
    if (error) return setMsg(error.message);
    setMsg(`Stock for ${r.name} is now ${n}.`);
    await refreshStore();
    load();
  }

  async function toggleVisible(r: ProductRow) {
    const { error } = await supabase().from("products").update({ active: !r.active }).eq("id", r.id);
    if (error) return setMsg(error.message);
    setMsg(r.active ? `${r.name} is now hidden from the website.` : `${r.name} is now shown on the website.`);
    await refreshStore();
    load();
  }

  const catName = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;

  return (
    <section>
      <div className="adm-toolbar">
        <div>
          <h1 className="adm-h1" style={{ margin: 0 }}>Products</h1>
          <p className="muted small">{rows.filter((r) => r.active).length} shown on the website · {rows.filter((r) => !r.active).length} hidden</p>
        </div>
        <button className="adm-btn" onClick={() => setEditing("new")}>Add product</button>
      </div>
      {msg && <p className="adm-ok" role="status" style={{ marginBottom: 12 }}>{msg}</p>}

      <div className="adm-table-wrap">
        <table className="adm-table adm-products">
          <thead>
            <tr><th>Product</th><th className="hide-sm">Category</th><th>Price</th><th>Stock</th><th className="hide-sm">On website</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.active ? "" : "adm-row-off"} onClick={() => setEditing(r)}>
                <td>
                  <div className="adm-prod">
                    {r.images[0] ? <img src={r.images[0]} alt="" className="adm-thumb" /> : <span className="adm-thumb adm-thumb-empty" aria-hidden="true" />}
                    <div>
                      <strong>{r.name}</strong>
                      <div className="adm-flags" style={{ marginTop: 4 }}>
                        {r.is_preorder ? <span className="adm-tag adm-tag-pre">Pre-order</span> : <span className="adm-tag">Ready to ship</span>}
                        {r.bestseller && <span className="adm-tag">Bestseller</span>}
                        {!r.active && <span className="adm-tag adm-tag-warn">Hidden</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="hide-sm">{catName(r.category_slug)}</td>
                <td className="nowrap">{taka(r.price)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {r.is_preorder ? (
                    <span className="muted small">Pre-order</span>
                  ) : (
                    <form className="adm-stock" onSubmit={(e) => { e.preventDefault(); saveStock(r); }}>
                      <label className="sr-only" htmlFor={`stock-${r.id}`}>Stock for {r.name}</label>
                      <input id={`stock-${r.id}`} className="input" inputMode="numeric" value={stockDraft[r.slug] ?? String(r.stock)} onChange={(e) => setStockDraft({ ...stockDraft, [r.slug]: e.target.value })} />
                      {stockDraft[r.slug] !== undefined && stockDraft[r.slug] !== String(r.stock) && <button className="adm-btn" type="submit">Save</button>}
                      {r.stock === 0 && stockDraft[r.slug] === undefined && <span className="adm-tag adm-tag-warn">Sold out</span>}
                    </form>
                  )}
                </td>
                <td className="hide-sm" onClick={(e) => e.stopPropagation()}>
                  <button className="adm-btn-ghost" onClick={() => toggleVisible(r)}>{r.active ? "Hide" : "Show"}</button>
                </td>
                <td><button className="adm-link" onClick={(e) => { e.stopPropagation(); setEditing(r); }}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <p className="adm-empty muted">Loading…</p>}
        {!loading && rows.length === 0 && <p className="adm-empty muted">No products yet. Click "Add product".</p>}
      </div>

      {editing && (
        <ProductForm
          product={editing === "new" ? null : editing}
          categories={categories}
          allProducts={rows}
          onClose={() => setEditing(null)}
          onSaved={async (text) => {
            setEditing(null);
            setMsg(text);
            await refreshStore();
            load();
          }}
        />
      )}
    </section>
  );
}
