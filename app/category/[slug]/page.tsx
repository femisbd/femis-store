import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Listing } from "@/components/Listing";
import { Shell } from "@/components/Shell";
import { getListing, listingSlugs } from "@/lib/products";

export function generateStaticParams() {
  return listingSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata(props: PageProps<"/category/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  return { title: getListing(slug)?.title ?? "Not found" };
}

export default async function CategoryPage(props: PageProps<"/category/[slug]">) {
  const { slug } = await props.params;
  const listing = getListing(slug);
  if (!listing) notFound();
  return (
    <Shell>
      <section className="wrap page-head">
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">{listing.title}</span>
        </nav>
        <h1 className="h1">{listing.title}</h1>
        <p className="lead">{listing.intro}</p>
      </section>
      <Listing products={listing.products} />
    </Shell>
  );
}
