"use client";

import { useMemo, useState } from "react";
import type { Product } from "@/lib/products";
import { ProductCard } from "./ProductCard";

type Filter = "all" | "ready" | "pre";
type Sort = "new" | "low" | "high";

export function Listing({ products }: { products: Product[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("new");
  const hasBoth = products.some((p) => p.preorder) && products.some((p) => !p.preorder);

  const shown = useMemo(() => {
    const list = products.filter((p) => filter === "all" || (filter === "pre" ? !!p.preorder : !p.preorder));
    if (sort === "low") return [...list].sort((a, b) => a.price - b.price);
    if (sort === "high") return [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [products, filter, sort]);

  const chips: [Filter, string][] = [["all", "All"], ["ready", "Ready to ship"], ["pre", "Pre-order"]];

  return (
    <>
      <div className="wrap">
        <div className="filters">
          {hasBoth ? (
            <div className="chips" role="group" aria-label="Availability">
              {chips.map(([id, label]) => (
                <button key={id} className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
              ))}
            </div>
          ) : <span />}
          <div className="sort">
            <span className="muted" aria-live="polite">{shown.length} {shown.length === 1 ? "piece" : "pieces"}</span>
            <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="caps">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="new">Newest first</option>
                <option value="low">Price: low to high</option>
                <option value="high">Price: high to low</option>
              </select>
            </label>
          </div>
        </div>
      </div>
      <div className="wrap listing">
        {shown.length ? (
          <div className="grid">{shown.map((p) => <ProductCard key={p.slug} product={p} />)}</div>
        ) : (
          <p className="muted">No pieces match this filter.</p>
        )}
      </div>
    </>
  );
}
