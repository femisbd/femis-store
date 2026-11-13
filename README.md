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
| Delivery charges, free delivery amount, add-on, WhatsApp and bKash numbers, exchange policy | Admin panel, Settings tab |
| Products, prices, colours, sizes, stock, pre-order settings, photos | Admin panel, Products tab |
| Colours and fonts for the whole site | top of `app/globals.css` |
| Home page text and hero | `app/page.tsx` |

Without the Supabase settings the site runs in demo mode with the sample products in `lib/products.ts`.

## Database (Supabase)

The database setup is in `supabase/`:

1. `supabase/migrations/0001_init.sql`: tables, security rules and the order functions. Run once.
2. `supabase/seed_sample_products.sql`: 15 SAMPLE products for testing. Optional.
3. `supabase/migrations/0002_admin.sql`: admin panel rules. Run once, after file 1.
4. `supabase/migrations/0003_products_admin.sql`: product photo storage and product rules. Run once, after file 3.
5. `supabase/migrations/0004_settings.sql`: settings editable from the admin. Run once, after file 4.
6. `supabase/migrations/0005_profit.sql`: profit and loss report, cost snapshots and ad spend. Run once, after file 5.
7. `supabase/migrations/0006_courier_tracking.sql`: Steadfast and Meta tracking. Run once, after file 6.
8. `supabase/migrations/0007_customers_coupons.sql`: incomplete orders, customers and coupons. Run once, after file 7.
9. `supabase/migrations/0008_manual_orders.sql`: orders entered by staff. Run once, after file 8.
10. `supabase/add_staff_member.sql`: run once per staff member to give them admin access.

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
- Admin panel at `/admin`: staff login, orders by status with counts, search by order number or phone,
  order details with call and WhatsApp buttons, customer's past delivery record, bKash advance check,
  status changes with notes and history, address and staff note editing, and the pre-order sourcing list.
- Products tab (owner only): add and edit products, prices, stock, pre-order and advance settings, colours,
  sizes, photos (resized automatically), "Complete the look", bestsellers, hide or show, and private costs.
  The store reads products from the database and shows changes straight after saving.
- Settings tab (owner only): delivery charges, free delivery amount, checkout add-on, bKash and WhatsApp numbers,
  social links, exchange promise and the full policy page (`/policy`).
- Profit tab (owner only): net profit, delivered sales, ad spend and ROAS, delivery rate, average order,
  by day and by product, with daily ad spend entry. Costs are saved with each order when it is placed.
- Steadfast: book one order or all packed orders, delivery status sync (delivered and returned update the
  order and stock), and the customer's Steadfast delivery record shown before confirming.
- Meta: browser Pixel (PageView, ViewContent, AddToCart, InitiateCheckout) and server-side Purchase through the
  Conversions API, sent when staff confirm the order (or when it is placed, set in Settings). The order number is
  the event id, so browser and server events are counted once.
- Both stay switched off until their keys are added in Netlify (see `.env.example`).
- Incomplete orders: checkout details are saved once a valid phone number is typed; staff see unfinished
  checkouts after 10 minutes, with call and WhatsApp buttons, a result and a note. They disappear when that number orders.
- Customers: orders, deliveries, returns and spend per phone number, repeat and risky tags, block a number from
  ordering online, and (owner) export a CSV for Meta custom audiences.
- Coupons (owner): percent (with an optional cap), taka off, or free delivery; minimum order, dates, total uses and
  uses per customer; results per coupon from delivered orders. Discounts apply to products only.
- New order (owner and order staff): enter Messenger, WhatsApp, phone and Instagram orders with the same price and
  stock rules, a returning customer's details filled in from the phone number, delivery charge, discount and advance,
  saved as Confirmed or New. These orders are tagged by source and are not sent to Meta as website purchases.
- Staff roles: owner and order staff see everything; packing staff see only "To pack" and "Packed"
  and can only mark confirmed orders as packed. Prices and totals can never be edited.

## What is NOT built yet

- SMS (no provider chosen yet).
- Policy pages are waiting for the policy text.
