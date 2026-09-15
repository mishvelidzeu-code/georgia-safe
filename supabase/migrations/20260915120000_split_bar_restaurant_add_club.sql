-- "Bar / restaurant" becomes two separate categories and "club" is added.
-- Existing combined listings are mapped to 'restaurant' before the new
-- constraint is applied, so the migration never fails on live rows.
update public.partner_listings
  set category = 'restaurant'
  where category = 'bar_restaurant';

alter table public.partner_listings
  drop constraint if exists partner_listings_category_check;

alter table public.partner_listings
  add constraint partner_listings_category_check
  check (category in (
    'car_rental', 'bar', 'restaurant', 'club', 'currency_exchange',
    'airport_transfer', 'hotel', 'tour', 'other'
  ));
