import Link from "next/link";
import { taka } from "@/lib/config";
import type { Product } from "@/lib/products";
import { Photo } from "./Photo";

export function ProductCard({ product, showCategory = false }: { product: Product; showCategory?: boolean }) {
  const pre = product.preorder;
  return (
    <Link href={`/product/${product.slug}`} className="card">
      <div className="card-img">
        <Photo src={product.images[0]} alt={product.name} />
        {pre ? <span className="badge badge-pre">Pre-order</span> : product.stock > 0 ? <span className="badge badge-ready">Ready to ship</span> : <span className="badge badge-ready">Sold out</span>}
      </div>
      <div className="card-text">
        {showCategory && <span className="eyebrow-sm">{product.categoryName}</span>}
        <span className="card-name">{product.name}</span>
        <span>{taka(product.price)}</span>
        {!showCategory && <span className="muted small">{pre ? `Ships in ${pre.shipDays} days` : product.stock > 0 ? (product.stock <= 3 ? `Only ${product.stock} left` : "In stock") : "Sold out"}</span>}
      </div>
    </Link>
  );
}
