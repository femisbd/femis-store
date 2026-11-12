import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gallery } from "@/components/Gallery";
import { ProductBuy } from "@/components/ProductBuy";
import { ProductCard } from "@/components/ProductCard";
import { Shell } from "@/components/Shell";
import { categoryName, getProduct, isAvailable, products } from "@/lib/products";

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: PageProps<"/product/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const product = getProduct(slug);
  return { title: product?.name ?? "Not found" };
}

export default async function ProductPage(props: PageProps<"/product/[slug]">) {
  const { slug } = await props.params;
  const product = getProduct(slug);
  if (!product) notFound();

  const pairCandidate = product.pairsWith ? getProduct(product.pairsWith) : undefined;
  const pair = pairCandidate && isAvailable(pairCandidate) ? pairCandidate : undefined;
  const related = [
    ...products.filter((p) => p.category === product.category && p.slug !== product.slug),
    ...products.filter((p) => p.category !== product.category && p.slug !== pair?.slug),
  ].slice(0, 4);

  return (
    <Shell>
      <div className="wrap" style={{ paddingTop: 48 }}>
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link href="/">Home</Link><span aria-hidden="true">/</span>
          <Link href={`/category/${product.category}`}>{categoryName(product.category)}</Link><span aria-hidden="true">/</span>
          <span aria-current="page">{product.name}</span>
        </nav>
      </div>
      <section className="wrap product">
        <Gallery images={product.images} name={product.name} />
        <ProductBuy product={product} pair={pair} />
      </section>
      <section className="wrap related">
        <h2 className="h2">You may also like</h2>
        <div className="grid">{related.map((p) => <ProductCard key={p.slug} product={p} showCategory />)}</div>
      </section>
    </Shell>
  );
}
