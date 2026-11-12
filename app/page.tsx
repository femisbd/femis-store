import Link from "next/link";
import { Photo } from "@/components/Photo";
import { ProductCard } from "@/components/ProductCard";
import { Shell } from "@/components/Shell";
import { config, taka } from "@/lib/config";
import { getCatalog } from "@/lib/catalog";

export default async function Home() {
  const { categories, products } = await getCatalog();
  const bestsellers = products.filter((p) => p.bestseller).slice(0, 4);
  return (
    <Shell>
      <section className="hero">
        <div className="hero-text">
          <span className="eyebrow">The Bridal Edit</span>
          <h1 className="hero-title">Carried to every celebration.</h1>
          <p className="hero-sub">Clutches, purses and shoes for weddings, parties and every evening in between.</p>
          <div className="hero-cta">
            <Link href="/category/all" className="btn">Shop the collection</Link>
            <Link href="/category/pre-order" className="text-link">Pre-order now</Link>
          </div>
        </div>
        {/* TODO: replace this block with the real hero photo */}
        <div className="hero-art">
          <div className="circle" aria-hidden="true" />
          <div className="block" aria-hidden="true" />
          <div className="tag">Hero photo — bridal clutch, model shot</div>
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2 className="h2">Shop by category</h2>
          <Link href="/category/all" className="text-link">View all</Link>
        </div>
        <div className="grid">
          {categories.map((c) => (
            <Link key={c.slug} href={`/category/${c.slug}`} className="tile">
              <div className="tile-img"><Photo alt={c.name} label="Category photo" /></div>
              <div className="tile-label"><span>{c.name}</span><span aria-hidden="true">→</span></div>
            </Link>
          ))}
          <Link href="/category/pre-order" className="tile">
            <div className="tile-pre"><span className="dot" aria-hidden="true" /><span>Reserve the next arrivals</span></div>
            <div className="tile-label"><span>Pre-order</span><span aria-hidden="true">→</span></div>
          </Link>
        </div>
      </section>

      <section className="wrap section" style={{ paddingBottom: 104 }}>
        <div className="section-head">
          <h2 className="h2">Bestsellers</h2>
          <Link href="/category/all" className="text-link">Shop all</Link>
        </div>
        <div className="grid">
          {bestsellers.map((p) => <ProductCard key={p.slug} product={p} showCategory />)}
        </div>
      </section>

      <section className="band">
        <div className="wrap band-inner">
          <div className="band-left">
            <span className="eyebrow"><span className="dot" aria-hidden="true" />Pre-order</span>
            <h2 className="band-title">Reserve yours before it arrives.</h2>
            <Link href="/category/pre-order" className="btn btn-light">See pre-order pieces</Link>
          </div>
          <ol className="steps">
            <li><span className="num">01</span><div><span className="t">Reserve your piece</span><span className="d">Some pieces need no advance. Others ask for a small advance by bKash. Each product page tells you which.</span></div></li>
            <li><span className="num">02</span><div><span className="t">We prepare your order</span><span className="d">The expected shipping date is shown before you order, and we message you when it ships.</span></div></li>
            <li><span className="num">03</span><div><span className="t">Pay the rest on delivery</span><span className="d">Your parcel comes by courier with a tracking link, and you pay the balance at your door.</span></div></li>
          </ol>
        </div>
      </section>

      <section className="wrap trust">
        <div><h3>Delivery across Bangladesh</h3><p>{taka(config.delivery.insideDhaka)} inside Dhaka city and {taka(config.delivery.outsideDhaka)} outside Dhaka city. Free over {taka(config.delivery.freeOver)}.</p></div>
        <div><h3>Exchange and refund</h3><p>{config.exchangeLine}</p></div>
        <div><h3>Order on WhatsApp</h3><p>Prefer to chat? Message us on {config.whatsappNumber || "[WHATSAPP NUMBER]"} and we will place the order for you.</p></div>
      </section>
    </Shell>
  );
}
