# FEMIS storefront

The customer-facing website for FEMIS (femisbd.com), built with Next.js.
This is stage 1 of the build: the storefront. It runs with SAMPLE products and does not save orders yet.

## Run it on your computer

1. Install Node.js 20 or newer from nodejs.org.
2. Open a terminal in this folder and run `npm install` (first time only).
3. Run `npm run dev` and open http://localhost:3000.

## Where to change things

| What | File |
|---|---|
| Delivery charges, free delivery amount, add-on, WhatsApp and bKash numbers, exchange line | `lib/config.ts` |
| Products, prices, colours, sizes, stock, pre-order settings | `lib/products.ts` |
| Colours and fonts for the whole site | top of `app/globals.css` |
| Home page text and hero | `app/page.tsx` |

To add a product photo: put the file in `public/products/` and add its path to the product's
`images` list in `lib/products.ts`, for example `images: ["/products/bridal-01-a.jpg"]`.

## How a product becomes a pre-order

In `lib/products.ts`, add `preorder: { shipDays: "15–20", advance: 500 }` to the product.
Use `advance: 0` for a pre-order with no advance. Remove the line and set `stock` for an available product.

## Database (Supabase)

The database setup is in `supabase/`:

1. `supabase/migrations/0001_init.sql`: tables, security rules and the order functions. Run once.
2. `supabase/seed_sample_products.sql`: 15 SAMPLE products for testing. Optional.

To run a file: open the Supabase project, go to SQL Editor, click New query, paste the whole file, click Run.

The site needs two settings (see `.env.example`). Without them it runs in demo mode and saves nothing:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## What works now

- Home, category, product (available and pre-order), side cart, checkout, thank-you and tracking pages.
- Cart saved in the browser, free delivery bar, "Complete the look", checkout add-on.
- Orders are saved in the database by `place_order`, which recalculates every price, checks and reduces stock,
  and refuses bad input. Nothing is saved unless every check passes.
- Order tracking by order number (FM10001) or mobile number shows status only, never name or address.
- Staff roles in the database: owner, orders, packing (used by the admin panel).

## What is NOT built yet

- Admin panel (the database is ready for it).
- The storefront still shows products from `lib/products.ts`. The database has its own copy of the
  same sample products. The admin panel stage switches the storefront to read from the database.
- Steadfast booking, SMS, Meta Conversions API and the profit dashboard.
- Policy pages are waiting for the policy text.
