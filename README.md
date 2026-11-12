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

## What works now

- Home, category, product (available and pre-order), side cart, checkout, thank-you and tracking pages.
- Cart saved in the browser, free delivery bar, "Complete the look", checkout add-on.
- Checkout validates the form and recalculates every price on the server (`app/api/orders/route.ts`).

## What is NOT built yet

- Orders are not stored. `app/api/orders/route.ts` only writes them to the server log.
- Order tracking only answers the demo code `DEMO`.
- No admin panel, database, Steadfast booking, SMS, Meta Conversions API or profit dashboard yet.
- Policy pages are waiting for the policy text.
