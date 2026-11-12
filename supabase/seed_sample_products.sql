-- =====================================================================
-- SAMPLE products for testing. NOT real names, prices or stock.
-- Run after 0001_init.sql. Delete these once the real products are entered:
--   delete from public.products where slug like 'sample-%';
-- (only works before any order uses them; otherwise set active = false)
-- =====================================================================
insert into public.products (slug, name, category_slug, price, colours, sizes, stock, is_preorder, preorder_ship_days, preorder_advance, pairs_with, bestseller, sort, details)
select slug, name, cat, price, array['Colour 1','Colour 2','Colour 3'],
       case when cat in ('heels','slippers','sneakers') then array['36','37','38','39','40'] else '{}'::text[] end,
       stock, pre, ship, adv, pair, best, n, '[MATERIAL, SIZE, STRAP, CLOSURE AND WHAT FITS INSIDE]'
from (values
  (1,  'sample-bridal-clutch-01',     'Sample Bridal Clutch 01',     'bridal-clutch',     2800, 0,  true,  '15–20', 500, 'sample-heels-01',             true),
  (2,  'sample-bridal-clutch-02',     'Sample Bridal Clutch 02',     'bridal-clutch',     2600, 6,  false, null,    0,   'sample-heels-01',             false),
  (3,  'sample-bridal-clutch-03',     'Sample Bridal Clutch 03',     'bridal-clutch',     3200, 0,  true,  '15–20', 0,   'sample-heels-02',             false),
  (4,  'sample-party-clutch-01',      'Sample Party Clutch 01',      'party-clutch',      1900, 8,  false, null,    0,   'sample-heels-02',             true),
  (5,  'sample-party-clutch-02',      'Sample Party Clutch 02',      'party-clutch',      2100, 3,  false, null,    0,   'sample-heels-01',             false),
  (6,  'sample-embroidery-clutch-01', 'Sample Embroidery Clutch 01', 'embroidery-clutch', 2400, 0,  true,  '20–25', 500, 'sample-slippers-01',          true),
  (7,  'sample-embroidery-clutch-02', 'Sample Embroidery Clutch 02', 'embroidery-clutch', 2300, 5,  false, null,    0,   'sample-slippers-01',          false),
  (8,  'sample-purse-01',             'Sample Purse 01',             'purse',             1500, 10, false, null,    0,   'sample-slippers-02',          false),
  (9,  'sample-purse-02',             'Sample Purse 02',             'purse',             1700, 4,  false, null,    0,   'sample-sneakers-01',          false),
  (10, 'sample-heels-01',             'Sample Heels 01',             'heels',             2200, 7,  false, null,    0,   'sample-bridal-clutch-02',     true),
  (11, 'sample-heels-02',             'Sample Heels 02',             'heels',             2500, 0,  true,  '15–20', 500, 'sample-party-clutch-01',      false),
  (12, 'sample-slippers-01',          'Sample Slippers 01',          'slippers',          1200, 9,  false, null,    0,   'sample-embroidery-clutch-02', false),
  (13, 'sample-slippers-02',          'Sample Slippers 02',          'slippers',          1100, 2,  false, null,    0,   'sample-purse-01',             false),
  (14, 'sample-sneakers-01',          'Sample Sneakers 01',          'sneakers',          2000, 6,  false, null,    0,   'sample-purse-02',             false),
  (15, 'sample-sneakers-02',          'Sample Sneakers 02',          'sneakers',          2300, 0,  true,  '20–25', 0,   'sample-purse-02',             false)
) as t(n, slug, name, cat, price, stock, pre, ship, adv, pair, best);
